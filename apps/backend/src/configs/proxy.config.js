import proxyAddr from 'proxy-addr';

/**
 * Standard trusted private network subnets according to RFC 1918, RFC 4193, and RFC 3927.
 * - loopback: 127.0.0.1/8, ::1/128
 * - linklocal: 169.254.0.0/16, fe80::/10
 * - uniquelocal: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7
 *
 * This matches standard cloud container hosting architectures (Render internal router,
 * AWS Application Load Balancers, Docker network bridges, Kubernetes overlay networks).
 */
export const DEFAULT_TRUSTED_SUBNETS = ['loopback', 'linklocal', 'uniquelocal'];

/**
 * Published Cloudflare Edge IPv4 and IPv6 CIDR blocks.
 * Reference: https://www.cloudflare.com/ips/
 */
export const CLOUDFLARE_IPS = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

/**
 * Resolves the raw trust proxy input based on environment variables or defaults (SEC-05).
 *
 * Supported topologies:
 * - 'loopback, linklocal, uniquelocal' or custom CIDRs
 * - 'cloudflare' (expands to standard private subnets + all Cloudflare edge CIDRs)
 * - Number of hops (e.g. '1', '2')
 * - Boolean ('true', 'false')
 * - Default: ['loopback', 'linklocal', 'uniquelocal']
 *
 * @param {string|number|boolean|undefined} envVal
 * @returns {Array<string>|number|boolean}
 */
export const resolveTrustProxyConfig = (envVal = process.env.TRUST_PROXY) => {
  if (envVal === undefined || envVal === null || envVal === '') {
    return DEFAULT_TRUSTED_SUBNETS;
  }

  const trimmed = String(envVal).trim().toLowerCase();

  if (trimmed === 'false') {
    return false;
  }

  if (trimmed === 'true') {
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '⚠️ [Security Warning: SEC-05] TRUST_PROXY=true trusts all reverse proxies unconditionally. In production, configure exact subnets or hop counts to prevent client IP spoofing.'
      );
    }
    return true;
  }

  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  if (trimmed === 'cloudflare') {
    return [...DEFAULT_TRUSTED_SUBNETS, ...CLOUDFLARE_IPS];
  }

  // Parse comma-separated list of subnets/CIDRs/IPs
  const parts = String(envVal)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : DEFAULT_TRUSTED_SUBNETS;
};

/**
 * Compiles a proxy trust predicate function using proxy-addr.
 * This guarantees Express only trusts immediate and intermediate connections
 * from verified proxy network topologies.
 *
 * @param {string|number|boolean|undefined} envVal
 * @returns {Function}
 */
export const getTrustProxyFunction = (envVal = process.env.TRUST_PROXY) => {
  const config = resolveTrustProxyConfig(envVal);

  if (typeof config === 'function') {
    return config;
  }

  if (config === true) {
    return () => true;
  }

  if (config === false) {
    return () => false;
  }

  if (typeof config === 'number') {
    return (addr, distance) => distance < config;
  }

  // Array of subnets / CIDRs
  return proxyAddr.compile(config);
};
