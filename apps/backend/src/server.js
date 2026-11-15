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

const PORT = config.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

const startServer = async () => {
  // Fail fast on startup if environment schema or secrets are missing/invalid in production (DEP-02)
  if (!process.env.VITEST) {
    validateBootEnvironment();
  }

  // Fail fast on startup if JWT_SECRET is missing, insecure, or weak
  getJwtSecret();

  // Start HTTP server immediately bound to 0.0.0.0 for containerized environments (DEP-03)
  const server = app.listen(PORT, HOST, () => {
    console.log(
      `[Server] Thinkwires API server running on http://${HOST}:${PORT}`
    );
  });

  // PostgreSQL (Sequelize) - Graceful non-blocking connection
  connectDB()
    .then(async () => {
      const isDevelopment = process.env.NODE_ENV !== 'production';
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
    })
    .catch((error) => {
      console.warn(
        '[PostgreSQL] Connection optional/bypassed:',
        error.message || error
      );
      console.log(
        '[PostgreSQL] Operating with in-memory seed dataset for API routes.'
      );
    });

  // MongoDB (Mongoose) - Graceful connection with fail-fast in production (DEP-02)
  connectMongoDB()
    .then(async () => {
      console.log('[MongoDB] Connected: dual-mode active persistence enabled.');
      await synchronizeIndexes();
    })
    .catch((error) => {
      if (process.env.NODE_ENV === 'production' && !process.env.VITEST) {
        console.error(
          '💥 [FATAL] Critical database boot failure: MongoDB connection refused in production mode.',
          error.message || error
        );
        process.exit(1);
      }
      console.warn(
        '[MongoDB] Connection optional/bypassed:',
        error.message || error
      );
      console.log(
        '[MongoDB] Operating with dual-mode in-memory store for Admin & CMS.'
      );
    });

  // Redis (Upstash / Local) - Graceful non-blocking connection
  getRedisClient()
    .catch((error) => {
      console.warn(
        '[Redis] Startup connection notice:',
        error.message || error
      );
    });

  // Graceful shutdown handling for container orchestrators (Docker, Kubernetes, Render) with active connection draining (DEP-06)
  const gracefulShutdown = (signal, exitCode = 0) => {
    console.log(`[Server] Received ${signal}. Starting graceful shutdown...`);
    setShuttingDown(true);

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

  return server;
};

export { startServer };

startServer();
