import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { synchronizeIndexes } from '../../configs/mongodb.js';
import {
  reviewIndexes,
  normalizeIndexKey,
} from '../../migrations/reviewIndexes.js';

describe('Production Index Synchronization & Safety Architecture (High Priority)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('1. Startup Protection & Production Safety Guards', () => {
    it('skips automatic startup index synchronization in production mode', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_PRODUCTION_INDEX_SYNC;

      // Mock connected state
      const readyStateSpy = vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);

      const result = await synchronizeIndexes();
      expect(result.skipped).toBe(true);
      expect(result.reason).toContain('Automatic startup index synchronization disabled in production');

      readyStateSpy.mockRestore();
    });

    it('returns skipped notice immediately when MongoDB is disconnected', async () => {
      const readyStateSpy = vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(0);

      const result = await synchronizeIndexes();
      expect(result.skipped).toBe(true);
      expect(result.reason).toContain('MongoDB is disconnected');

      readyStateSpy.mockRestore();
    });

    it('allows index synchronization in production only when explicitly forced', async () => {
      process.env.NODE_ENV = 'production';

      const readyStateSpy = vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);

      const mockModel = {
        modelName: 'MockModel',
        createIndexes: vi.fn().mockResolvedValue(true),
        syncIndexes: vi.fn().mockResolvedValue([]),
      };

      const originalModels = { ...mongoose.models };
      mongoose.models.MockModel = mockModel;

      const result = await synchronizeIndexes({ force: true });
      expect(result.skipped).toBeUndefined();
      expect(mockModel.createIndexes).toHaveBeenCalledTimes(1);
      expect(mockModel.syncIndexes).not.toHaveBeenCalled();

      delete mongoose.models.MockModel;
      readyStateSpy.mockRestore();
    });
  });

  describe('2. Non-Destructive Index Creation vs Destructive Drop Prevention', () => {
    it('uses createIndexes (non-destructive) by default, protecting external/DBA indexes from deletion', async () => {
      process.env.NODE_ENV = 'development';

      const readyStateSpy = vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);

      const mockModel = {
        modelName: 'JobRequirementTest',
        createIndexes: vi.fn().mockResolvedValue(true),
        syncIndexes: vi.fn().mockResolvedValue([]),
      };

      mongoose.models.JobRequirementTest = mockModel;

      const result = await synchronizeIndexes({ allowDrop: false, models: ['JobRequirementTest'] });

      expect(mockModel.createIndexes).toHaveBeenCalled();
      expect(mockModel.syncIndexes).not.toHaveBeenCalled();
      expect(result.indexesDropped).toBe(0);

      delete mongoose.models.JobRequirementTest;
      readyStateSpy.mockRestore();
    });

    it('refuses to drop indexes when allowDrop is true unless ALLOW_DESTRUCTIVE_INDEX_DROP=true is set', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.ALLOW_DESTRUCTIVE_INDEX_DROP;

      const readyStateSpy = vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);

      const mockModel = {
        modelName: 'CandidateTest',
        createIndexes: vi.fn().mockResolvedValue(true),
        syncIndexes: vi.fn().mockResolvedValue(['dropped_idx_1']),
      };

      mongoose.models.CandidateTest = mockModel;

      // Request allowDrop: true without env flag
      const result = await synchronizeIndexes({ allowDrop: true, models: ['CandidateTest'] });

      // Must remain non-destructive (createIndexes called, NOT syncIndexes)
      expect(mockModel.createIndexes).toHaveBeenCalled();
      expect(mockModel.syncIndexes).not.toHaveBeenCalled();
      expect(result.indexesDropped).toBe(0);

      delete mongoose.models.CandidateTest;
      readyStateSpy.mockRestore();
    });

    it('executes destructive syncIndexes only when explicitly authorized by both parameter and env flag', async () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_DESTRUCTIVE_INDEX_DROP = 'true';

      const readyStateSpy = vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);

      const mockModel = {
        modelName: 'AdminSyncTest',
        createIndexes: vi.fn().mockResolvedValue(true),
        syncIndexes: vi.fn().mockResolvedValue(['obsolete_idx_1', 'temp_idx_2']),
      };

      mongoose.models.AdminSyncTest = mockModel;

      const result = await synchronizeIndexes({ allowDrop: true, models: ['AdminSyncTest'] });

      expect(mockModel.syncIndexes).toHaveBeenCalled();
      expect(result.indexesDropped).toBe(2);

      delete mongoose.models.AdminSyncTest;
      readyStateSpy.mockRestore();
    });
  });

  describe('3. Build Duration Monitoring & Telemetry', () => {
    it('tracks and reports execution duration for each model and total elapsed time', async () => {
      process.env.NODE_ENV = 'development';

      const readyStateSpy = vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(1);

      const mockModel = {
        modelName: 'TelemetryModel',
        createIndexes: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 10));
          return true;
        }),
      };

      mongoose.models.TelemetryModel = mockModel;

      const result = await synchronizeIndexes({ models: ['TelemetryModel'] });

      expect(result.totalDurationMs).toBeGreaterThanOrEqual(5);
      expect(result.details.length).toBe(1);
      expect(result.details[0].model).toBe('TelemetryModel');
      expect(result.details[0].durationMs).toBeGreaterThanOrEqual(5);

      delete mongoose.models.TelemetryModel;
      readyStateSpy.mockRestore();
    });
  });

  describe('4. Pre-Deployment Index Review Tooling (reviewIndexes)', () => {
    it('normalizes index keys deterministically regardless of key property order', () => {
      const key1 = { status: 1, nextRetryAt: 1 };
      const key2 = { nextRetryAt: 1, status: 1 };

      expect(normalizeIndexKey(key1)).toBe(normalizeIndexKey(key2));
    });

    it('identifies in-sync indexes, missing indexes, and flags extraneous DB indexes at risk of drop', async () => {
      const mockDb = {
        databaseName: 'thinkwires_test',
        collection: vi.fn().mockImplementation((name) => ({
          indexes: vi.fn().mockResolvedValue([
            { name: '_id_', key: { _id: 1 } },
            // In-sync index
            { name: 'status_1_nextRetryAt_1', key: { nextRetryAt: 1, status: 1 } },
            // Extraneous DBA index (at risk of deletion by syncIndexes!)
            { name: 'temp_dba_report_idx', key: { customAnalyticsTag: 1 } },
          ]),
        })),
      };

      // Mock a test model with schema index
      const mockModel = {
        modelName: 'OutboxEventReviewTest',
        collection: { name: 'outboxevents' },
        schema: {
          indexes: vi.fn().mockReturnValue([
            // In-sync index
            [{ status: 1, nextRetryAt: 1 }, { name: 'status_1_nextRetryAt_1' }],
            // Missing index in DB
            [{ aggregateType: 1, createdAt: -1 }, { name: 'idx_aggregate_created' }],
          ]),
        },
      };

      mongoose.models.OutboxEventReviewTest = mockModel;

      const report = await reviewIndexes({ silent: true, db: mockDb });

      expect(report.database).toBe('thinkwires_test');
      expect(report.inSyncCount).toBeGreaterThanOrEqual(1);
      expect(report.missingCount).toBeGreaterThanOrEqual(1);
      expect(report.extraneousCount).toBeGreaterThanOrEqual(1);

      // Verify critical warnings and recommendations
      expect(report.criticalWarnings.length).toBeGreaterThan(0);
      expect(report.criticalWarnings[0]).toContain('model.syncIndexes() would permanently delete');
      expect(report.recommendations.some((r) => r.includes('CRITICAL: Extraneous indexes exist'))).toBe(true);

      delete mongoose.models.OutboxEventReviewTest;
    });
  });
});
