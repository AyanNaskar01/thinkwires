import mongoose from 'mongoose';
import OutboxEvent from '../models/outboxEvent.mongo.model.js';
import UserMongo from '../models/user.mongo.model.js';
import User from '../models/user.model.js';
import { inMemoryOutbox, enqueueOutboxEvent } from './outbox.service.js';
import { logger } from '../utils/logger.js';

const isMongoReady = () => Boolean(mongoose.connection.readyState === 1 && mongoose.connection.db);

/**
 * Returns comprehensive outbox metrics and dead-letter queue counts.
 *
 * @returns {Promise<object>} Outbox telemetry stats
 */
export const getOutboxTelemetry = async () => {
  if (isMongoReady()) {
    try {
      const counts = await OutboxEvent.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]);

      const result = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        deadLetter: 0,
        total: 0,
      };

      counts.forEach((item) => {
        const key = item._id === 'DEAD_LETTER' ? 'deadLetter' : item._id.toLowerCase();
        if (result[key] !== undefined) {
          result[key] = item.count;
        }
        result.total += item.count;
      });

      return result;
    } catch (err) {
      logger.warn(`[OutboxTelemetry] Aggregation failed: ${err.message}`);
    }
  }

  const memCounts = inMemoryOutbox.countByStatus();
  return {
    pending: memCounts.PENDING,
    processing: memCounts.PROCESSING,
    completed: memCounts.COMPLETED,
    failed: memCounts.FAILED,
    deadLetter: memCounts.DEAD_LETTER,
    total: memCounts.total,
  };
};

/**
 * Re-enqueues events from the Dead-Letter Queue back into PENDING state for retry.
 *
 * @param {object} [options]
 * @param {string} [options.eventId] Specific event to replay, or all if omitted
 * @param {number} [options.limit=100] Maximum events to reprocess
 * @returns {Promise<{ reprocessedCount: number }>}
 */
export const reprocessDeadLetters = async (options = {}) => {
  const { eventId, limit = 100 } = options;
  const filter = { status: 'DEAD_LETTER' };
  if (eventId) filter.eventId = eventId;

  if (isMongoReady()) {
    try {
      const deadLetters = await OutboxEvent.find(filter).limit(limit);
      let count = 0;

      for (const dl of deadLetters) {
        dl.status = 'PENDING';
        dl.attempts = 0;
        dl.nextRetryAt = new Date();
        dl.lastError = `Re-queued from DLQ by administrative reconciliation at ${new Date().toISOString()}`;
        await dl.save();
        count += 1;
      }

      logger.info(`[Reconciliation] Successfully re-enqueued ${count} dead-letter events for retry.`);
      return { reprocessedCount: count };
    } catch (err) {
      logger.error(`[Reconciliation] Failed to reprocess dead letters from MongoDB: ${err.message}`);
    }
  }

  // Memory store fallback
  let count = 0;
  for (const ev of inMemoryOutbox.events.values()) {
    if (ev.status === 'DEAD_LETTER' && (!eventId || ev.eventId === eventId)) {
      inMemoryOutbox.update(ev.eventId, {
        status: 'PENDING',
        attempts: 0,
        nextRetryAt: new Date(),
        lastError: 'Re-queued from memory DLQ',
      });
      count += 1;
      if (count >= limit) break;
    }
  }
  return { reprocessedCount: count };
};

/**
 * Reconciles MongoDB primary user records with PostgreSQL secondary relational store.
 * Identifies missing records or divergence and enqueues idempotent synchronization events.
 *
 * @param {object} [options]
 * @param {number} [options.batchSize=100]
 * @returns {Promise<{ checked: number, synced: number, errors: number }>}
 */
export const reconcileUsers = async (options = {}) => {
  const { batchSize = 100 } = options;
  let checked = 0;
  let synced = 0;
  let errors = 0;

  if (mongoose.connection.readyState !== 1) {
    logger.warn('[Reconciliation] MongoDB is offline; reconciliation skipped.');
    return { checked: 0, synced: 0, errors: 0 };
  }

  try {
    const mongoUsers = await UserMongo.find({}).limit(batchSize).lean();
    checked = mongoUsers.length;

    for (const mUser of mongoUsers) {
      try {
        const userId = mUser._id.toString();
        const email = mUser.email ? mUser.email.toLowerCase() : '';

        let pgUser = null;
        try {
          pgUser = await User.findByPk(userId);
          if (!pgUser && email) {
            pgUser = await User.findOne({ where: { email } });
          }
        } catch (pgErr) {
          // PostgreSQL query failure
          errors += 1;
          continue;
        }

        // If missing or attributes diverge, enqueue outbox reconciliation event
        const needsSync =
          !pgUser ||
          pgUser.name !== mUser.name ||
          pgUser.phone !== (mUser.phone || '') ||
          pgUser.designation !== (mUser.designation || 'System Member');

        if (needsSync) {
          await enqueueOutboxEvent({
            eventType: 'USER_PROFILE_UPDATED',
            aggregateType: 'User',
            aggregateId: userId,
            idempotencyKey: `reconciliation:user:${userId}:${Date.now()}`,
            payload: {
              id: userId,
              email: mUser.email,
              name: mUser.name,
              phone: mUser.phone || '',
              designation: mUser.designation || 'System Member',
              updatedAt: mUser.updatedAt || new Date(),
            },
          });
          synced += 1;
        }
      } catch (err) {
        errors += 1;
        logger.error(`[Reconciliation] Error reconciling user ${mUser._id}: ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`[Reconciliation] Reconciliation job failed: ${err.message}`);
  }

  logger.info(`[Reconciliation] Completed: checked ${checked}, enqueued ${synced} for sync, ${errors} errors.`);
  return { checked, synced, errors };
};
