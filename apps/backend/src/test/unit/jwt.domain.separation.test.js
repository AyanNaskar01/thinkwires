import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getAdminJwtSecret,
  getCandidateJwtSecret,
} from '../../utils/auth.util.js';
import config from '../../configs/dotenv.js';

describe('Security Hardening: Issue 3 - JWT Secret Configuration Mismatch & Production Isolation', () => {
  const originalEnv = { ...process.env };
  const originalConfig = { ...config };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    Object.assign(config, originalConfig);
  });

  it('correctly reads JWT_ADMIN_SECRET matching .env.example naming', () => {
    delete process.env.ADMIN_JWT_SECRET;
    config.ADMIN_JWT_SECRET = undefined;
    process.env.JWT_ADMIN_SECRET = 'admin_secret_minimum_32_characters_long_for_test!';
    config.JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET;

    expect(getAdminJwtSecret()).toBe('admin_secret_minimum_32_characters_long_for_test!');
  });

  it('correctly reads JWT_CANDIDATE_SECRET matching .env.example naming', () => {
    delete process.env.CANDIDATE_JWT_SECRET;
    config.CANDIDATE_JWT_SECRET = undefined;
    process.env.JWT_CANDIDATE_SECRET = 'candidate_secret_minimum_32_characters_long_for_test!';
    config.JWT_CANDIDATE_SECRET = process.env.JWT_CANDIDATE_SECRET;

    expect(getCandidateJwtSecret()).toBe('candidate_secret_minimum_32_characters_long_for_test!');
  });

  it('refuses fallback to JWT_SECRET in production when JWT_ADMIN_SECRET is missing', () => {
    process.env.NODE_ENV = 'production';
    config.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'general_jwt_secret_min_32_characters_for_prod!';
    config.JWT_SECRET = process.env.JWT_SECRET;

    delete process.env.JWT_ADMIN_SECRET;
    delete process.env.ADMIN_JWT_SECRET;
    config.JWT_ADMIN_SECRET = undefined;
    config.ADMIN_JWT_SECRET = undefined;

    expect(() => getAdminJwtSecret()).toThrow(/required in production/i);
  });

  it('refuses fallback to JWT_SECRET in production when JWT_CANDIDATE_SECRET is missing', () => {
    process.env.NODE_ENV = 'production';
    config.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'general_jwt_secret_min_32_characters_for_prod!';
    config.JWT_SECRET = process.env.JWT_SECRET;

    delete process.env.JWT_CANDIDATE_SECRET;
    delete process.env.CANDIDATE_JWT_SECRET;
    config.JWT_CANDIDATE_SECRET = undefined;
    config.CANDIDATE_JWT_SECRET = undefined;

    expect(() => getCandidateJwtSecret()).toThrow(/required in production/i);
  });

  it('rejects identical secrets in production to prevent cross-domain token forging', () => {
    process.env.NODE_ENV = 'production';
    config.NODE_ENV = 'production';
    const sharedSecret = 'shared_identical_secret_value_32_characters_long';

    process.env.JWT_SECRET = sharedSecret;
    config.JWT_SECRET = sharedSecret;
    process.env.JWT_ADMIN_SECRET = sharedSecret;
    config.JWT_ADMIN_SECRET = sharedSecret;

    expect(() => getAdminJwtSecret()).toThrow(/distinct from JWT_SECRET in production/i);

    // When admin is distinct but candidate matches admin
    const distinctAdmin = 'distinct_admin_secret_value_32_characters_long';
    process.env.JWT_ADMIN_SECRET = distinctAdmin;
    config.JWT_ADMIN_SECRET = distinctAdmin;
    process.env.JWT_CANDIDATE_SECRET = distinctAdmin;
    config.JWT_CANDIDATE_SECRET = distinctAdmin;

    expect(() => getCandidateJwtSecret()).toThrow(/distinct from JWT_ADMIN_SECRET in production/i);
  });

  it('permits graceful fallback to JWT_SECRET in development/test environments', () => {
    process.env.NODE_ENV = 'development';
    config.NODE_ENV = 'development';
    const fallbackSecret = 'development_fallback_jwt_secret_32_chars_ok';
    process.env.JWT_SECRET = fallbackSecret;
    config.JWT_SECRET = fallbackSecret;

    delete process.env.JWT_ADMIN_SECRET;
    delete process.env.ADMIN_JWT_SECRET;
    config.JWT_ADMIN_SECRET = undefined;
    config.ADMIN_JWT_SECRET = undefined;

    expect(getAdminJwtSecret()).toBe(fallbackSecret);
  });
});
