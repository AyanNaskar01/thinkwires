import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import {
  enqueueOutboxEvent,
  fetchPendingOutboxEvents,
  claimEventForProcessing,
  markEventCompleted,
  recordEventFailure,
  calculateExponentialBackoff,
  inMemoryOutbox,
} from '../../services/outbox.service.js';
import {
  processSingleEvent,
  processNextBatch,
  registerOutboxHandler,
} from '../../services/outboxWorker.service.js';
import {
  reprocessDeadLetters,
  reconcileUsers,
  getOutboxTelemetry,
} from '../../services/reconciliation.service.js';
import { updateProfile } from '../../controllers/user.js';
import User from '../../models/user.model.js';
import UserMongo from '../../models/user.mongo.model.js';

describe('Dual Database Consistency & Transactional Outbox Engine (High Priority)', () => {
  beforeEach(() => {
    inMemoryOutbox.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    inMemoryOutbox.clear();
    vi.restoreAllMocks();
  });

  describe('1. Transactional Outbox Pattern & Event Enqueueing', () => {
    it('enqueues an outbox event with status PENDING, attempts 0, and UUID', async () => {
      const event = await enqueueOutboxEvent({
        eventType: 'USER_PROFILE_UPDATED',
        aggregateType: 'User',
        aggregateId: 'user-outbox-001',
        payload: {
          id: 'user-outbox-001',
          email: 'alex@thinkwires.com',
          name: 'Alex Rivera',
        },
      });

      expect(event).toBeDefined();
      expect(event.eventId).toBeDefined();
      expect(event.status).toBe('PENDING');
      expect(event.attempts).toBe(0);
      expect(event.maxAttempts).toBe(5);
      expect(event.aggregateId).toBe('user-outbox-001');
      expect(event.payload.email).toBe('alex@thinkwires.com');
    });

    it('suppresses duplicate events with identical idempotencyKey', async () => {
      const idempotencyKey = 'unique-idempotency-key-1234';

      const event1 = await enqueueOutboxEvent({
        eventType: 'USER_PROFILE_UPDATED',
        aggregateType: 'User',
        aggregateId: 'user-outbox-002',
        idempotencyKey,
        payload: { name: 'First Submission' },
      });

      const event2 = await enqueueOutboxEvent({
        eventType: 'USER_PROFILE_UPDATED',
        aggregateType: 'User',
        aggregateId: 'user-outbox-002',
        idempotencyKey,
        payload: { name: 'Duplicate Submission' },
      });

      expect(event1.eventId).toBe(event2.eventId);
      expect(inMemoryOutbox.events.size).toBe(1);
    });

    it('calculates exponential backoff delay within defined bounds with jitter', () => {
      const delay1 = calculateExponentialBackoff(1, 1000, 60000);
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay1).toBeLessThanOrEqual(1250);

      const delay2 = calculateExponentialBackoff(2, 1000, 60000);
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay2).toBeLessThanOrEqual(2250);

      const delay3 = calculateExponentialBackoff(3, 1000, 60000);
      expect(delay3).toBeGreaterThanOrEqual(4000);
      expect(delay3).toBeLessThanOrEqual(4250);

      const delayMax = calculateExponentialBackoff(10, 1000, 60000);
      expect(delayMax).toBe(60000);
    });
  });

  describe('2. Idempotent Background Synchronization Worker', () => {
    it('idempotently synchronizes user profile updates to existing PostgreSQL record', async () => {
      const mockPgUser = {
        id: 'user-pg-001',
        email: 'dev@thinkwires.com',
        update: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(User, 'findByPk').mockResolvedValue(mockPgUser);

      const event = await enqueueOutboxEvent({
        eventType: 'USER_PROFILE_UPDATED',
        aggregateType: 'User',
        aggregateId: 'user-pg-001',
        payload: {
          id: 'user-pg-001',
          name: 'Dev Synced',
          phone: '+1 555-1234',
          designation: 'Senior Architect',
        },
      });

      const success = await processSingleEvent(event);
      expect(success).toBe(true);
      expect(User.findByPk).toHaveBeenCalledWith('user-pg-001');
      expect(mockPgUser.update).toHaveBeenCalledWith({
        name: 'Dev Synced',
        phone: '+1 555-1234',
        designation: 'Senior Architect',
      });

      const completed = inMemoryOutbox.findById(event.eventId);
      expect(completed.status).toBe('COMPLETED');
      expect(completed.completedAt).toBeDefined();
    });

    it('creates missing user in PostgreSQL when record does not exist during sync', async () => {
      vi.spyOn(User, 'findByPk').mockResolvedValue(null);
      vi.spyOn(User, 'findOne').mockResolvedValue(null);
      const mockCreated = { id: 'user-new-002', email: 'new@thinkwires.com' };
      vi.spyOn(User, 'create').mockResolvedValue(mockCreated);

      const event = await enqueueOutboxEvent({
        eventType: 'USER_PROFILE_UPDATED',
        aggregateType: 'User',
        aggregateId: 'user-new-002',
        payload: {
          id: 'user-new-002',
          email: 'new@thinkwires.com',
          name: 'New Employee',
          phone: '+1 555-0000',
          designation: 'Staff Engineer',
        },
      });

      const success = await processSingleEvent(event);
      expect(success).toBe(true);
      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-new-002',
          email: 'new@thinkwires.com',
          name: 'New Employee',
        })
      );
    });

    it('processes batches of pending events in background queue', async () => {
      const mockPgUser = { update: vi.fn().mockResolvedValue(true) };
      vi.spyOn(User, 'findByPk').mockResolvedValue(mockPgUser);

      await enqueueOutboxEvent({
        eventType: 'USER_PROFILE_UPDATED',
        aggregateType: 'User',
        aggregateId: 'batch-001',
        payload: { id: 'batch-001', name: 'Batch 1' },
      });
      await enqueueOutboxEvent({
        eventType: 'USER_PROFILE_UPDATED',
        aggregateType: 'User',
        aggregateId: 'batch-002',
        payload: { id: 'batch-002', name: 'Batch 2' },
      });

      const count = await processNextBatch(5);
      expect(count).toBe(2);

      const stats = await getOutboxTelemetry();
      expect(stats.completed).toBe(2);
      expect(stats.pending).toBe(0);
    });
  });

  describe('3. Retry with Exponential Backoff & Dead-Letter Queue (DLQ)', () => {
    it('schedules retry with incremented attempts when secondary store synchronization fails', async () => {
      vi.spyOn(User, 'findByPk').mockRejectedValue(new Error('PostgreSQL connection timeout'));

      const event = await enqueueOutboxEvent({
        eventType: 'USER_PROFILE_UPDATED',
        aggregateType: 'User',
        aggregateId: 'fail-001',
        payload: { id: 'fail-001', name: 'Retry Me' },
      });

      const success = await processSingleEvent(event);
      expect(success).toBe(false);

      const updated = inMemoryOutbox.findById(event.eventId);
      expect(updated.status).toBe('FAILED');
      expect(updated.attempts).toBe(1);
      expect(updated.lastError).toContain('PostgreSQL connection timeout');
      expect(new Date(updated.nextRetryAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('moves event to DEAD_LETTER queue when maximum attempts are exceeded', async () => {
      const event = await enqueueOutboxEvent({
        eventType: 'USER_PROFILE_UPDATED',
        aggregateType: 'User',
        aggregateId: 'dlq-001',
        maxAttempts: 3,
        payload: { id: 'dlq-001' },
      });

      // Simulate 3 consecutive failures
      await recordEventFailure(event.eventId, new Error('Fatal error 1'), 0, 3);
      await recordEventFailure(event.eventId, new Error('Fatal error 2'), 1, 3);
      const dlqEvent = await recordEventFailure(event.eventId, new Error('Fatal error 3'), 2, 3);

      expect(dlqEvent.status).toBe('DEAD_LETTER');
      expect(dlqEvent.attempts).toBe(3);
      expect(dlqEvent.deadLetteredAt).toBeDefined();

      const telemetry = await getOutboxTelemetry();
      expect(telemetry.deadLetter).toBe(1);
    });
  });

  describe('4. Administrative Reconciliation & DLQ Reprocessing', () => {
    it('re-enqueues dead letter events back to PENDING for operational recovery', async () => {
      const event = await enqueueOutboxEvent({
        eventType: 'USER_PROFILE_UPDATED',
        aggregateType: 'User',
        aggregateId: 'reprocess-001',
        payload: { id: 'reprocess-001' },
      });

      await recordEventFailure(event.eventId, new Error('Max attempts reached'), 4, 5);
      expect(inMemoryOutbox.findById(event.eventId).status).toBe('DEAD_LETTER');

      const result = await reprocessDeadLetters({ eventId: event.eventId });
      expect(result.reprocessedCount).toBe(1);

      const restored = inMemoryOutbox.findById(event.eventId);
      expect(restored.status).toBe('PENDING');
      expect(restored.attempts).toBe(0);
    });

    it('reconciles diverged MongoDB primary records to secondary PostgreSQL store', async () => {
      const originalReadyState = mongoose.connection.readyState;
      Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

      const mockMongoUsers = [
        {
          _id: 'mongo-recon-001',
          email: 'recon@thinkwires.com',
          name: 'Recon User',
          phone: '+1 555-9999',
          designation: 'Lead',
        },
      ];

      vi.spyOn(UserMongo, 'find').mockReturnValue({
        limit: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(mockMongoUsers),
        }),
      });

      // User missing in PostgreSQL
      vi.spyOn(User, 'findByPk').mockResolvedValue(null);
      vi.spyOn(User, 'findOne').mockResolvedValue(null);

      const result = await reconcileUsers({ batchSize: 10 });
      expect(result.checked).toBe(1);
      expect(result.synced).toBe(1);
      expect(result.errors).toBe(0);

      const telemetry = await getOutboxTelemetry();
      expect(telemetry.pending).toBe(1);

      Object.defineProperty(mongoose.connection, 'readyState', { value: originalReadyState, configurable: true });
    });
  });

  describe('5. Controller Decoupling & Fault Tolerance', () => {
    it('completes profile update successfully in MongoDB even if PostgreSQL synchronization fails', async () => {
      const originalReadyState = mongoose.connection.readyState;
      Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

      const mockReq = {
        user: { id: 'user-decoupled-001', email: 'fault.tolerant@thinkwires.com' },
        body: { name: 'Fault Tolerant Alex' },
      };

      let jsonResponse = null;
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockImplementation((data) => {
          jsonResponse = data;
          return mockRes;
        }),
      };

      vi.spyOn(UserMongo, 'findOneAndUpdate').mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            _id: 'user-decoupled-001',
            email: 'fault.tolerant@thinkwires.com',
            name: 'Fault Tolerant Alex',
          }),
        }),
      });

      // Simulate catastrophic PostgreSQL outage
      vi.spyOn(User, 'findByPk').mockRejectedValue(new Error('PostgreSQL Server Crash'));

      // Controller should succeed because MongoDB is primary and outbox handles PG retry
      await updateProfile(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      expect(jsonResponse.success).toBe(true);
      expect(jsonResponse.user.name).toBe('Fault Tolerant Alex');

      // Outbox event was captured with failure recorded for retry
      const events = Array.from(inMemoryOutbox.events.values());
      const userEvent = events.find((e) => e.aggregateId === 'user-decoupled-001');
      expect(userEvent).toBeDefined();
      expect(userEvent.status).toBe('FAILED');
      expect(userEvent.attempts).toBe(1);

      Object.defineProperty(mongoose.connection, 'readyState', { value: originalReadyState, configurable: true });
    });
  });
});
