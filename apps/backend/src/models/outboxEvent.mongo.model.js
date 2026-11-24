import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * Transactional Outbox Event Model
 * Primary Source of Truth: MongoDB
 *
 * Implements the Transactional Outbox Pattern for reliable, eventual consistency
 * between MongoDB (primary document store) and PostgreSQL (secondary relational store).
 *
 * Guarantees:
 * - At-least-once delivery to PostgreSQL
 * - Idempotent event processing
 * - Exponential backoff retry on transient relational failures
 * - Dead-letter queue (DLQ) isolation for permanently failing events
 */
const outboxEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      default: () => crypto.randomUUID(),
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    aggregateType: {
      type: String,
      required: true,
      index: true,
    },
    aggregateId: {
      type: String,
      required: true,
      index: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {},
    },
    status: {
      type: String,
      required: true,
      enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER'],
      default: 'PENDING',
      index: true,
    },
    attempts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    maxAttempts: {
      type: Number,
      required: true,
      default: 5,
    },
    nextRetryAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    lastError: {
      type: String,
      default: null,
    },
    errorDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    deadLetteredAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// High-performance partial compound index for outbox worker polling & reconciliation (Issue #210)
outboxEventSchema.index(
  { status: 1, nextRetryAt: 1 },
  {
    partialFilterExpression: {
      status: { $in: ['PENDING', 'FAILED', 'PROCESSING'] },
    },
  }
);
outboxEventSchema.index({ aggregateType: 1, aggregateId: 1, createdAt: -1 });

export const OutboxEvent = mongoose.models.OutboxEvent || mongoose.model('OutboxEvent', outboxEventSchema);
export default OutboxEvent;
