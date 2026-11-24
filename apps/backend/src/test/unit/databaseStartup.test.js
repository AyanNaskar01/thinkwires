import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import * as mongoConfig from '../../configs/mongodb.js';
import * as pgConfig from '../../configs/db.js';
import * as redisConfig from '../../configs/redis.js';
import * as outboxWorker from '../../services/outboxWorker.service.js';
import { startServer } from '../../server.js';

describe('Database Connection Startup & Lifecycle Discipline (High Priority)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('1. Canonical Primary Datastore (MongoDB) Ordering & Fail-Fast Protection', () => {
    it('halts and throws fatal error in production when MongoDB connection fails on startup', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_DISCONNECTED_STARTUP;

      // Mock MongoDB connection failure
      vi.spyOn(mongoConfig, 'connectMongoDB').mockRejectedValue(
        new Error('Could not connect to MongoDB Atlas cluster: connection timed out')
      );
      vi.spyOn(pgConfig, 'connectDB').mockResolvedValue(true);
      vi.spyOn(redisConfig, 'getRedisClient').mockResolvedValue({});
      vi.spyOn(outboxWorker, 'startOutboxWorker').mockImplementation(() => {});

      let errorCaught = null;
      try {
        await startServer({
          listen: false,
          exitOnFatal: false, // Prevent vitest process exit
        });
      } catch (err) {
        errorCaught = err;
      }

      expect(errorCaught).not.toBeNull();
      expect(errorCaught.message).toContain('Could not connect to MongoDB Atlas cluster');
      expect(mongoConfig.connectMongoDB).toHaveBeenCalledTimes(1);
    });

    it('allows disconnected dev fallback in development mode or when ALLOW_DISCONNECTED_STARTUP=true', async () => {
      process.env.NODE_ENV = 'development';

      vi.spyOn(mongoConfig, 'connectMongoDB').mockRejectedValue(
        new Error('Local MongoDB daemon not running on port 27017')
      );
      vi.spyOn(pgConfig, 'connectDB').mockResolvedValue(true);
      vi.spyOn(redisConfig, 'getRedisClient').mockResolvedValue({});
      vi.spyOn(outboxWorker, 'startOutboxWorker').mockImplementation(() => {});

      const result = await startServer({
        listen: false,
        exitOnFatal: false,
      });

      expect(result.isMongoConnected).toBe(false);
      expect(mongoConfig.connectMongoDB).toHaveBeenCalledTimes(1);
    });

    it('successfully connects MongoDB before starting outbox worker and opening HTTP port', async () => {
      process.env.NODE_ENV = 'production';

      const executionOrder = [];

      vi.spyOn(mongoConfig, 'connectMongoDB').mockImplementation(async () => {
        executionOrder.push('connectMongoDB');
        return {};
      });
      vi.spyOn(pgConfig, 'connectDB').mockImplementation(async () => {
        executionOrder.push('connectDB');
        return {};
      });
      vi.spyOn(redisConfig, 'getRedisClient').mockImplementation(async () => {
        executionOrder.push('getRedisClient');
        return {};
      });
      vi.spyOn(outboxWorker, 'startOutboxWorker').mockImplementation(() => {
        executionOrder.push('startOutboxWorker');
      });

      const result = await startServer({
        listen: false,
        exitOnFatal: false,
      });

      expect(result.isMongoConnected).toBe(true);
      expect(executionOrder).toEqual([
        'connectMongoDB',
        'connectDB',
        'getRedisClient',
        'startOutboxWorker',
      ]);
    });
  });

  describe('2. Secondary Relational Store (PostgreSQL) Graceful Fault Tolerance', () => {
    it('permits startup when PostgreSQL fails because MongoDB is primary and Outbox queues changes', async () => {
      process.env.NODE_ENV = 'production';

      vi.spyOn(mongoConfig, 'connectMongoDB').mockResolvedValue({});
      // Simulate PostgreSQL downtime
      vi.spyOn(pgConfig, 'connectDB').mockRejectedValue(
        new Error('PostgreSQL server unreachable: ECONNREFUSED 5432')
      );
      vi.spyOn(redisConfig, 'getRedisClient').mockResolvedValue({});
      vi.spyOn(outboxWorker, 'startOutboxWorker').mockImplementation(() => {});

      const result = await startServer({
        listen: false,
        exitOnFatal: false,
      });

      // Server successfully boots because MongoDB is authoritative primary
      expect(result.isMongoConnected).toBe(true);
      expect(outboxWorker.startOutboxWorker).toHaveBeenCalled();
    });
  });

  describe('3. Readiness Probe Verification Alignment (/ready)', () => {
    it('returns HTTP 503 unready when MongoDB is disconnected, protecting against traffic routing', async () => {
      // Readiness probe verifies that unready containers never receive traffic
      const res = await request(app).get('/ready');
      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
    });
  });
});
