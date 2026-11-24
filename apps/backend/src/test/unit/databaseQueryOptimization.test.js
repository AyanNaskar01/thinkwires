import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import {
  encodeCursor,
  decodeCursor,
  parseCursorPagination,
  buildCursorQuery,
  enforceQueryBound,
  parsePagination,
} from '../../utils/pagination.util.js';
import {
  extractStages,
  findIndexDetails,
  analyzeQueryPlan,
  isQueryPlanEfficient,
} from '../../utils/queryPlanAnalyzer.js';
import {
  slowQueryTracker,
  getSlowQueryMetrics,
  clearSlowQueryMetrics,
} from '../../utils/slowQueryLogger.js';
import {
  setupPoolMonitoring,
  getConnectionPoolMetrics,
  resetConnectionPoolMetrics,
} from '../../configs/mongodb.js';
import Candidate from '../../models/candidate.mongo.model.js';
import JobApplication from '../../models/jobApplication.mongo.model.js';
import OutboxEvent from '../../models/outboxEvent.mongo.model.js';
import Article from '../../models/article.mongo.model.js';

describe('Database Query Optimization & Performance Suite', () => {
  describe('1. Cursor-based Pagination & Query Bounding (pagination.util.js)', () => {
    it('should round-trip encode and decode cursor metadata correctly', () => {
      const original = { id: '65f1a2b3c4d5e6f7a8b9c0d1', sortValue: '2026-03-20T10:00:00.000Z' };
      const cursorStr = encodeCursor(original);

      expect(typeof cursorStr).toBe('string');
      expect(cursorStr.length).toBeGreaterThan(0);

      const decoded = decodeCursor(cursorStr);
      expect(decoded).toEqual(original);
    });

    it('should serialize Date objects to ISO strings during cursor encoding', () => {
      const now = new Date('2026-11-24T12:00:00.000Z');
      const cursorStr = encodeCursor({ id: 'app_12345', sortValue: now });
      const decoded = decodeCursor(cursorStr);

      expect(decoded.id).toBe('app_12345');
      expect(decoded.sortValue).toBe(now.toISOString());
    });

    it('should safely return null for invalid or corrupted cursors', () => {
      expect(decodeCursor(null)).toBeNull();
      expect(decodeCursor(undefined)).toBeNull();
      expect(decodeCursor('')).toBeNull();
      expect(decodeCursor('not-valid-base64-json-%%%')).toBeNull();
      expect(decodeCursor(Buffer.from('{"noId":true}').toString('base64url'))).toBeNull();
      expect(encodeCursor(null)).toBeNull();
      expect(encodeCursor({})).toBeNull();
    });

    it('should parse cursor pagination with default and ceiling limits', () => {
      // Default fallback
      const defaults = parseCursorPagination({});
      expect(defaults.limit).toBe(50);
      expect(defaults.cursor).toBeNull();
      expect(defaults.isCursorMode).toBe(false);

      // Custom query with valid cursor
      const validCursor = encodeCursor({ id: 'doc1', sortValue: '2026-01-01' });
      const parsed = parseCursorPagination({ limit: '25', cursor: validCursor }, 50, 100);
      expect(parsed.limit).toBe(25);
      expect(parsed.cursor).toEqual({ id: 'doc1', sortValue: '2026-01-01' });
      expect(parsed.isCursorMode).toBe(true);

      // Clamped to maxLimit
      const clamped = parseCursorPagination({ limit: '500' }, 50, 100);
      expect(clamped.limit).toBe(100);
    });

    it('should build deterministic index-seek MongoDB filter for descending pagination', () => {
      const baseFilter = { status: 'Applied', isDeleted: { $ne: true } };
      const cursor = { id: '65f1a2b3c4d5e6f7a8b9c0d1', sortValue: '2026-03-20T10:00:00.000Z' };

      const built = buildCursorQuery(baseFilter, cursor, 'createdAt', -1);

      expect(built.status).toBe('Applied');
      expect(built.isDeleted).toEqual({ $ne: true });
      expect(built.$or).toBeDefined();
      const targetDate = new Date(cursor.sortValue);
      expect(built.$or).toEqual([
        { createdAt: { $lt: targetDate } },
        { createdAt: targetDate, _id: { $lt: cursor.id } },
      ]);
    });

    it('should enforce hard query bound ceilings and reject unbounded queries', () => {
      expect(enforceQueryBound(undefined, 50, 100)).toBe(50);
      expect(enforceQueryBound(-10, 50, 100)).toBe(50);
      expect(enforceQueryBound(0, 50, 100)).toBe(50);
      expect(enforceQueryBound(75, 50, 100)).toBe(75);
      expect(enforceQueryBound(99999, 50, 100)).toBe(100);
    });
  });

  describe('2. Query-Plan Analyzer & Explain Utility (queryPlanAnalyzer.js)', () => {
    it('should extract execution stages and index details from explain plan trees', () => {
      const mockStage = {
        stage: 'FETCH',
        inputStage: {
          stage: 'IXSCAN',
          indexName: 'status_1_createdAt_-1',
          keyPattern: { status: 1, createdAt: -1 },
        },
      };

      const stages = extractStages(mockStage);
      expect(stages).toEqual(['FETCH', 'IXSCAN']);

      const indexDetails = findIndexDetails(mockStage);
      expect(indexDetails).toBeDefined();
      expect(indexDetails.indexName).toBe('status_1_createdAt_-1');
    });

    it('should evaluate indexed query plan as optimized', async () => {
      const mockQuery = {
        explain: vi.fn().mockResolvedValue({
          executionStats: {
            nReturned: 25,
            totalDocsExamined: 25,
            totalKeysExamined: 25,
            executionTimeMillis: 4,
            executionStages: {
              stage: 'FETCH',
              inputStage: {
                stage: 'IXSCAN',
                indexName: 'idx_applications_active',
              },
            },
          },
          queryPlanner: {
            winningPlan: { stage: 'FETCH' },
          },
        }),
      };

      const analysis = await analyzeQueryPlan(mockQuery);

      expect(analysis.success).toBe(true);
      expect(analysis.isOptimized).toBe(true);
      expect(analysis.flags.isIndexScan).toBe(true);
      expect(analysis.flags.isCollectionScan).toBe(false);
      expect(analysis.indexUsed).toBe('idx_applications_active');
      expect(analysis.warnings).toHaveLength(0);
      expect(isQueryPlanEfficient(analysis)).toBe(true);
    });

    it('should detect collection scan (COLLSCAN) and emit critical warning', async () => {
      const mockQuery = {
        explain: vi.fn().mockResolvedValue({
          executionStats: {
            nReturned: 5,
            totalDocsExamined: 10000,
            totalKeysExamined: 0,
            executionTimeMillis: 85,
            executionStages: {
              stage: 'COLLSCAN',
            },
          },
          queryPlanner: {
            winningPlan: { stage: 'COLLSCAN' },
          },
        }),
      };

      const analysis = await analyzeQueryPlan(mockQuery);

      expect(analysis.success).toBe(true);
      expect(analysis.isOptimized).toBe(false);
      expect(analysis.flags.isCollectionScan).toBe(true);
      expect(analysis.warnings.some((w) => w.includes('COLLSCAN'))).toBe(true);
      expect(isQueryPlanEfficient(analysis)).toBe(false);
    });

    it('should detect in-memory sort and high doc scan ratios', async () => {
      const mockQuery = {
        explain: vi.fn().mockResolvedValue({
          executionStats: {
            nReturned: 10,
            totalDocsExamined: 500,
            totalKeysExamined: 0,
            executionTimeMillis: 120,
            executionStages: {
              stage: 'SORT',
              inputStage: {
                stage: 'COLLSCAN',
              },
            },
          },
        }),
      };

      const analysis = await analyzeQueryPlan(mockQuery);

      expect(analysis.flags.hasInMemorySort).toBe(true);
      expect(analysis.warnings.some((w) => w.includes('In-memory sort'))).toBe(true);
      expect(analysis.warnings.some((w) => w.includes('High document-to-result scan ratio'))).toBe(true);
      expect(analysis.warnings.some((w) => w.includes('SLOW'))).toBe(true);
    });
  });

  describe('3. Slow Query Logger & Circular Metric Tracker (slowQueryLogger.js)', () => {
    beforeEach(() => {
      clearSlowQueryMetrics();
    });

    it('should track queries that exceed slow query threshold and compute metrics', () => {
      slowQueryTracker.recordQuery({
        modelName: 'JobApplication',
        operation: 'find',
        filter: { status: 'Applied' },
        durationMs: 150,
      });

      slowQueryTracker.recordQuery({
        modelName: 'Candidate',
        operation: 'aggregate',
        filter: {},
        durationMs: 250,
      });

      const metrics = getSlowQueryMetrics();
      expect(metrics.summary.totalRecorded).toBe(2);
      expect(metrics.summary.slowestQueryMs).toBe(250);
      expect(metrics.summary.avgSlowQueryDurationMs).toBe(200);
      expect(metrics.recentQueries).toHaveLength(2);
      expect(metrics.recentQueries[0].modelName).toBe('Candidate');
    });

    it('should ignore fast queries below the threshold in tracker.recordQuery', () => {
      slowQueryTracker.recordQuery({
        modelName: 'User',
        operation: 'findById',
        filter: { _id: '123' },
        durationMs: 12, // well below default 100ms threshold
      });

      const metrics = getSlowQueryMetrics();
      expect(metrics.summary.totalRecorded).toBe(0);
      expect(metrics.recentQueries).toHaveLength(0);
    });

    it('should properly clear metrics with clearSlowQueryMetrics', () => {
      slowQueryTracker.recordQuery({
        modelName: 'Article',
        operation: 'find',
        filter: {},
        durationMs: 300,
      });

      expect(getSlowQueryMetrics().summary.totalRecorded).toBe(1);
      clearSlowQueryMetrics();
      expect(getSlowQueryMetrics().summary.totalRecorded).toBe(0);
    });
  });

  describe('4. MongoDB Connection Pool Monitoring (mongodb.js)', () => {
    beforeEach(() => {
      resetConnectionPoolMetrics();
    });

    it('should accurately track CMAP connection events and maintain pool state', () => {
      const listeners = {};
      const mockClient = {
        on: vi.fn((event, handler) => {
          listeners[event] = handler;
        }),
      };

      setupPoolMonitoring(mockClient);

      // Verify listeners registered
      expect(mockClient.on).toHaveBeenCalledWith('connectionCreated', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('connectionCheckedOut', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('connectionCheckedIn', expect.any(Function));

      // Simulate connection life cycle
      listeners['connectionCreated']();
      listeners['connectionReady']();
      expect(getConnectionPoolMetrics().currentPoolSize).toBe(1);
      expect(getConnectionPoolMetrics().idleConnections).toBe(1);

      listeners['connectionCheckOutStarted']();
      listeners['connectionCheckedOut']();
      expect(getConnectionPoolMetrics().activeConnections).toBe(1);
      expect(getConnectionPoolMetrics().idleConnections).toBe(0);
      expect(getConnectionPoolMetrics().totalCheckouts).toBe(1);

      listeners['connectionCheckedIn']();
      expect(getConnectionPoolMetrics().activeConnections).toBe(0);
      expect(getConnectionPoolMetrics().idleConnections).toBe(1);

      listeners['connectionClosed']();
      expect(getConnectionPoolMetrics().currentPoolSize).toBe(0);
      expect(getConnectionPoolMetrics().idleConnections).toBe(0);
    });
  });

  describe('5. Schema Partial and Unique Indexes', () => {
    it('Candidate schema should enforce partial unique index on email for active records', () => {
      const indexes = Candidate.schema.indexes();
      const emailIndex = indexes.find(
        ([fields, options]) => fields.email === 1 && options?.unique === true
      );

      expect(emailIndex).toBeDefined();
      expect(emailIndex[1].partialFilterExpression).toEqual({
        isDeleted: false,
      });
    });

    it('OutboxEvent schema should enforce partial compound index on status and nextRetryAt', () => {
      const indexes = OutboxEvent.schema.indexes();
      const statusRetryIndex = indexes.find(
        ([fields, options]) =>
          fields.status === 1 &&
          fields.nextRetryAt === 1 &&
          options?.partialFilterExpression
      );

      expect(statusRetryIndex).toBeDefined();
      expect(statusRetryIndex[1].partialFilterExpression.status).toEqual({
        $in: ['PENDING', 'FAILED', 'PROCESSING'],
      });
    });

    it('JobApplication schema should enforce partial unique index on candidate and jobId for active pipeline stages', () => {
      const indexes = JobApplication.schema.indexes();
      const appIndex = indexes.find(
        ([fields, options]) =>
          fields.candidate === 1 &&
          fields.jobId === 1 &&
          options?.unique === true
      );

      expect(appIndex).toBeDefined();
      expect(appIndex[1].partialFilterExpression.status).toEqual({
        $in: ['Applied', 'Screening', 'Interview', 'Offered'],
      });
    });

    it('Article schema should have compound indexes on status, publishedAt, and category', () => {
      const indexes = Article.schema.indexes();
      const pubIndex = indexes.find(
        ([fields]) => fields.status === 1 && fields.publishedAt === -1
      );
      expect(pubIndex).toBeDefined();

      const catIndex = indexes.find(
        ([fields]) => fields.category === 1 && fields.status === 1
      );
      expect(catIndex).toBeDefined();
    });
  });
});
