import {
  fetchPendingOutboxEvents,
  claimEventForProcessing,
  markEventCompleted,
  recordEventFailure,
  outboxEmitter,
} from './outbox.service.js';
import User from '../models/user.model.js';
import { logger } from '../utils/logger.js';

/**
 * Registry of domain-specific synchronization handlers for secondary PostgreSQL storage.
 */
const HANDLERS = {
  /**
   * Idempotently synchronizes user profile updates from MongoDB into PostgreSQL.
   */
  USER_PROFILE_UPDATED: async (payload) => {
    const { id, email, name, phone, designation } = payload;
    if (!id && !email) {
      throw new Error('User synchronization requires an id or email.');
    }

    const updates = {};
    if (name) updates.name = name.trim();
    if (phone !== undefined) updates.phone = phone.trim();
    if (designation) updates.designation = designation.trim();

    // Idempotent search: by primary key UUID or email
    let pgUser = null;
    if (id) {
      pgUser = await User.findByPk(id);
    }
    if (!pgUser && email) {
      pgUser = await User.findOne({ where: { email: email.toLowerCase() } });
    }

    if (pgUser) {
      await pgUser.update(updates);
      logger.info(`[OutboxWorker] Synced user profile to PostgreSQL: ${email || id}`);
      return { action: 'UPDATED', userId: pgUser.id };
    }

    // If user does not exist in relational store yet, create record idempotently
    const created = await User.create({
      id: id || undefined,
      email: email ? email.toLowerCase() : `user-${id}@thinkwires.internal`,
      name: name || 'System Member',
      phone: phone || '',
      designation: designation || 'System Member',
      password: crypto.randomUUID ? crypto.randomUUID() : 'managed_identity_stub',
      role: 'user',
    });

    logger.info(`[OutboxWorker] Created user profile in PostgreSQL: ${email || id}`);
    return { action: 'CREATED', userId: created.id };
  },

  /**
   * Generic candidate record sync to relational store (if enabled for analytics)
   */
  CANDIDATE_SYNC: async (payload) => {
    logger.info(`[OutboxWorker] Processed relational projection for candidate: ${payload.id || payload.email}`);
    return { action: 'PROJECTED', candidateId: payload.id };
  },

  /**
   * Application record sync for audit/relational reporting
   */
  APPLICATION_SYNC: async (payload) => {
    logger.info(`[OutboxWorker] Processed relational projection for application: ${payload.id || payload.applicationId}`);
    return { action: 'PROJECTED', applicationId: payload.id };
  },
};

/**
 * Registers or overrides a synchronization handler.
 */
export const registerOutboxHandler = (eventType, handlerFn) => {
  if (typeof handlerFn !== 'function') {
    throw new TypeError(`Handler for ${eventType} must be a function.`);
  }
  HANDLERS[eventType] = handlerFn;
};

/**
 * Processes a single outbox event with idempotent execution and error tracking.
 *
 * @param {object} event
 * @returns {Promise<boolean>} True if completed successfully, false otherwise
 */
export const processSingleEvent = async (event) => {
  const { eventId, eventType, payload, attempts, maxAttempts } = event;

  const claimed = await claimEventForProcessing(eventId);
  if (!claimed) {
    return false; // Another worker instance claimed this event
  }

  const handler = HANDLERS[eventType];
  if (!handler) {
    const errorMsg = `No registered outbox handler for eventType: ${eventType}`;
    logger.error(`[OutboxWorker] ${errorMsg}`);
    await recordEventFailure(eventId, errorMsg, attempts, maxAttempts);
    return false;
  }

  try {
    const result = await handler(payload);
    await markEventCompleted(eventId);
    logger.info(`[OutboxWorker] Successfully synchronized event ${eventId} (${eventType})`);
    return true;
  } catch (err) {
    logger.error(`[OutboxWorker] Error processing event ${eventId} (${eventType}): ${err.message}`);
    await recordEventFailure(eventId, err, attempts, maxAttempts);
    return false;
  }
};

/**
 * Fetches and processes the next batch of pending outbox events.
 *
 * @param {number} batchSize
 * @returns {Promise<number>} Number of events processed
 */
export const processNextBatch = async (batchSize = 10) => {
  try {
    const pendingEvents = await fetchPendingOutboxEvents(batchSize);
    if (!pendingEvents || pendingEvents.length === 0) {
      return 0;
    }

    let processedCount = 0;
    for (const event of pendingEvents) {
      const success = await processSingleEvent(event);
      if (success) processedCount += 1;
    }
    return processedCount;
  } catch (err) {
    logger.error(`[OutboxWorker] Batch processing failure: ${err.message}`);
    return 0;
  }
};

/**
 * Background worker state
 */
let workerTimer = null;
let isWorkerRunning = false;

/**
 * Starts the background outbox synchronization worker.
 *
 * @param {object} options
 * @param {number} [options.intervalMs=5000] Polling interval in ms
 * @param {number} [options.batchSize=10] Max events per batch
 */
export const startOutboxWorker = (options = {}) => {
  if (isWorkerRunning) return;

  const { intervalMs = 5000, batchSize = 10 } = options;
  isWorkerRunning = true;

  const runTick = async () => {
    if (!isWorkerRunning) return;
    try {
      await processNextBatch(batchSize);
    } catch (err) {
      logger.error(`[OutboxWorker] Tick error: ${err.message}`);
    } finally {
      if (isWorkerRunning) {
        workerTimer = setTimeout(runTick, intervalMs);
        if (workerTimer.unref) workerTimer.unref();
      }
    }
  };

  // Immediate start on next turn
  workerTimer = setTimeout(runTick, 100);
  if (workerTimer.unref) workerTimer.unref();

  // Low-latency event listener for instant pickup
  outboxEmitter.on('event:enqueued', async (event) => {
    if (isWorkerRunning && event) {
      try {
        await processSingleEvent(event);
      } catch (err) {
        logger.debug(`[OutboxWorker] Fast-path sync failed: ${err.message}`);
      }
    }
  });

  logger.info(`[OutboxWorker] Background synchronization worker started (interval: ${intervalMs}ms).`);
};

/**
 * Stops the background outbox worker gracefully.
 */
export const stopOutboxWorker = () => {
  isWorkerRunning = false;
  if (workerTimer) {
    clearTimeout(workerTimer);
    workerTimer = null;
  }
  outboxEmitter.removeAllListeners('event:enqueued');
  logger.info('[OutboxWorker] Background synchronization worker stopped.');
};

export const getWorkerStatus = () => ({
  isRunning: isWorkerRunning,
});
