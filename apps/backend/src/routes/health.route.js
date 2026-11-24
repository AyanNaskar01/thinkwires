import express from 'express';
import mongoose from 'mongoose';
import { sequelize } from '../configs/db.js';
import { isRedisConnected } from '../configs/redis.js';
import { getConnectionPoolMetrics, getSlowQueryMetrics } from '../configs/mongodb.js';
import { isAuthorizedDiagnosticRequest } from '../middlewares/auth.middleware.js';

const router = express.Router();

/**
 * 1. Liveness Probe (/healthz - DEP-05):
 * Indicates whether the Node process is alive and event loop is responsive.
 * Used by Kubernetes, AWS ECS, GCP Cloud Run, and Render to restart frozen containers.
 */
router.get('/healthz', (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const response = {
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  };

  if (!isProduction || isAuthorizedDiagnosticRequest(req)) {
    response.pid = process.pid;
  }

  res.status(200).json(response);
});

/**
 * 2. Readiness Probe (/ready - DEP-04, DEP-05):
 * Deep readiness verification evaluating backing datastores (MongoDB, PostgreSQL, Redis).
 * If MongoDB (the primary store) is disconnected, returns HTTP 503 Service Unavailable
 * to ensure traffic is never routed to unready containers.
 */
router.get('/ready', async (req, res) => {
  const isMongoReady = mongoose.connection.readyState === 1;
  let isPostgresReady = false;

  try {
    if (sequelize) {
      await sequelize.authenticate();
      isPostgresReady = true;
    }
  } catch {
    isPostgresReady = false;
  }

  // MongoDB is the canonical primary operational datastore
  const isHealthy = isMongoReady;
  const statusCode = isHealthy ? 200 : 503;

  const response = {
    status: isHealthy ? 'ready' : 'unready',
    timestamp: new Date().toISOString(),
  };

  // Telemetry details only for authorized diagnostic operators or non-production
  if (isAuthorizedDiagnosticRequest(req)) {
    response.checks = {
      mongodb: isMongoReady ? 'connected' : 'disconnected',
      postgresql: isPostgresReady ? 'connected' : 'optional/disconnected',
      redis: isRedisConnected() ? 'connected' : 'in-memory-fallback',
      connectionPool: getConnectionPoolMetrics(),
      slowQueries: getSlowQueryMetrics().summary,
    };
  }

  res.status(statusCode).json(response);
});

export default router;
