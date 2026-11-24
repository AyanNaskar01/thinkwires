let createClient;
try {
  const redisPkg = await import('redis');
  createClient = redisPkg.createClient;
} catch {
  createClient = null;
}
import config from './dotenv.js';

let redisClient = null;
let isRedisConnecting = false;
let isRedisReady = false;

const isTest = config.NODE_ENV === 'test' || process.env.NODE_ENV === 'test';

// Structured degradation tracking state
let redisDegradedState = {
  isDegraded: false,
  degradedSince: null,
  lastAlertAt: null,
  consecutiveFailures: 0,
  lastError: null,
};

/**
 * Triggers a security alert when distributed Redis cache encounters an outage or failure.
 * Throttles alert logging to prevent log flooding during persistent outages.
 */
export const alertRedisDegraded = (context, errorMsg) => {
  const now = Date.now();
  redisDegradedState.isDegraded = true;
  redisDegradedState.consecutiveFailures += 1;
  redisDegradedState.lastError = errorMsg || 'Unknown Redis error';
  if (!redisDegradedState.degradedSince) {
    redisDegradedState.degradedSince = new Date();
  }

  // Throttle alert logging to at most once every 30 seconds
  if (
    !redisDegradedState.lastAlertAt ||
    now - redisDegradedState.lastAlertAt > 30000
  ) {
    redisDegradedState.lastAlertAt = now;
    console.error(
      `🚨 [REDIS_DEGRADED_ALERT: SEC-04] Distributed cache outage in [${context}]: ${errorMsg}. ` +
        `Backend operating in DEGRADED mode. Multi-instance rate limiting and revocation consistency are impacted.`
    );
  }
};

/**
 * Resets degraded state when connection is successfully restored.
 */
export const markRedisHealthy = () => {
  if (redisDegradedState.isDegraded) {
    console.log(
      '✅ [REDIS_HEALTH_RESTORED] Distributed Redis connection re-established. Resuming cluster-wide rate limiting and revocation.'
    );
  }
  redisDegradedState = {
    isDegraded: false,
    degradedSince: null,
    lastAlertAt: null,
    consecutiveFailures: 0,
    lastError: null,
  };
};

export const getRedisHealth = () => ({
  isConnected: isRedisReady,
  isDegraded: redisDegradedState.isDegraded || !isRedisReady,
  degradedSince: redisDegradedState.degradedSince,
  consecutiveFailures: redisDegradedState.consecutiveFailures,
  lastError: redisDegradedState.lastError,
});

export const isRedisConnected = () => isRedisReady;

export const setMockRedisClient = (client) => {
  redisClient = client;
  isRedisReady = Boolean(client);
  isRedisConnecting = false;
  if (client) {
    markRedisHealthy();
  } else {
    redisDegradedState.isDegraded = true;
  }
};

/**
 * Initializes and retrieves the singleton Redis client.
 * Supports Upstash Redis (rediss:// TLS), cloud Redis, and local Redis.
 * Includes graceful connection handling and automatic in-memory fallback.
 */
export const getRedisClient = async () => {
  if (redisClient && isRedisReady) {
    return redisClient;
  }

  // In test environment without explicit REDIS_URL, bypass live socket connection
  if (isTest && !process.env.TEST_REDIS_URL) {
    return null;
  }

  if (!redisClient && !isRedisConnecting) {
    isRedisConnecting = true;
    const redisUrl =
      process.env.REDIS_URL || config.REDIS_URL || 'redis://localhost:6379';

    const isTls = redisUrl.startsWith('rediss://');
    const isUpstash = redisUrl.includes('upstash.io');

    try {
      redisClient = createClient({
        url: redisUrl,
        socket: {
          tls: isTls,
          reconnectStrategy: (retries) => {
            if (retries > 5) {
              return false; // Cease retrying if Redis is not running
            }
            return Math.min(retries * 100, 1000);
          },
          connectTimeout: 10000,
        },
      });

      redisClient.on('error', (err) => {
        isRedisReady = false;
        alertRedisDegraded('socket-error', err.message);
      });

      redisClient.on('ready', () => {
        isRedisReady = true;
        isRedisConnecting = false;
        markRedisHealthy();
        const provider = isUpstash ? 'Upstash Cloud' : isTls ? 'Cloud TLS' : 'Local';
        console.log(`[Redis] Connected: token revocation cache active (${provider}).`);
      });

      redisClient.on('end', () => {
        isRedisReady = false;
        isRedisConnecting = false;
        alertRedisDegraded('socket-end', 'Redis connection was closed by server or network blip');
      });

      await redisClient.connect();
      isRedisReady = true;
      isRedisConnecting = false;
      markRedisHealthy();
    } catch (err) {
      isRedisReady = false;
      isRedisConnecting = false;
      alertRedisDegraded('connection-failed', err.message || String(err));
      if (!isTest) {
        console.warn(
          '[Redis] Connection optional/bypassed:',
          err.message || err
        );
        console.log(
          '[Redis] Operating with in-memory revocation store fallback.'
        );
      }
      return null;
    }
  }

  return isRedisReady ? redisClient : null;
};

/**
 * Closes the Redis client connection gracefully on server shutdown.
 */
export const closeRedis = async () => {
  if (redisClient) {
    try {
      if (isRedisReady) {
        await redisClient.quit();
      }
    } catch {
      // Ignore cleanup error
    } finally {
      redisClient = null;
      isRedisReady = false;
      isRedisConnecting = false;
    }
  }
};

export default { getRedisClient, closeRedis, setMockRedisClient, isRedisConnected };
