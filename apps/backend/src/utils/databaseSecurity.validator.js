import { URL } from 'url';

const HIGH_PRIVILEGE_USERNAMES = new Set([
  'root',
  'postgres',
  'admin',
  'administrator',
  'sa',
  'system',
  'superuser',
  'dbadmin',
]);

/**
 * Parses connection string safely to extract username and hostname
 * without exposing embedded passwords.
 *
 * @param {string} uri Database connection URI
 * @returns {{ username: string|null, host: string|null, protocol: string|null, sanitizedUri: string }}
 */
export const inspectConnectionUri = (uri) => {
  if (!uri || typeof uri !== 'string') {
    return { username: null, host: null, protocol: null, sanitizedUri: '' };
  }

  try {
    const parsed = new URL(uri);
    const username = parsed.username ? decodeURIComponent(parsed.username) : null;
    const host = parsed.host || null;
    const protocol = parsed.protocol || null;
    const sanitizedUri = `${parsed.protocol}//${username ? `${username}:***@` : ''}${parsed.host}${parsed.pathname}`;

    return { username, host, protocol, sanitizedUri };
  } catch {
    // If not standard URL format (e.g. key=value format or corrupted), attempt basic regex
    const userMatch = uri.match(/:\/\/([^:@]+):[^@]+@([^/?]+)/);
    if (userMatch) {
      return {
        username: userMatch[1],
        host: userMatch[2],
        protocol: uri.split('://')[0],
        sanitizedUri: uri.replace(/:([^:@]+)@/, ':***@'),
      };
    }
    return { username: null, host: null, protocol: null, sanitizedUri: 'invalid_uri' };
  }
};

/**
 * Validates database account privilege level.
 * Emits warnings or returns violations if a high-privilege superuser is used.
 *
 * @param {string} username Database account username
 * @param {string} dbType 'mongodb' | 'postgresql'
 * @param {boolean} [isProduction=false]
 * @returns {{ isLeastPrivilege: boolean, isSuperuser: boolean, warning: string|null }}
 */
export const checkAccountPrivilege = (username, dbType = 'mongodb', isProduction = false) => {
  if (!username) {
    return {
      isLeastPrivilege: true,
      isSuperuser: false,
      warning: null,
    };
  }

  const normalized = username.trim().toLowerCase();
  const isSuperuser = HIGH_PRIVILEGE_USERNAMES.has(normalized);

  let warning = null;
  if (isSuperuser) {
    warning = `🚨 [SECURITY_RISK: LEAST_PRIVILEGE] ${dbType.toUpperCase()} is connected using superuser account '${username}'. In production, use dedicated least-privilege roles (e.g. 'app_rw_user' or 'app_ro_user').`;
  }

  return {
    isLeastPrivilege: !isSuperuser,
    isSuperuser,
    warning,
  };
};

/**
 * Audits database network restrictions and connectivity boundaries.
 *
 * @param {string} host Database host name or IP address
 * @param {boolean} [isProduction=false]
 * @returns {{ isNetworkRestricted: boolean, isLocalhost: boolean, warning: string|null }}
 */
export const checkNetworkRestrictions = (host, isProduction = false) => {
  if (!host) {
    return { isNetworkRestricted: false, isLocalhost: false, warning: 'Database host is missing' };
  }

  const isLocalhost =
    host.includes('localhost') || host.includes('127.0.0.1') || host.includes('::1');

  let warning = null;
  if (isProduction && isLocalhost) {
    warning = 'CRITICAL: Database host points to localhost in production mode.';
  }

  const isPrivateNetwork =
    isLocalhost ||
    host.includes('.internal') ||
    host.includes('.local') ||
    host.includes('.compute.internal') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);

  return {
    isNetworkRestricted: isPrivateNetwork || host.includes('mongodb.net') || host.includes('rds.amazonaws.com'),
    isLocalhost,
    warning,
  };
};

/**
 * Performs a comprehensive database security posture audit.
 *
 * @param {object} params
 * @param {string} params.mongoUri MongoDB primary connection URI
 * @param {string} [params.mongoReadUri] Optional MongoDB secondary/read connection URI
 * @param {string} params.postgresUrl PostgreSQL primary connection URL
 * @param {string} [params.postgresReadUrl] Optional PostgreSQL read replica URL
 * @param {boolean} [params.isProduction=false]
 * @returns {object} Database security posture report
 */
export const auditDatabaseSecurityPosture = ({
  mongoUri,
  mongoReadUri = null,
  postgresUrl,
  postgresReadUrl = null,
  isProduction = process.env.NODE_ENV === 'production',
}) => {
  const mongoInfo = inspectConnectionUri(mongoUri);
  const mongoPrivilege = checkAccountPrivilege(mongoInfo.username, 'mongodb', isProduction);
  const mongoNetwork = checkNetworkRestrictions(mongoInfo.host, isProduction);

  const pgInfo = inspectConnectionUri(postgresUrl);
  const pgPrivilege = checkAccountPrivilege(pgInfo.username, 'postgresql', isProduction);
  const pgNetwork = checkNetworkRestrictions(pgInfo.host, isProduction);

  const hasSeparateReadCredentials = Boolean(
    mongoReadUri ||
    postgresReadUrl ||
    process.env.DATABASE_READ_URL ||
    process.env.MONGODB_READ_URI
  );

  const warnings = [];
  if (mongoPrivilege.warning) warnings.push(mongoPrivilege.warning);
  if (pgPrivilege.warning) warnings.push(pgPrivilege.warning);
  if (mongoNetwork.warning) warnings.push(mongoNetwork.warning);
  if (pgNetwork.warning) warnings.push(pgNetwork.warning);

  const isCompliant =
    (!isProduction || (mongoPrivilege.isLeastPrivilege && pgPrivilege.isLeastPrivilege)) &&
    warnings.filter((w) => w.startsWith('CRITICAL')).length === 0;

  return {
    isCompliant,
    isProduction,
    hasSeparateReadCredentials,
    mongodb: {
      account: mongoInfo.username || 'default',
      isLeastPrivilege: mongoPrivilege.isLeastPrivilege,
      host: mongoInfo.host,
      isNetworkRestricted: mongoNetwork.isNetworkRestricted,
      hasReadReplica: Boolean(mongoReadUri || process.env.MONGODB_READ_URI),
    },
    postgresql: {
      account: pgInfo.username || 'default',
      isLeastPrivilege: pgPrivilege.isLeastPrivilege,
      host: pgInfo.host,
      isNetworkRestricted: pgNetwork.isNetworkRestricted,
      hasReadReplica: Boolean(postgresReadUrl || process.env.DATABASE_READ_URL),
    },
    warnings,
  };
};

export default {
  inspectConnectionUri,
  checkAccountPrivilege,
  checkNetworkRestrictions,
  auditDatabaseSecurityPosture,
};
