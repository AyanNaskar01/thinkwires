import config from './dotenv.js';

const REQUIRED_PRODUCTION_VARS = [
  'JWT_SECRET',
  'JWT_ADMIN_SECRET',
  'JWT_CANDIDATE_SECRET',
  'MONGODB_URI',
];

/**
 * Validates environment configuration during startup (DEP-02, DEP-CFG-01).
 * Halts boot with fatal error if critical secrets or production database URIs are missing.
 *
 * @param {object} env Target environment object (defaults to process.env)
 * @returns {object} Validation result
 */
export const validateBootEnvironment = (env = process.env) => {
  const isProduction = env.NODE_ENV === 'production';
  const missing = [];

  for (const varName of REQUIRED_PRODUCTION_VARS) {
    if (!env[varName] || String(env[varName]).trim() === '') {
      missing.push(varName);
    }
  }

  if (isProduction && missing.length > 0) {
    const errorMsg = `🚨 [FATAL] Production boot halted. Missing required environment variables:\n${missing.map((v) => `   - ${v}`).join('\n')}\nPlease configure these secrets in your cloud platform (Railway/Render/AWS/K8s/Docker).`;
    console.error(errorMsg);
    if (!env.VITEST && env.NODE_ENV === 'production') {
      process.exit(1);
    }
    const err = new Error(errorMsg);
    err.missingVars = missing;
    throw err;
  }

  if (isProduction) {
    const mongoUri = env.MONGODB_URI || config.MONGODB_URI || '';
    if (mongoUri.includes('localhost') || mongoUri.includes('127.0.0.1')) {
      const errorMsg = '🚨 [FATAL] MONGODB_URI points to localhost/127.0.0.1 in production mode.';
      console.error(errorMsg);
      if (!env.VITEST && env.NODE_ENV === 'production') {
        process.exit(1);
      }
      throw new Error(errorMsg);
    }
  }

  return { isValid: true, isProduction, checkedVars: REQUIRED_PRODUCTION_VARS };
};

export default validateBootEnvironment;
