import { getRedisClient, isRedisConnected } from '../configs/redis.js';
import config from '../configs/dotenv.js';

/**
 * Atomic Lua script for Redis rate-limiting:
 * Atomically increments hit counter, sets expiration on first hit, and returns remaining TTL.
 * Completely eliminates race conditions between INCR and EXPIRE.
 */
const ATOMIC_RATE_LIMIT_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`;

/**
 * In-Memory fallback store for development, automated testing,
 * and monitored degraded mode during Redis outages.
 */
class MemoryRateLimitStore {
  constructor() {
    this.hits = new Map();
  }

  increment(key, windowMs) {
    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry || entry.resetTime <= now) {
      const resetTime = now + windowMs;
      this.hits.set(key, { count: 1, resetTime });
      return { count: 1, ttlMs: windowMs };
    }

    entry.count += 1;
    const ttlMs = Math.max(0, entry.resetTime - now);
    return { count: entry.count, ttlMs };
  }

  reset(key) {
    if (key) {
      this.hits.delete(key);
    } else {
      this.hits.clear();
    }
  }
}

export const inMemoryFallbackStore = new MemoryRateLimitStore();

/**
 * Sanitize client IP to avoid header injection and normalization issues.
 */
export const getCleanClientIp = (req) => {
  let rawIp = req.ip;
  if (!rawIp && req.headers && req.headers['x-forwarded-for']) {
    rawIp = String(req.headers['x-forwarded-for']).split(',')[0].trim();
  }
  if (!rawIp && req.socket) {
    rawIp = req.socket.remoteAddress;
  }
  if (!rawIp) {
    rawIp = '127.0.0.1';
  }
  // Isolate first IP token before any separators (; or space) and remove IPv6 mapping
  const cleanFirstToken = String(rawIp).split(/[;, ]/)[0].trim().replace(/^::ffff:/, '');
  const ipMatch = cleanFirstToken.match(/^[0-9a-fA-F:.]+/);
  return ipMatch ? ipMatch[0] : '127.0.0.1';
};

/**
 * Extract credential/account identifier if present in request payload.
 */
export const getAccountIdentifier = (req) => {
  if (req.body && typeof req.body.email === 'string' && req.body.email.trim()) {
    return req.body.email.trim().toLowerCase();
  }
  if (req.body && typeof req.body.username === 'string' && req.body.username.trim()) {
    return req.body.username.trim().toLowerCase();
  }
  if (req.candidate && req.candidate.email) {
    return String(req.candidate.email).trim().toLowerCase();
  }
  if (req.user && req.user.email) {
    return String(req.user.email).trim().toLowerCase();
  }
  return null;
};

/**
 * Atomically checks and increments a rate limit key against Redis or fallback.
 */
export const checkAtomicLimit = async (key, windowMs, maxHits, failClosed = false) => {
  const isProduction =
    (process.env.NODE_ENV || config.NODE_ENV) === 'production' &&
    !process.env.VITEST;
  const isConnected = isRedisConnected();

  if (isConnected) {
    try {
      const redis = await getRedisClient();
      if (redis) {
        let result = null;
        if (typeof redis.eval === 'function') {
          result = await redis.eval(ATOMIC_RATE_LIMIT_LUA, {
            keys: [key],
            arguments: [String(windowMs)],
          });
        } else if (typeof redis.sendCommand === 'function') {
          result = await redis.sendCommand([
            'EVAL',
            ATOMIC_RATE_LIMIT_LUA,
            '1',
            key,
            String(windowMs),
          ]);
        }

        if (Array.isArray(result) && result.length >= 2) {
          const count = Number(result[0]);
          const ttlMs = Math.max(0, Number(result[1]));
          return {
            count,
            ttlMs,
            isAllowed: count <= maxHits,
            isDegraded: false,
            store: 'redis',
          };
        }
      }
    } catch (redisErr) {
      console.warn(
        `[RateLimit] Redis command failed on key ${key}: ${redisErr.message}`
      );
    }
  }

  // --- REDIS OUTAGE / DISCONNECTED FALLBACK LOGIC ---
  if (isProduction && failClosed) {
    // Production Administrative Security: Fail closed when Redis is offline
    console.error(
      `🚨 [Security Alert] Redis cluster unavailable during fail-closed check on key: ${key}. Denying access to prevent distributed brute-force.`
    );
    return {
      failClosed: true,
      store: 'fail-closed',
    };
  }

  // Degraded In-Memory Policy for Public Routes
  const effectiveMax = isProduction ? Math.max(1, Math.floor(maxHits * 0.5)) : maxHits;
  if (isProduction) {
    console.warn(
      `⚠️ [Security Audit] DEGRADED_RATE_LIMIT_ACTIVE: Redis unavailable for key: ${key}. Operating under 50% tightened local memory policy (effectiveMax=${effectiveMax}).`
    );
  }

  const { count, ttlMs } = inMemoryFallbackStore.increment(key, windowMs);
  return {
    count,
    ttlMs,
    isAllowed: count <= effectiveMax,
    isDegraded: isProduction,
    store: 'memory',
  };
};

/**
 * Rate Limiter Factory creating Express middleware with dual IP + Account throttling
 */
export const createRateLimiter = (options = {}) => {
  const {
    prefix = 'rl:generic',
    windowMs = 15 * 60 * 1000,
    max = 20,
    failClosed = false,
    useAccount = true,
    message = 'Too many requests. Please try again later.',
  } = options;

  return async (req, res, next) => {
    const ip = getCleanClientIp(req);
    const account = useAccount ? getAccountIdentifier(req) : null;

    const ipKey = `${prefix}:ip:${ip}`;
    const ipCheck = await checkAtomicLimit(ipKey, windowMs, max, failClosed);

    if (ipCheck.failClosed) {
      res.setHeader('Retry-After', '5');
      return res.status(503).json({
        success: false,
        error:
          'Authentication service temporarily unavailable. Security controls require active distributed cache.',
        retryAfter: 5,
      });
    }

    let accountCheck = null;
    if (account) {
      const accountKey = `${prefix}:acc:${account}`;
      accountCheck = await checkAtomicLimit(accountKey, windowMs, max, failClosed);
      if (accountCheck.failClosed) {
        res.setHeader('Retry-After', '5');
        return res.status(503).json({
          success: false,
          error:
            'Authentication service temporarily unavailable. Security controls require active distributed cache.',
          retryAfter: 5,
        });
      }
    }

    const maxCount = accountCheck
      ? Math.max(ipCheck.count, accountCheck.count)
      : ipCheck.count;
    const maxTtlMs = accountCheck
      ? Math.max(ipCheck.ttlMs, accountCheck.ttlMs)
      : ipCheck.ttlMs;
    const isAllowed = ipCheck.isAllowed && (!accountCheck || accountCheck.isAllowed);
    const isDegraded = ipCheck.isDegraded || (accountCheck && accountCheck.isDegraded);

    const retryAfter = Math.max(1, Math.ceil(maxTtlMs / 1000));
    const remaining = Math.max(0, max - maxCount);
    const resetTimeSec = Math.ceil((Date.now() + maxTtlMs) / 1000);

    // Standard RFC RateLimit headers
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(resetTimeSec));

    if (isDegraded) {
      res.setHeader('X-RateLimit-Degraded', 'true');
    }

    if (!isAllowed) {
      res.setHeader('Retry-After', String(retryAfter));
      console.warn(
        `🚨 [RateLimit Audit] Rate limit exceeded on ${req.method} ${req.originalUrl} | IP: ${ip} | Account: ${account || 'none'} | RetryAfter: ${retryAfter}s | Store: ${ipCheck.store}`
      );
      return res.status(429).json({
        success: false,
        error:
          typeof message === 'string'
            ? message
            : `Too many requests. Please try again after ${retryAfter} seconds.`,
        retryAfter,
      });
    }

    next();
  };
};

/**
 * 1. Admin Login Policy (15 min window, 10 attempts, Fail-Closed in production)
 */
export const adminLoginRateLimiter = createRateLimiter({
  prefix: 'rl:admin:login',
  windowMs: 15 * 60 * 1000,
  max: 10,
  failClosed: true,
  message:
    'Too many administrative login attempts. Access is temporarily throttled for 15 minutes to protect system security.',
});

/**
 * 2. Candidate Login Policy (15 min window, 15 attempts, account + IP)
 */
export const candidateLoginRateLimiter = createRateLimiter({
  prefix: 'rl:cand:login',
  windowMs: 15 * 60 * 1000,
  max: 15,
  failClosed: false,
  message:
    'Too many authentication attempts. Please try again after 15 minutes.',
});

/**
 * 3. Candidate Registration Policy (60 min window, 10 registrations per IP)
 */
export const candidateRegisterRateLimiter = createRateLimiter({
  prefix: 'rl:cand:register',
  windowMs: 60 * 60 * 1000,
  max: 10,
  failClosed: false,
  message:
    'Too many accounts created from this network. Please wait before registering again.',
});

/**
 * 4. Password Recovery & Reset Policy (15 min window, 5 attempts)
 */
export const passwordResetRateLimiter = createRateLimiter({
  prefix: 'rl:auth:reset',
  windowMs: 15 * 60 * 1000,
  max: 5,
  failClosed: false,
  message:
    'Too many password recovery attempts. Please try again after 15 minutes.',
});

/**
 * 5. OTP / Verification Policy (10 min window, 5 attempts)
 */
export const otpVerificationRateLimiter = createRateLimiter({
  prefix: 'rl:auth:otp',
  windowMs: 10 * 60 * 1000,
  max: 5,
  failClosed: false,
  message:
    'Too many verification attempts. Please wait 10 minutes before requesting a new code.',
});

/**
 * 6. Token Refresh / Session Polling Policy (15 min window, 30 requests)
 */
export const tokenRefreshRateLimiter = createRateLimiter({
  prefix: 'rl:auth:refresh',
  windowMs: 15 * 60 * 1000,
  max: 30,
  failClosed: false,
  useAccount: false,
  message: 'Session verification rate limit exceeded. Please wait a moment.',
});

/**
 * 7. AI Microservice Invocation Policy (1 min window, 15 requests, Denial of Wallet protection)
 */
export const aiEndpointRateLimiter = createRateLimiter({
  prefix: 'rl:ai:service',
  windowMs: 60 * 1000,
  max: 15,
  failClosed: false,
  message:
    'AI screening processing quota reached. Please wait a minute before requesting another analysis.',
});

/**
 * 8. Public Lead & Requisition Submissions (15 min window, 30 submissions)
 */
export const publicLeadRateLimiter = createRateLimiter({
  prefix: 'rl:public:submission',
  windowMs: 15 * 60 * 1000,
  max: 30,
  failClosed: false,
  message:
    'Too many requests from this network. Please wait a few minutes before submitting again.',
});
