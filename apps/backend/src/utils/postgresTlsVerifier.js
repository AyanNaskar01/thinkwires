import tls from 'tls';
import { URL } from 'url';
import fs from 'fs';
import { resolveCaCertificate, resolvePostgresTlsConfig } from '../configs/db.js';

/**
 * Parses PostgreSQL connection string to extract host and port.
 *
 * @param {string} [connectionString]
 * @returns {{ host: string, port: number }}
 */
export const parsePostgresHostPort = (connectionString) => {
  if (!connectionString) {
    return { host: 'localhost', port: 5432 };
  }

  try {
    // If it starts with postgres:// or postgresql://
    const normalized = connectionString.startsWith('postgres')
      ? connectionString
      : `postgresql://${connectionString}`;
    const parsed = new URL(normalized);
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? parseInt(parsed.port, 10) : 5432,
    };
  } catch {
    // Regex fallback
    const match = connectionString.match(/@([^:/]+)(?::(\d+))?/);
    if (match) {
      return {
        host: match[1],
        port: match[2] ? parseInt(match[2], 10) : 5432,
      };
    }
    return { host: 'localhost', port: 5432 };
  }
};

/**
 * Probes and validates TLS handshake and certificate chain against a target TLS endpoint.
 *
 * Verifies:
 * - Server certificate signature against trusted CA chain
 * - Hostname identity matching Subject Alternative Names (SAN)
 * - Expiration and validity intervals
 * - Negotiated TLS protocol (TLSv1.2, TLSv1.3) and cipher suite
 *
 * @param {object} [options]
 * @param {string} [options.host] Target database host
 * @param {number} [options.port] Target database port
 * @param {string|Buffer} [options.ca] Custom CA certificate PEM
 * @param {boolean} [options.rejectUnauthorized=true] Whether to enforce strict verification
 * @param {number} [options.timeoutMs=5000] Handshake timeout
 * @param {string} [options.servername] SNI servername (defaults to host)
 * @returns {Promise<object>} Handshake verification results
 */
export const probeTlsHandshake = (options = {}) => {
  return new Promise((resolve, reject) => {
    const {
      host = 'localhost',
      port = 5432,
      ca,
      rejectUnauthorized = true,
      timeoutMs = 5000,
      servername = host,
    } = options;

    const tlsOptions = {
      host,
      port,
      servername,
      rejectUnauthorized,
      timeout: timeoutMs,
      ...(ca ? { ca } : {}),
    };

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const finishError = (err) => {
      if (settled) return;
      settled = true;
      resolve({
        verified: false,
        authorized: false,
        error: err.message,
        errorCode: err.code,
        host,
        port,
      });
    };

    const socket = tls.connect(tlsOptions, () => {
      const peerCert = socket.getPeerCertificate(true);
      const isAuthorized = socket.authorized;
      const authError = socket.authorizationError;

      const result = {
        verified: isAuthorized,
        authorized: isAuthorized,
        authorizationError: authError ? String(authError) : null,
        host,
        port,
        protocol: socket.getProtocol(),
        cipher: socket.getCipher(),
        peerCertificate: peerCert
          ? {
              subject: peerCert.subject,
              issuer: peerCert.issuer,
              validFrom: peerCert.valid_from,
              validTo: peerCert.valid_to,
              fingerprint: peerCert.fingerprint256 || peerCert.fingerprint,
              subjectAltName: peerCert.subjectaltname,
            }
          : null,
      };

      socket.end();
      finish(result);
    });

    socket.on('error', (err) => {
      socket.destroy();
      finishError(err);
    });

    socket.on('timeout', () => {
      socket.destroy();
      finishError(new Error(`TLS handshake timed out after ${timeoutMs}ms.`));
    });
  });
};

/**
 * Comprehensive verification of the active PostgreSQL TLS configuration.
 *
 * @param {object} [customConfig]
 * @returns {Promise<object>} Diagnostic report
 */
export const verifyActivePostgresTls = async (customConfig = {}) => {
  const env = customConfig.env || process.env;
  const dbUrl = customConfig.databaseUrl || process.env.DATABASE_URL;
  const tlsConfig = resolvePostgresTlsConfig(env, dbUrl);
  const { host, port } = parsePostgresHostPort(dbUrl);

  const report = {
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV || 'development',
    databaseHost: host,
    databasePort: port,
    sslEnabled: tlsConfig.enableSsl,
    isCloudManaged: tlsConfig.isCloudManaged,
    isLocalhost: tlsConfig.isLocalhost,
    strictVerification: tlsConfig.sslOptions ? Boolean(tlsConfig.sslOptions.rejectUnauthorized) : false,
    hasCustomCa: Boolean(tlsConfig.sslOptions?.ca),
    caSource: env.DB_CA_CERT_PATH ? 'DB_CA_CERT_PATH' : (env.DB_CA_CERT ? 'DB_CA_CERT' : 'System Default / Mozilla Roots'),
    probeResult: null,
  };

  if (tlsConfig.enableSsl) {
    report.probeResult = await probeTlsHandshake({
      host,
      port,
      ca: tlsConfig.sslOptions?.ca,
      rejectUnauthorized: tlsConfig.sslOptions?.rejectUnauthorized,
      timeoutMs: 4000,
    });
  }

  return report;
};

// CLI Entrypoint
const main = async () => {
  console.log('\n================================================================================');
  console.log('             POSTGRESQL TLS CERTIFICATE & CA CHAIN VERIFICATION');
  console.log('================================================================================');
  
  try {
    const report = await verifyActivePostgresTls();
    console.log(`Environment:           ${report.environment}`);
    console.log(`Target Host:          ${report.databaseHost}:${report.databasePort}`);
    console.log(`SSL Required:         ${report.sslEnabled}`);
    console.log(`Strict Verification:  ${report.strictVerification ? '✅ ACTIVE (rejectUnauthorized: true)' : '⚠️ INACTIVE (rejectUnauthorized: false)'}`);
    console.log(`CA Chain Source:      ${report.caSource}`);
    
    if (report.probeResult) {
      console.log('--------------------------------------------------------------------------------');
      console.log(`TLS Protocol:         ${report.probeResult.protocol || 'N/A'}`);
      console.log(`Negotiated Cipher:    ${report.probeResult.cipher?.name || 'N/A'}`);
      console.log(`CA Verification:      ${report.probeResult.authorized ? '✅ TRUSTED (Authorized)' : `❌ FAILED: ${report.probeResult.error || report.probeResult.authorizationError}`}`);
      if (report.probeResult.peerCertificate) {
        console.log(`Server Cert Subject:  ${JSON.stringify(report.probeResult.peerCertificate.subject)}`);
        console.log(`Server Cert Issuer:   ${JSON.stringify(report.probeResult.peerCertificate.issuer)}`);
        console.log(`Valid Interval:       ${report.probeResult.peerCertificate.validFrom} to ${report.probeResult.peerCertificate.validTo}`);
      }
    } else {
      console.log('\nℹ️ SSL is disabled for this database connection string.');
    }
    console.log('================================================================================\n');
  } catch (err) {
    console.error('TLS Verification Error:', err.message);
  }
};

if (process.argv[1] && process.argv[1].includes('postgresTlsVerifier.js')) {
  main();
}
