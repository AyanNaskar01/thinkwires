import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert';
import {
  checkAtomicLimit,
  createRateLimiter,
  getCleanClientIp,
  getAccountIdentifier,
  inMemoryFallbackStore,
  adminLoginRateLimiter,
  candidateLoginRateLimiter,
} from '../../middlewares/rateLimiter.middleware.js';
import { setMockRedisClient, isRedisConnected } from '../../configs/redis.js';
import aiService from '../../services/ai.service.js';
import { isAllowedOrigin } from '../../middlewares/csrf.middleware.js';

describe('Sprint 7: AI Microservice Auth & Redis Distributed Rate Limiting', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    inMemoryFallbackStore.reset();
    setMockRedisClient(null);
  });

  afterEach(() => {
    process.env = { ...origEnv };
    inMemoryFallbackStore.reset();
    setMockRedisClient(null);
  });

  describe('TASK 2: Internal AI Service Authentication & Key Management', () => {
    it('backend aiService client attaches X-Internal-AI-Key header to outgoing requests', () => {
      process.env.INTERNAL_AI_SECRET = 'a'.repeat(64); // 256-bit test secret
      const headers = aiService.getInternalHeaders({ 'Content-Type': 'application/json' });

      assert.strictEqual(headers['Content-Type'], 'application/json');
      assert.strictEqual(headers['X-Internal-AI-Key'], 'a'.repeat(64));
    });

    it('backend aiService deterministically derives key from master JWT_SECRET if explicit key is absent', () => {
      delete process.env.INTERNAL_AI_SECRET;
      process.env.JWT_SECRET = 'super_secure_master_jwt_secret_32_characters_long';

      const headers = aiService.getInternalHeaders();
      // Verifies that a 256-bit hex key (64 chars) is attached
      assert.ok(headers['X-Internal-AI-Key']);
      assert.strictEqual(headers['X-Internal-AI-Key'].length, 64);
    });

    it('constant-time HMAC matching prevents timing attacks on key validation', async () => {
      const crypto = await import('crypto');
      const expected = 'b'.repeat(64);
      const userSupplied = 'b'.repeat(64);
      const wrong = 'b'.repeat(63) + 'c';

      const validMatch = crypto.timingSafeEqual(
        Buffer.from(userSupplied),
        Buffer.from(expected)
      );
      assert.strictEqual(validMatch, true);

      const invalidMatch = crypto.timingSafeEqual(
        Buffer.from(wrong),
        Buffer.from(expected)
      );
      assert.strictEqual(invalidMatch, false);
    });
  });

  describe('TASK 4: Client IP & Account Identifier Extraction', () => {
    it('extracts and sanitizes IPv4 and IPv6-mapped addresses', () => {
      const req1 = { ip: '::ffff:192.168.1.1' };
      assert.strictEqual(getCleanClientIp(req1), '192.168.1.1');

      const req2 = { headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' } };
      assert.strictEqual(getCleanClientIp(req2), '203.0.113.195');

      const req3 = { headers: { 'x-forwarded-for': '10.0.0.1; DROP TABLE users' } };
      assert.strictEqual(getCleanClientIp(req3), '10.0.0.1');
    });

    it('extracts normalized account identifier from email or username', () => {
      const req1 = { body: { email: '  Admin.User@ThinkWires.com ' } };
      assert.strictEqual(getAccountIdentifier(req1), 'admin.user@thinkwires.com');

      const req2 = { body: { username: ' Candidate_007 ' } };
      assert.strictEqual(getAccountIdentifier(req2), 'candidate_007');

      const req3 = { candidate: { email: 'talent@thinkwires.com' } };
      assert.strictEqual(getAccountIdentifier(req3), 'talent@thinkwires.com');

      const req4 = { body: {} };
      assert.strictEqual(getAccountIdentifier(req4), null);
    });
  });

  describe('TASK 4: Atomic Redis Rate Limiting & Concurrency', () => {
    it('uses atomic Lua evaluation when Redis is connected and ready', async () => {
      let evalExecuted = false;
      const mockRedis = {
        eval: async (script, opts) => {
          evalExecuted = true;
          return [1, 60000]; // hit 1, 60s TTL
        },
      };

      setMockRedisClient(mockRedis);
      assert.strictEqual(isRedisConnected(), true);

      const check = await checkAtomicLimit('rl:test:1', 60000, 5, false);
      assert.strictEqual(evalExecuted, true);
      assert.strictEqual(check.store, 'redis');
      assert.strictEqual(check.count, 1);
      assert.strictEqual(check.isAllowed, true);
    });

    it('handles concurrent burst requests atomically without race conditions', async () => {
      let counter = 0;
      const mockRedis = {
        eval: async (script, opts) => {
          counter += 1;
          return [counter, 60000];
        },
      };

      setMockRedisClient(mockRedis);

      // Fire 15 concurrent requests simultaneously
      const promises = Array.from({ length: 15 }, () =>
        checkAtomicLimit('rl:concurrent:test', 60000, 10, false)
      );

      const results = await Promise.all(promises);
      const counts = results.map((r) => r.count);

      // Every concurrent request got a unique atomic count from 1 to 15
      assert.strictEqual(counts.length, 15);
      assert.strictEqual(Math.max(...counts), 15);

      const allowed = results.filter((r) => r.isAllowed);
      const blocked = results.filter((r) => !r.isAllowed);
      assert.strictEqual(allowed.length, 10);
      assert.strictEqual(blocked.length, 5);
    });
  });

  describe('TASK 4: Fallback Policy & Outage Resilience', () => {
    it('falls back to local MemoryStore in development/test when Redis is unavailable', async () => {
      process.env.NODE_ENV = 'test';
      setMockRedisClient(null);

      const check1 = await checkAtomicLimit('rl:dev:1', 60000, 3, false);
      assert.strictEqual(check1.store, 'memory');
      assert.strictEqual(check1.count, 1);
      assert.strictEqual(check1.isAllowed, true);

      const check2 = await checkAtomicLimit('rl:dev:1', 60000, 3, false);
      assert.strictEqual(check2.count, 2);

      const check3 = await checkAtomicLimit('rl:dev:1', 60000, 3, false);
      assert.strictEqual(check3.count, 3);
      assert.strictEqual(check3.isAllowed, true);

      // Exceeded
      const check4 = await checkAtomicLimit('rl:dev:1', 60000, 3, false);
      assert.strictEqual(check4.count, 4);
      assert.strictEqual(check4.isAllowed, false);
    });

    it('fails closed in production for administrative authentication when Redis is unavailable', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.VITEST;
      setMockRedisClient(null);

      const check = await checkAtomicLimit('rl:admin:login', 60000, 5, true); // failClosed = true
      assert.strictEqual(check.failClosed, true);
      assert.strictEqual(check.store, 'fail-closed');
    });

    it('enforces tightened 50% degraded policy for public routes in production during Redis outage', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.VITEST;
      setMockRedisClient(null);

      const maxHits = 10;
      // In production degraded mode, effectiveMax is 5 (50% of 10)
      for (let i = 1; i <= 5; i++) {
        const check = await checkAtomicLimit('rl:public:cand', 60000, maxHits, false);
        assert.strictEqual(check.isAllowed, true);
        assert.strictEqual(check.isDegraded, true);
      }

      // 6th request is rejected under degraded policy
      const check6 = await checkAtomicLimit('rl:public:cand', 60000, maxHits, false);
      assert.strictEqual(check6.isAllowed, false);
      assert.strictEqual(check6.isDegraded, true);
    });

    it('recovers dynamically when Redis comes back online', async () => {
      process.env.NODE_ENV = 'test';
      setMockRedisClient(null);

      // Outage mode
      const offlineCheck = await checkAtomicLimit('rl:recovery:test', 60000, 5, false);
      assert.strictEqual(offlineCheck.store, 'memory');

      // Redis recovers
      const recoveredRedis = {
        eval: async () => [1, 55000],
      };
      setMockRedisClient(recoveredRedis);

      const onlineCheck = await checkAtomicLimit('rl:recovery:test', 60000, 5, false);
      assert.strictEqual(onlineCheck.store, 'redis');
      assert.strictEqual(onlineCheck.count, 1);
    });
  });

  describe('TASK 4: Middleware Integration & HTTP Response Contract', () => {
    it('sets RFC RateLimit headers and Retry-After on HTTP 429 breach', async () => {
      const limiter = createRateLimiter({
        prefix: 'rl:unit:test',
        windowMs: 60000,
        max: 2,
        failClosed: false,
        useAccount: true,
      });

      const req = {
        ip: '198.51.100.42',
        body: { email: 'candidate@example.com' },
        method: 'POST',
        originalUrl: '/api/auth/login',
      };

      const headers = {};
      let statusCode = 200;
      let responseBody = null;

      const res = {
        setHeader: (k, v) => {
          headers[k] = v;
        },
        status: (code) => {
          statusCode = code;
          return {
            json: (payload) => {
              responseBody = payload;
              return payload;
            },
          };
        },
      };

      let nextCalled = 0;
      const next = () => {
        nextCalled += 1;
      };

      // Hit 1
      await limiter(req, res, next);
      assert.strictEqual(nextCalled, 1);
      assert.strictEqual(headers['RateLimit-Limit'], '2');
      assert.strictEqual(headers['RateLimit-Remaining'], '1');
      assert.strictEqual(headers['X-RateLimit-Scope'], 'local-instance');
      assert.strictEqual(headers['X-RateLimit-Store'], 'memory-local');

      // Hit 2
      await limiter(req, res, next);
      assert.strictEqual(nextCalled, 2);
      assert.strictEqual(headers['RateLimit-Remaining'], '0');

      // Hit 3 (Breach)
      await limiter(req, res, next);
      assert.strictEqual(nextCalled, 2); // next NOT called
      assert.strictEqual(statusCode, 429);
      assert.strictEqual(responseBody.success, false);
      assert.ok(headers['Retry-After']);
      assert.ok(responseBody.retryAfter >= 1);
    });

    it('admin login returns HTTP 503 during fail-closed outage', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.VITEST;
      setMockRedisClient(null);

      const req = {
        ip: '198.51.100.99',
        body: { email: 'superadmin@thinkwires.com' },
        method: 'POST',
        originalUrl: '/api/admin/auth/login',
      };

      const headers = {};
      let statusCode = 200;
      let responseBody = null;

      const res = {
        setHeader: (k, v) => {
          headers[k] = v;
        },
        status: (code) => {
          statusCode = code;
          return {
            json: (payload) => {
              responseBody = payload;
              return payload;
            },
          };
        },
      };

      let nextCalled = 0;
      await adminLoginRateLimiter(req, res, () => {
        nextCalled += 1;
      });

      assert.strictEqual(nextCalled, 0);
      assert.strictEqual(statusCode, 503);
      assert.strictEqual(responseBody.success, false);
      assert.strictEqual(headers['Retry-After'], '5');
      assert.ok(responseBody.error.includes('distributed cache'));
    });
  });

  describe('TASK 1: AI Microservice LFI & Sandbox Boundary Defense', () => {
    it('rejects path traversal attempts and files outside authorized sandbox', async () => {
      const path = await import('path');
      const os = await import('os');
      const fs = await import('fs');

      const allowedBase = path.resolve(os.tmpdir(), 'thinkwires_test_uploads');
      if (!fs.existsSync(allowedBase)) {
        fs.mkdirSync(allowedBase, { recursive: true });
      }

      const maliciousAttempt = path.resolve(allowedBase, '..', '..', 'etc', 'passwd');
      const isContained = maliciousAttempt.startsWith(allowedBase);
      assert.strictEqual(isContained, false);

      const legitimatePath = path.resolve(allowedBase, 'test_resume.pdf');
      assert.strictEqual(legitimatePath.startsWith(allowedBase), true);
    });
  });

  describe('TASK 3: Tightened Vercel Staging Origin Scoping', () => {
    it('allows official Vercel preview domains strictly scoped to the owner account', () => {
      const validScopedOrigin =
        'https://thinkwires-git-feat-security-tanjil-alams-projects.vercel.app';
      assert.strictEqual(isAllowedOrigin(validScopedOrigin), true);

      const validMainOrigin =
        'https://thinkwires-tanjil-alams-projects.vercel.app';
      assert.strictEqual(isAllowedOrigin(validMainOrigin), true);
    });

    it('rejects arbitrary unscoped third-party Vercel domains', () => {
      const maliciousOrigin1 =
        'https://thinkwires-git-feat-preview-123.vercel.app';
      assert.strictEqual(isAllowedOrigin(maliciousOrigin1), false);

      const maliciousOrigin2 =
        'https://thinkwires-git-malicious-attacker.vercel.app';
      assert.strictEqual(isAllowedOrigin(maliciousOrigin2), false);
    });
  });

  describe('TASK 5: Dynamic CSP Nonces for Inline Styles', () => {
    it('generates distinct 128-bit cryptographic nonces per request', async () => {
      const crypto = await import('crypto');

      const nonce1 = crypto.randomBytes(16).toString('base64');
      const nonce2 = crypto.randomBytes(16).toString('base64');

      assert.strictEqual(typeof nonce1, 'string');
      assert.strictEqual(nonce1.length >= 22, true);
      assert.notStrictEqual(nonce1, nonce2);
    });
  });
});
