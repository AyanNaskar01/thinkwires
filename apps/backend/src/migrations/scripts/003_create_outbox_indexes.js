/**
 * Migration: 003_create_outbox_indexes.js
 * Establishes compound status-retry, aggregate tracking, and unique idempotency indexes
 * for Transactional Outbox Event persistence (SEC-DB-SYNC-01).
 */
export const up = async ({ db }) => {
  console.log('   Creating Transactional Outbox performance indexes...');
  const start = Date.now();

  try {
    // 1. Worker polling compound index: { status: 1, nextRetryAt: 1 }
    await db.collection('outboxevents').createIndex(
      { status: 1, nextRetryAt: 1 },
      { name: 'idx_outbox_status_retry' }
    );

    // 2. Aggregate history compound index: { aggregateType: 1, aggregateId: 1, createdAt: -1 }
    await db.collection('outboxevents').createIndex(
      { aggregateType: 1, aggregateId: 1, createdAt: -1 },
      { name: 'idx_outbox_aggregate_date' }
    );

    // 3. Unique idempotency key index: { idempotencyKey: 1 }
    await db.collection('outboxevents').createIndex(
      { idempotencyKey: 1 },
      { name: 'idx_outbox_idempotency_unique', unique: true }
    );

    const duration = Date.now() - start;
    console.log(`   ✔ Outbox indexes created successfully in ${duration}ms.`);
  } catch (err) {
    console.warn('   Note on outbox indexes:', err.message);
  }
};

export const down = async ({ db }) => {
  console.log('   Reverting Transactional Outbox performance indexes...');
  try {
    await db.collection('outboxevents').dropIndex('idx_outbox_status_retry');
  } catch {}
  try {
    await db.collection('outboxevents').dropIndex('idx_outbox_aggregate_date');
  } catch {}
  try {
    await db.collection('outboxevents').dropIndex('idx_outbox_idempotency_unique');
  } catch {}
};
