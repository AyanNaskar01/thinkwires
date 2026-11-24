import mongoose from 'mongoose';
import config from './dotenv.js';

let isReconnecting = false;
let reconnectTimer = null;
let listenersAttached = false;
let cachedConnectionPromise = null;
let isExplicitDisconnect = false;

const isProduction = config.NODE_ENV === 'production';
const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
);
const isLocalMongo =
  !config.MONGODB_URI ||
  config.MONGODB_URI.includes('localhost') ||
  config.MONGODB_URI.includes('127.0.0.1') ||
  config.MONGODB_URI.includes('::1');

const MONGO_OPTIONS = {
  maxPoolSize: isServerless ? 5 : (isLocalMongo ? 5 : 10),
  minPoolSize: isServerless || isLocalMongo ? 0 : 2,
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: isServerless ? 3000 : (isLocalMongo ? 5000 : 15000),
  heartbeatFrequencyMS: 10000,
  maxIdleTimeMS: 30000,
  family: 4,
  autoIndex: !isProduction,
};

const setupConnectionListeners = () => {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on('connected', () => {
    isReconnecting = false;
    isExplicitDisconnect = false;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    const target = isLocalMongo ? 'Local MongoDB / Compass' : 'MongoDB Atlas / Cloud';
    console.log(`[MongoDB] Connected: ${mongoose.connection.host} (${target})`);
  });

  mongoose.connection.on('error', (err) => {
    console.error(`[MongoDB] Connection error: ${err.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    if (isExplicitDisconnect) return;
    console.warn('[MongoDB] Connection lost. Scheduling auto-reconnect...');
    if (!isServerless) {
      scheduleReconnect();
    }
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[MongoDB] Reconnected successfully.');
    isReconnecting = false;
  });
};

const scheduleReconnect = () => {
  if (
    isReconnecting ||
    mongoose.connection.readyState === 1 ||
    mongoose.connection.readyState === 2
  ) {
    return;
  }
  isReconnecting = true;
  reconnectTimer = setTimeout(async () => {
    try {
      console.log('[MongoDB] Attempting reconnection to MongoDB Atlas...');
      await mongoose.connect(config.MONGODB_URI, MONGO_OPTIONS);
    } catch (err) {
      console.error(`[MongoDB] Reconnect attempt failed: ${err.message}`);
      isReconnecting = false;
      scheduleReconnect();
    }
  }, 5000);
};

export const connectMongoDB = async () => {
  setupConnectionListeners();

  isExplicitDisconnect = false;

  // Short-circuit if connection or in-flight handshake exists (prevents connection thrashing in serverless environments)
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (cachedConnectionPromise) {
    return cachedConnectionPromise;
  }

  try {
    cachedConnectionPromise = mongoose.connect(config.MONGODB_URI, MONGO_OPTIONS);
    const conn = await cachedConnectionPromise;
    cachedConnectionPromise = null;
    return conn;
  } catch (error) {
    cachedConnectionPromise = null;
    console.error(`[MongoDB] Initial connection failed: ${error.message}`);
    if (!isServerless) {
      scheduleReconnect();
    }
    throw error;
  }
};

export const disconnectMongoDB = async () => {
  isExplicitDisconnect = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  isReconnecting = false;
  cachedConnectionPromise = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

/**
 * Safe Index Synchronization Routine
 *
 * In production deployments, executing automatic destructive index synchronization (model.syncIndexes())
 * during application startup is dangerous because it drops any database indexes absent from the local
 * Mongoose schema and can induce heavy collection lock contention or sudden query latency spikes.
 *
 * Safety Rules:
 * 1. By default, automatic synchronization during application startup is SKIPPED in production (NODE_ENV === 'production').
 * 2. In non-production or when explicitly invoked, non-destructive index creation (model.createIndexes())
 *    is used by default. It creates missing schema indexes and NEVER drops existing database indexes.
 * 3. Destructive index synchronization (syncIndexes with index drops) is strictly forbidden unless
 *    BOTH options.allowDrop === true AND ALLOW_DESTRUCTIVE_INDEX_DROP === 'true' environment flag is set.
 * 4. Measures and logs index build duration (durationMs) and per-model diagnostics.
 *
 * @param {object} [options]
 * @param {boolean} [options.allowDrop=false] Whether to allow dropping extraneous indexes (requires ALLOW_DESTRUCTIVE_INDEX_DROP=true)
 * @param {boolean} [options.force=false] Force execution even in production environment
 * @param {Array<string>} [options.models] Specific model names to synchronize (all if omitted)
 * @returns {Promise<object>} Results summary with per-model stats and timing
 */
export const synchronizeIndexes = async (options = {}) => {
  if (mongoose.connection.readyState !== 1) {
    return { skipped: true, reason: 'MongoDB is disconnected (readyState !== 1)' };
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const force = options.force === true || process.env.ALLOW_PRODUCTION_INDEX_SYNC === 'true';

  if (isProduction && !force) {
    console.log(
      '🔒 [MongoDB] Production index sync protection: Automatic startup index synchronization is skipped.\n' +
      '             Indexes must be managed via explicit deterministic migrations (npm run migrate) or reviewed via npm run index:review.'
    );
    return {
      skipped: true,
      reason: 'Automatic startup index synchronization disabled in production for database stability.',
    };
  }

  const allowDrop =
    options.allowDrop === true &&
    process.env.ALLOW_DESTRUCTIVE_INDEX_DROP === 'true';

  const startTime = Date.now();
  const results = {
    modelsChecked: 0,
    indexesCreated: 0,
    indexesDropped: 0,
    errors: [],
    details: [],
    totalDurationMs: 0,
  };

  try {
    const models = Object.values(mongoose.models).filter(
      (m) => !options.models || options.models.includes(m.modelName)
    );

    for (const model of models) {
      if (!model) continue;
      results.modelsChecked += 1;
      const modelStart = Date.now();

      try {
        if (allowDrop && typeof model.syncIndexes === 'function') {
          console.warn(
            `⚠️ [MongoDB] DESTRUCTIVE SYNC: Syncing indexes on ${model.modelName} with allowDrop=true...`
          );
          const dropped = await model.syncIndexes();
          const duration = Date.now() - modelStart;
          const dropCount = Array.isArray(dropped) ? dropped.length : 0;
          results.indexesDropped += dropCount;
          results.details.push({
            model: model.modelName,
            action: 'syncIndexes',
            droppedCount: dropCount,
            durationMs: duration,
          });
          console.log(
            `   ✔ [${model.modelName}] Synced in ${duration}ms (dropped ${dropCount} indexes)`
          );
        } else if (typeof model.createIndexes === 'function') {
          // Safe non-destructive creation of missing indexes without dropping anything
          await model.createIndexes();
          const duration = Date.now() - modelStart;
          results.details.push({
            model: model.modelName,
            action: 'createIndexes',
            durationMs: duration,
          });
          console.log(`   ✔ [${model.modelName}] Indexes verified/created in ${duration}ms`);
        }
      } catch (modelErr) {
        const duration = Date.now() - modelStart;
        results.errors.push({
          model: model.modelName,
          error: modelErr.message,
          durationMs: duration,
        });
        console.warn(`   ⚠️ [${model.modelName}] Index operation notice (${duration}ms):`, modelErr.message);
      }
    }

    results.totalDurationMs = Date.now() - startTime;
    console.log(
      `[MongoDB] Safe index verification completed across ${results.modelsChecked} models in ${results.totalDurationMs}ms.`
    );
    return results;
  } catch (err) {
    results.totalDurationMs = Date.now() - startTime;
    console.warn('[MongoDB] Index synchronization error:', err.message);
    results.errors.push({ global: err.message });
    return results;
  }
};

/**
 * Database Architecture Declaration (Issue #186)
 * MongoDB (Mongoose) is formally designated as the CANONICAL PRIMARY DOCUMENT STORE
 * (Source of Truth) for all core business entities.
 */
export const DATABASE_ARCHITECTURE = {
  PRIMARY_SOURCE_OF_TRUTH: 'MongoDB (Mongoose)',
  ROLE: 'Canonical Primary Document Store (ATS, Admin, CMS, Applications)',
};

export default mongoose;
