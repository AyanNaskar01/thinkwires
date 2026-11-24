import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import tls from 'tls';
import {
  resolveCaCertificate,
  resolvePostgresTlsConfig,
  sequelize,
} from '../../configs/db.js';
import {
  parsePostgresHostPort,
  probeTlsHandshake,
} from '../../utils/postgresTlsVerifier.js';
import { createEphemeralTlsFixtures } from './tlsFixtureHelper.js';

describe('PostgreSQL TLS & Strict Certificate Verification (Medium Priority)', () => {
  const originalEnv = { ...process.env };

  let fixtures;
  let trustedCaPem;
  let serverValidKey;
  let serverValidCert;
  let serverUntrustedKey;
  let serverUntrustedCert;
  let serverWrongHostKey;
  let serverWrongHostCert;

  beforeAll(() => {
    fixtures = createEphemeralTlsFixtures();
    trustedCaPem = fixtures.trustedCaPem;
    serverValidKey = fixtures.serverValidKey;
    serverValidCert = fixtures.serverValidCert;
    serverUntrustedKey = fixtures.serverUntrustedKey;
    serverUntrustedCert = fixtures.serverUntrustedCert;
    serverWrongHostKey = fixtures.serverWrongHostKey;
    serverWrongHostCert = fixtures.serverWrongHostCert;
  });

  afterAll(() => {
    if (fixtures && typeof fixtures.cleanup === 'function') {
      fixtures.cleanup();
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('1. TLS Configuration & Strict Production Verification Defaults', () => {
    it('enforces strict TLS verification (rejectUnauthorized: true) in production by default', () => {
      const config = resolvePostgresTlsConfig(
        { NODE_ENV: 'production' },
        'postgres://user:pass@ep-cool-app.neon.tech/thinkwires'
      );

      expect(config.enableSsl).toBe(true);
      expect(config.rejectUnauthorized).toBe(true);
      expect(config.sslOptions.rejectUnauthorized).toBe(true);
      expect(config.sslOptions.require).toBe(true);
    });

    it('permits rejectUnauthorized: false only when explicitly instructed via DB_SSL_REJECT_UNAUTHORIZED=false', () => {
      const config = resolvePostgresTlsConfig(
        {
          NODE_ENV: 'production',
          DB_SSL_REJECT_UNAUTHORIZED: 'false',
        },
        'postgres://user:pass@ep-cool-app.neon.tech/thinkwires'
      );

      expect(config.rejectUnauthorized).toBe(false);
      expect(config.sslOptions.rejectUnauthorized).toBe(false);
    });

    it('auto-activates SSL for cloud managed providers and query string ssl flags', () => {
      const neonConfig = resolvePostgresTlsConfig({}, 'postgres://user:pass@ep-pool.neon.tech/db');
      expect(neonConfig.enableSsl).toBe(true);
      expect(neonConfig.isCloudManaged).toBe(true);

      const supabaseConfig = resolvePostgresTlsConfig({}, 'postgres://postgres:pass@db.supabase.co:5432/postgres');
      expect(supabaseConfig.enableSsl).toBe(true);

      const rdsConfig = resolvePostgresTlsConfig({}, 'postgres://root:pass@prod-db.rds.amazonaws.com:5432/main');
      expect(rdsConfig.enableSsl).toBe(true);

      const renderConfig = resolvePostgresTlsConfig({}, 'postgres://user:pass@dpg-xxx.render.com/app');
      expect(renderConfig.enableSsl).toBe(true);

      const sslQueryConfig = resolvePostgresTlsConfig({}, 'postgres://user:pass@custom-host.net/db?sslmode=require');
      expect(sslQueryConfig.enableSsl).toBe(true);
    });

    it('leaves local development connections unencrypted by default unless DB_SSL is set', () => {
      const localConfig = resolvePostgresTlsConfig(
        { NODE_ENV: 'development' },
        'postgres://postgres:password@localhost:5432/thinkwires_dev'
      );

      expect(localConfig.enableSsl).toBe(false);
      expect(localConfig.sslOptions).toBeNull();
    });
  });

  describe('2. CA Certificate Resolution (Inline PEM vs File Paths)', () => {
    it('resolves inline PEM certificate string directly from DB_CA_CERT', () => {
      const caPem = '-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAgIU...==\n-----END CERTIFICATE-----';
      const resolved = resolveCaCertificate(caPem);

      expect(resolved).toBe(caPem);
    });

    it('reads CA certificate from file path specified in DB_CA_CERT_PATH', () => {
      const filePath = fixtures.trustedCaPath;
      const resolved = resolveCaCertificate(null, filePath);

      expect(resolved).toContain('BEGIN CERTIFICATE');
      expect(resolved).toContain('END CERTIFICATE');
    });

    it('reads CA certificate from file path if passed in DB_CA_CERT', () => {
      const filePath = fixtures.trustedCaPath;
      const resolved = resolveCaCertificate(filePath, null);

      expect(resolved).toContain('BEGIN CERTIFICATE');
    });

    it('returns null safely when no CA certificate or path is configured', () => {
      const resolved = resolveCaCertificate(undefined, undefined);
      expect(resolved).toBeNull();
    });
  });

  describe('3. End-to-End TLS Handshake & Strict Certificate Verification', () => {
    let testServer;
    let serverPort;

    const startTestServer = (cert, key) => {
      return new Promise((resolve) => {
        testServer = tls.createServer({ cert, key }, (socket) => {
          socket.write('CONNECTED');
          socket.pipe(socket);
        });

        testServer.listen(0, '127.0.0.1', () => {
          serverPort = testServer.address().port;
          resolve(serverPort);
        });
      });
    };

    const stopTestServer = () => {
      return new Promise((resolve) => {
        if (testServer && testServer.listening) {
          testServer.close(() => resolve());
        } else {
          resolve();
        }
      });
    };

    afterEach(async () => {
      await stopTestServer();
    });

    it('TEST 1: Successfully completes TLS handshake when server certificate is trusted by CA chain', async () => {
      // Server presenting valid cert signed by Trusted CA
      await startTestServer(serverValidCert, serverValidKey);

      const result = await probeTlsHandshake({
        host: '127.0.0.1',
        port: serverPort,
        servername: 'localhost',
        ca: trustedCaPem,
        rejectUnauthorized: true,
      });

      expect(result.verified).toBe(true);
      expect(result.authorized).toBe(true);
      expect(result.authorizationError).toBeNull();
      expect(result.protocol).toMatch(/TLSv1\.[23]/);
      expect(result.peerCertificate).toBeDefined();
      expect(result.peerCertificate.subject.CN).toBe('localhost');
      expect(result.peerCertificate.issuer.CN).toBe('Trusted Thinkwires DB CA');
    });

    it('TEST 2: Strictly REJECTS connection when server certificate is signed by an untrusted rogue CA', async () => {
      // Server presenting cert signed by Untrusted CA
      await startTestServer(serverUntrustedCert, serverUntrustedKey);

      const result = await probeTlsHandshake({
        host: '127.0.0.1',
        port: serverPort,
        servername: 'localhost',
        ca: trustedCaPem, // Only trusting the genuine CA!
        rejectUnauthorized: true,
      });

      expect(result.verified).toBe(false);
      expect(result.authorized).toBe(false);
      // Handshake must fail with certificate validation error
      expect(result.error || result.authorizationError).toMatch(
        /unable to verify the first certificate|UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED_CERT|CERT_SIGNATURE_FAILURE/i
      );
    });

    it('TEST 3: Strictly REJECTS connection when server certificate SAN does not match target hostname', async () => {
      // Server presenting valid cert signed by Trusted CA, but for evil.corp.internal
      await startTestServer(serverWrongHostCert, serverWrongHostKey);

      const result = await probeTlsHandshake({
        host: '127.0.0.1',
        port: serverPort,
        servername: 'localhost', // Mismatched hostname
        ca: trustedCaPem,
        rejectUnauthorized: true,
      });

      expect(result.verified).toBe(false);
      expect(result.authorized).toBe(false);
      expect(result.error || result.authorizationError).toMatch(
        /ERR_TLS_CERT_ALTNAME_INVALID|Hostname\/IP does not match certificate/
      );
    });

    it('TEST 4: Demonstrates MITM vulnerability when rejectUnauthorized: false is dangerously used', async () => {
      // Server presenting untrusted rogue certificate
      await startTestServer(serverUntrustedCert, serverUntrustedKey);

      const result = await probeTlsHandshake({
        host: '127.0.0.1',
        port: serverPort,
        servername: 'localhost',
        ca: trustedCaPem,
        rejectUnauthorized: false, // Insecure mode!
      });

      // Socket successfully connected despite invalid cert
      expect(result.authorized).toBe(false);
      expect(result.authorizationError).toBeDefined();
      // Notice: The TLS socket connected without throwing error!
      expect(result.protocol).toBeDefined();
    });
  });

  describe('4. Sequelize Connection & Connection String Parsing', () => {
    it('parses host and port from diverse PostgreSQL connection strings', () => {
      const parsed1 = parsePostgresHostPort('postgresql://dbuser:secpass@db.neon.tech:5432/proddb');
      expect(parsed1.host).toBe('db.neon.tech');
      expect(parsed1.port).toBe(5432);

      const parsed2 = parsePostgresHostPort('postgres://user:pass@aws-rds-custom.internal:6543/app');
      expect(parsed2.host).toBe('aws-rds-custom.internal');
      expect(parsed2.port).toBe(6543);

      const parsed3 = parsePostgresHostPort(null);
      expect(parsed3.host).toBe('localhost');
      expect(parsed3.port).toBe(5432);
    });

    it('exports initialized sequelize instance configured with connection timeout', () => {
      expect(sequelize).toBeDefined();
      expect(sequelize.options.dialect).toBe('postgres');
      expect(sequelize.options.dialectOptions.connectTimeout).toBeGreaterThanOrEqual(3000);
    });
  });
});
