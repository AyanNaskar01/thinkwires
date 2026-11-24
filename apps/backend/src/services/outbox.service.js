import EventEmitter from 'events';
import crypto from 'crypto';
import mongoose from 'mongoose';
import OutboxEvent from '../models/outboxEvent.mongo.model.js';
import { logger } from '../utils/logger.js';

export const outboxEmitter = new EventEmitter();

/**
 * In-memory fallback outbox store for automated testing and disconnected dev modes.
 */
class InMemoryOutboxStore {
  constructor() {
    this.events = new Map();
  }

  clear() {
    this.events.clear();
  }

  save(event) {
    if (event.idempotencyKey) {
      const existing = this.findByIdempotencyKey(event.idempotencyKey);
      if (existing) return existing;
    }
    const doc = {
      ...event,
      _id: event.eventId,
      createdAt: event.createdAt || new Date(),
      updatedAt: new Date(),
    };
    this.events.set(doc.eventId, doc);
    return doc;
  }

  findById(eventId) {
    return this.events.get(eventId) || null;
  }

  findByIdempotencyKey(key) {
    for (const ev of this.events.values()) {
      if (ev.idempotencyKey === key) return ev;
    }
    return null;
  }

  findPending(limit = 10) {
    const now = Date.now();
    const results = [];
    for (const ev of this.events.values()) {
      if (
        (ev.status === 'PENDING' || ev.status === 'FAILED') &&
        new Date(ev.nextRetryAt).getTime() <= now
      ) {
        results.push(ev);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  update(eventId, updates) {
    const ev = this.events.get(eventId);
    if (!ev) return null;
    const updated = { ...ev, ...updates, updatedAt: new Date() };
    this.events.set(eventId, updated);
    return updated;
  }

  countByStatus() {
    const counts = { PENDING: 0, PROCESSING: 0, COMPLETED: 0, FAILED: 0, DEAD_LETTER: 0, total: 0 };
    for (const ev of this.events.values()) {
      counts.total += 1;
      if (counts[ev.status] !== undefined) {
        counts[ev.status] += 1;
      }
    }
    return counts;
  }
}

export const inMemoryOutbox = new InMemoryOutboxStore();

const isMongoReady = () => Boolean(mongoose.connection.readyState === 1 && mongoose.connection.db);

/**
 * Calculates exponential backoff delay with random jitter.
 *
 * @param {number} attempt Attempt count (1-based)
 * @param {number} baseMs Base delay in milliseconds (default: 1000ms)
 * @param {number} maxMs Cap in milliseconds (default: 60000ms)
 * @returns {number} Backoff delay in milliseconds
 */
export const calculateExponentialBackoff = (attempt, baseMs = 1000, maxMs = 60000) => {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * 200);
  return Math.min(maxMs, exp + jitter);
};

/**
 * Enqueues a business event into the Transactional Outbox.
 *
 * @param {object} options
 * @param {string} options.eventType Event name (e.g. 'USER_PROFILE_UPDATED')
 * @param {string} options.aggregateType Entity type (e.g. 'User')
 * @param {string} options.aggregateId Entity primary identifier
 * @param {object} options.payload Payload to synchronize to PostgreSQL
 * @param {string} [options.idempotencyKey] Unique idempotency key (auto-generated if omitted)
 * @param {number} [options.maxAttempts=5] Maximum retry attempts before Dead-Lettering
 * @param {object} [options.session] Optional Mongoose ClientSession for atomic transactions
 * @returns {Promise<object>} Created outbox event
 */
export const enqueueOutboxEvent = async (options) => {
  const {
    eventType,
    aggregateType,
    aggregateId,
    payload = {},
    maxAttempts = 5,
    session = null,
  } = options;

  if (!eventType || !aggregateType || !aggregateId) {
    throw new Error('Outbox event requires eventType, aggregateType, and aggregateId.');
  }

  const eventId = crypto.randomUUID();
  const idempotencyKey =
    options.idempotencyKey ||
    `${eventType}:${aggregateId}:${payload.updatedAt ? new Date(payload.updatedAt).getTime() : Date.now()}:${eventId.slice(0, 8)}`;

  const eventData = {
    eventId,
    eventType,
    aggregateType,
    aggregateId: String(aggregateId),
    payload,
    status: 'PENDING',
    attempts: 0,
    maxAttempts,
    nextRetryAt: new Date(),
    idempotencyKey,
    lastError: null,
    errorDetails: null,
    processedAt: null,
    completedAt: null,
    deadLetteredAt: null,
  };

  let savedEvent = null;

  if (isMongoReady()) {
    try {
      const doc = new OutboxEvent(eventData);
      savedEvent = await doc.save(session ? { session } : {});
      savedEvent = savedEvent.toObject ? savedEvent.toObject() : savedEvent;
    } catch (err) {
      if (err.code === 11000) {
        // Idempotency collision: event already exists
        logger.info(`[Outbox] Duplicate event suppressed by idempotency key: ${idempotencyKey}`);
        savedEvent = await OutboxEvent.findOne({ idempotencyKey }).lean();
        return savedEvent;
      }
      logger.error(`[Outbox] Failed to persist outbox event to MongoDB: ${err.message}`);
      savedEvent = inMemoryOutbox.save(eventData);
    }
  } else {
    // Non-production or disconnected fallback
    savedEvent = inMemoryOutbox.save(eventData);
  }

  // Notify active background worker for immediate dispatch (sub-second sync)
  outboxEmitter.emit('event:enqueued', savedEvent);
  return savedEvent;
};

/**
 * Retrieves a batch of pending or retryable outbox events.
 *
 * @param {number} limit
 * @returns {Promise<Array<object>>}
 */
export const fetchPendingOutboxEvents = async (limit = 10) => {
  if (isMongoReady()) {
    try {
      return await OutboxEvent.find({
        status: { $in: ['PENDING', 'FAILED'] },
        nextRetryAt: { $lte: new Date() },
      })
        .sort({ nextRetryAt: 1, createdAt: 1 })
        .limit(limit)
        .lean();
    } catch (err) {
      logger.warn(`[Outbox] MongoDB query failed, checking memory fallback: ${err.message}`);
      return inMemoryOutbox.findPending(limit);
    }
  }
  return inMemoryOutbox.findPending(limit);
};

/**
 * Atomically marks an outbox event as currently processing.
 *
 * @param {string} eventId
 * @returns {Promise<boolean>} True if claimed, false if already claimed or missing
 */
export const claimEventForProcessing = async (eventId) => {
  if (isMongoReady()) {
    try {
      const updated = await OutboxEvent.findOneAndUpdate(
        { eventId, status: { $in: ['PENDING', 'FAILED'] } },
        { status: 'PROCESSING', processedAt: new Date() },
        { new: true }
      );
      return Boolean(updated);
    } catch {
      return false;
    }
  }
  const mem = inMemoryOutbox.findById(eventId);
  if (mem && (mem.status === 'PENDING' || mem.status === 'FAILED')) {
    inMemoryOutbox.update(eventId, { status: 'PROCESSING', processedAt: new Date() });
    return true;
  }
  return false;
};

/**
 * Marks an event as successfully synchronized to PostgreSQL.
 *
 * @param {string} eventId
 * @returns {Promise<object>}
 */
export const markEventCompleted = async (eventId) => {
  const updates = {
    status: 'COMPLETED',
    completedAt: new Date(),
    lastError: null,
    errorDetails: null,
  };

  if (isMongoReady()) {
    try {
      return await OutboxEvent.findOneAndUpdate({ eventId }, updates, { new: true }).lean();
    } catch (err) {
      logger.warn(`[Outbox] Failed to mark completed in MongoDB: ${err.message}`);
    }
  }
  return inMemoryOutbox.update(eventId, updates);
};

/**
 * Records a synchronization failure, schedules exponential retry or routes to Dead Letter Queue (DLQ).
 *
 * @param {string} eventId
 * @param {Error|string} error
 * @param {number} currentAttempts
 * @param {number} maxAttempts
 * @returns {Promise<object>}
 */
export const recordEventFailure = async (eventId, error, currentAttempts = 0, maxAttempts = 5) => {
  const newAttempts = currentAttempts + 1;
  const isDeadLetter = newAttempts >= maxAttempts;
  const errorMsg = error instanceof Error ? error.message : String(error);
  const errorDetails = error instanceof Error ? { name: error.name, stack: error.stack } : { message: errorMsg };

  if (isDeadLetter) {
    const updates = {
      status: 'DEAD_LETTER',
      attempts: newAttempts,
      lastError: errorMsg,
      errorDetails,
      deadLetteredAt: new Date(),
    };

    logger.error(
      `🚨 [OUTBOX_DLQ_ALERT: SEC-DB-SYNC] Event ${eventId} permanently failed after ${newAttempts} attempts and was moved to Dead-Letter Queue: ${errorMsg}`
    );

    if (isMongoReady()) {
      try {
        return await OutboxEvent.findOneAndUpdate({ eventId }, updates, { new: true }).lean();
      } catch (err) {
        logger.error(`[Outbox] Failed to update DLQ in Mongo: ${err.message}`);
      }
    }
    return inMemoryOutbox.update(eventId, updates);
  }

  // Calculate exponential backoff
  const backoffMs = calculateExponentialBackoff(newAttempts);
  const nextRetryAt = new Date(Date.now() + backoffMs);

  const updates = {
    status: 'FAILED',
    attempts: newAttempts,
    nextRetryAt,
    lastError: errorMsg,
    errorDetails,
  };

  logger.warn(
    `⚠️ [OutboxSync] Event ${eventId} failed (attempt ${newAttempts}/${maxAttempts}). Next retry in ${Math.round(backoffMs / 1000)}s: ${errorMsg}`
  );

  if (isMongoReady()) {
    try {
      return await OutboxEvent.findOneAndUpdate({ eventId }, updates, { new: true }).lean();
    } catch (err) {
      logger.warn(`[Outbox] Failed to schedule retry in Mongo: ${err.message}`);
    }
  }
  return inMemoryOutbox.update(eventId, updates);
};
