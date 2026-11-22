/**
 * HTTP Cache-Control and Network Transport Optimization Middleware
 *
 * Implements low-bandwidth and high-latency resilience:
 * - Public content routes: allows intermediate proxies, CDNs, and browser caches
 *   to serve stale content during network hiccups (stale-while-revalidate) and
 *   enables 304 Not Modified validation without payload re-transmission.
 * - Private / authenticated routes: strictly enforces no-store to protect sensitive
 *   state, PII, and credentials.
 */

export const publicContentCache = (maxAgeSeconds = 60, staleWhileRevalidateSeconds = 300) => {
  return (req, res, next) => {
    // Only cache safe idempotent read methods
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.set(
        'Cache-Control',
        `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`
      );
    }
    next();
  };
};

export const privateNoStore = (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
};
