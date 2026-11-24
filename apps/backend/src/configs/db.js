import { Sequelize } from 'sequelize';
import fs from 'fs';
import config from './dotenv.js';

const isProduction = config.NODE_ENV === 'production';
const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
);

/**
 * Resolves PostgreSQL CA certificate from environment variables or file paths.
 * Supports inline PEM strings, file paths via DB_CA_CERT, and DB_CA_CERT_PATH.
 *
 * @param {string} [caCertEnv]
 * @param {string} [caPathEnv]
 * @returns {string|null} PEM certificate content or null
 */
export const resolveCaCertificate = (
  caCertEnv = process.env.DB_CA_CERT,
  caPathEnv = process.env.DB_CA_CERT_PATH
) => {
  // 1. Explicit CA path
  if (caPathEnv) {
    if (fs.existsSync(caPathEnv)) {
      try {
        return fs.readFileSync(caPathEnv, 'utf8');
      } catch (err) {
        console.warn(
          `[PostgreSQL TLS] Warning: Failed to read DB_CA_CERT_PATH (${caPathEnv}):`,
          err.message
        );
      }
    }
  }

  // 2. DB_CA_CERT (inline PEM string or file path)
  if (caCertEnv) {
    if (caCertEnv.includes('-----BEGIN CERTIFICATE-----')) {
      return caCertEnv;
    }
    if (fs.existsSync(caCertEnv)) {
      try {
        return fs.readFileSync(caCertEnv, 'utf8');
      } catch (err) {
        console.warn(
          `[PostgreSQL TLS] Warning: Failed to read DB_CA_CERT file (${caCertEnv}):`,
          err.message
        );
      }
    }
    return caCertEnv;
  }

  return null;
};

/**
 * Resolves comprehensive PostgreSQL TLS and SSL connection parameters.
 *
 * In production, strict certificate verification (rejectUnauthorized: true)
 * is enforced by default to prevent Man-in-the-Middle (MITM) attacks.
 *
 * @param {object} [env=process.env] Environment dictionary
 * @param {string} [databaseUrl=config.DATABASE_URL] Connection string
 * @returns {object} Resolved TLS options
 */
export const resolvePostgresTlsConfig = (
  env = process.env,
  databaseUrl = config.DATABASE_URL
) => {
  const isProd = env.NODE_ENV === 'production';
  const isLocalhost =
    !databaseUrl ||
    databaseUrl.includes('localhost') ||
    databaseUrl.includes('127.0.0.1') ||
    databaseUrl.includes('::1');

  const isCloudManaged =
    typeof databaseUrl === 'string' &&
    (databaseUrl.includes('neon.tech') ||
      databaseUrl.includes('supabase.co') ||
      databaseUrl.includes('rds.amazonaws.com') ||
      databaseUrl.includes('render.com') ||
      databaseUrl.includes('azure.com') ||
      databaseUrl.includes('sslmode=require') ||
      databaseUrl.includes('ssl=true'));

  const enableSsl =
    env.DB_SSL === 'true' ||
    (env.DB_SSL !== 'false' && (isCloudManaged || (isProd && !isLocalhost)));

  // Strict TLS certificate verification
  const rejectUnauthorized = (() => {
    if (env.DB_SSL_REJECT_UNAUTHORIZED !== undefined) {
      return env.DB_SSL_REJECT_UNAUTHORIZED === 'true';
    }
    if (env.DB_CA_CERT || env.DB_CA_CERT_PATH || env.NODE_EXTRA_CA_CERTS) {
      return true;
    }
    // Enforce strict TLS certificate verification by default in production
    if (isProd) {
      return true;
    }
    return false;
  })();

  const ca = resolveCaCertificate(env.DB_CA_CERT, env.DB_CA_CERT_PATH);

  return {
    enableSsl,
    isCloudManaged,
    isLocalhost,
    rejectUnauthorized,
    ca,
    sslOptions: enableSsl
      ? {
          require: true,
          rejectUnauthorized,
          ...(ca ? { ca } : {}),
        }
      : null,
  };
};

const tlsConfig = resolvePostgresTlsConfig();

export const hasReadReplicaConfigured = () => Boolean(config.DATABASE_READ_URL);

export const sequelize = new Sequelize(config.DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: process.env.DB_LOGGING === 'true' ? console.log : false,
  dialectOptions: {
    connectTimeout: isServerless ? 3000 : (tlsConfig.isCloudManaged ? 10000 : 5000),
    ...(tlsConfig.sslOptions ? { ssl: tlsConfig.sslOptions } : {}),
  },
  pool: {
    max: isProduction ? 10 : 5,
    min: 0,
    acquire: 15000,
    idle: 5000,
  },
});

// Dedicated read-only replica connection (if DATABASE_READ_URL is configured)
export const sequelizeRead = config.DATABASE_READ_URL
  ? new Sequelize(config.DATABASE_READ_URL, {
      dialect: 'postgres',
      protocol: 'postgres',
      logging: process.env.DB_LOGGING === 'true' ? console.log : false,
      dialectOptions: {
        connectTimeout: isServerless ? 3000 : 5000,
        ...(resolvePostgresTlsConfig(process.env, config.DATABASE_READ_URL).sslOptions
          ? { ssl: resolvePostgresTlsConfig(process.env, config.DATABASE_READ_URL).sslOptions }
          : {}),
      },
      pool: {
        max: isProduction ? 10 : 5,
        min: 0,
        acquire: 15000,
        idle: 5000,
      },
    })
  : sequelize;

export const connectDB = async () => {
  try {
    await sequelize.authenticate();
    const target = isLocalhost ? 'Local PostgreSQL' : 'Cloud PostgreSQL';
    console.log(
      `[PostgreSQL] Connection established successfully (${target}, SSL: ${enableSsl}).`
    );
  } catch (error) {
    console.error('[PostgreSQL] Unable to connect to the database:', error);
    throw error;
  }
};

/**
 * Database Architecture Declaration (Issue #186)
 * MongoDB (Mongoose) is formally designated as the CANONICAL PRIMARY DOCUMENT STORE
 * for all business domain entities (Candidates, Jobs, Applications, Admin CMS, Placements).
 * PostgreSQL (Sequelize) is designated as the SECONDARY RELATIONAL STORE with bidirectional
 * synchronization for dual-mode persistence (User profiles, audit records).
 */
export const DATABASE_ARCHITECTURE = {
  PRIMARY_SOURCE_OF_TRUTH: 'MongoDB (Mongoose)',
  SECONDARY_RELATIONAL_STORE: 'PostgreSQL (Sequelize)',
  ROLE: 'Secondary Relational Store & Dual-Persistence Sync Target',
};
