import app, { setShuttingDown } from './app.js';
import { connectDB, sequelize } from './configs/db.js';
import {
  connectMongoDB,
  disconnectMongoDB,
  synchronizeIndexes,
} from './configs/mongodb.js';
import config from './configs/dotenv.js';
import { getRedisClient, closeRedis } from './configs/redis.js';
import { getJwtSecret } from './utils/auth.util.js';
import { validateBootEnvironment } from './configs/env.validator.js';
import { startOutboxWorker, stopOutboxWorker } from './services/outboxWorker.service.js';

const PORT = config.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

/**
 * Enterprise Server Lifecycle Bootstrap
 *
 * Startup Sequence:
 * 1. Validate environment schema & critical secrets (Fail-fast DEP-02)
 * 2. Connect to Canonical Primary Datastore (MongoDB) BEFORE opening HTTP port
 *    - In production, MongoDB failure is FATAL (fail-closed, container halts).
 * 3. Connect to Secondary Relational Store (PostgreSQL) - Graceful non-blocking
 *    - Relational sync is handled asynchronously via Transactional Outbox.
 * 4. Connect to Distributed Cache (Redis) - Graceful fallback to degraded memory
 * 5. Initialize Transactional Outbox Background Worker
 * 6. Open HTTP port bound to 0.0.0.0 (DEP-03) only when backing datastores are ready
 */
const startServer = async (options = {}) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const allowDisconnected =
    options.allowDisconnected !== undefined
      ? options.allowDisconnected
      : process.env.ALLOW_DISCONNECTED_STARTUP === 'true';
  const shouldExitOnFatal = options.exitOnFatal !== undefined ? options.exitOnFatal : true;

  // 1. Fail fast on startup if environment schema or secrets are missing/invalid in production (DEP-02)
  if (!process.env.VITEST) {
    validateBootEnvironment();
  }

  // 2. Fail fast on startup if JWT_SECRET is missing, insecure, or weak
  getJwtSecret();

  // 3. Connect to Canonical Primary Datastore (MongoDB) BEFORE opening HTTP server
  // MongoDB is the authoritative Source of Truth for ATS, Candidate Portal, Jobs, and Applications.
  let isMongoConnected = false;
  try {
    console.log('[Startup] Connecting to primary datastore (MongoDB)...');
    await connectMongoDB();
    isMongoConnected = true;
    console.log('[MongoDB] Connected: primary active persistence enabled.');

    const isDevelopment = !isProduction;
    if (isDevelopment) {
      await synchronizeIndexes({ allowDrop: false });
    } else {
      console.log(
        '[MongoDB] Connected in production mode. Destructive startup index synchronization is disabled.\n' +
        '          Schema indexes are managed via deterministic migrations (runner.js) and review tooling (npm run index:review).'
      );
    }
  } catch (error) {
    console.error('🚨 [FATAL: DB-STARTUP] Failed to connect to primary datastore (MongoDB) on startup:', error.message);
    if (isProduction && !allowDisconnected) {
      console.error(
        '💥 [FATAL: DB-STARTUP] Production container boot halted. Application will not open HTTP port without the canonical primary database.'
      );
      if (shouldExitOnFatal) {
        process.exit(1);
      }
      throw error;
    } else {
      console.warn('⚠️ [MongoDB] Operating in disconnected/in-memory mode for development/test.');
    }
  }

  // 4. Connect to Secondary Relational Store (PostgreSQL) - Graceful non-blocking
  // PostgreSQL is secondary; writes succeed authoritatively in MongoDB and queue via Transactional Outbox.
  try {
    console.log('[Startup] Connecting to secondary relational store (PostgreSQL)...');
    await connectDB();
    const isDevelopment = !isProduction;
    if (isDevelopment) {
      await sequelize.sync({ alter: true });
      console.log(
        '[PostgreSQL] Models synced with schema auto-alter enabled (development)'
      );
    } else {
      console.log(
        '[PostgreSQL] Connected in production mode. Schema synchronization is managed via deterministic migrations (postgresRunner.js).'
      );
    }
  } catch (error) {
    console.warn(
      '[PostgreSQL] Secondary relational store connection optional/bypassed:',
      error.message || error
    );
    console.log(
      '[PostgreSQL] Operating with Transactional Outbox queue for asynchronous reconciliation.'
    );
  }

  // 5. Connect to Distributed Cache (Redis) - Graceful non-blocking
  try {
    await getRedisClient();
  } catch (error) {
    console.warn(
      '[Redis] Startup connection notice:',
      error.message || error
    );
  }

  // 6. Start Transactional Outbox Background Worker for asynchronous PostgreSQL sync
  startOutboxWorker({ intervalMs: 5000, batchSize: 20 });

  // 7. Start HTTP server bound to 0.0.0.0 (DEP-03)
  // Port is opened ONLY when primary database is verified and ready to accept traffic
  const listenPort = options.port || PORT;
  const listenHost = options.host || HOST;

  let server = null;
  if (options.listen !== false) {
    server = app.listen(listenPort, listenHost, () => {
      console.log(
        `[Server] Thinkwires API server ready and listening on http://${listenHost}:${listenPort}`
      );
    });

    // Graceful shutdown handling for container orchestrators (Docker, Kubernetes, Render) with active connection draining (DEP-06)
    const gracefulShutdown = (signal, exitCode = 0) => {
      console.log(`[Server] Received ${signal}. Starting graceful shutdown...`);
      setShuttingDown(true);
      stopOutboxWorker();

      if (typeof server.closeIdleConnections === 'function') {
        server.closeIdleConnections();
      }

      server.close(async () => {
        console.log('[Server] HTTP connections closed.');
        try {
          await disconnectMongoDB();
          console.log('[MongoDB] Connection closed.');
          if (sequelize) {
            await sequelize.close();
            console.log('[PostgreSQL] Connection closed.');
          }
          await closeRedis();
          console.log('[Redis] Connection closed.');
        } catch (err) {
          console.error('[Server] Error during database shutdown:', err.message);
        }
        process.exit(exitCode);
      });

      // Force exit if connections do not close in 10s
      setTimeout(() => {
        console.error('[Server] Forcing shutdown after timeout.');
        process.exit(1);
      }, 10000).unref();
    };

    // Process-level monitors for unhandled promise rejections and uncaught exceptions (SEC-EXP-05)
    process.on('unhandledRejection', (reason, promise) => {
      console.error('🚨 [Process] Unhandled Promise Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('💥 [Process] Critical Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION', 1);
    });

    // Use process.once to prevent EventEmitter memory leaks across restarts/workers (Issue #179)
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM', 0));
    process.once('SIGINT', () => gracefulShutdown('SIGINT', 0));
  }

  return { server, isMongoConnected };
};

export { startServer };

if (!process.env.VITEST) {
  startServer();
}
