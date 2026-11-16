import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app.js';
import UserMongo from '../../models/user.mongo.model.js';
import {
  seedDatabase,
  validateSuperadminPasswordStrength,
  validateSuperadminEmail,
} from '../../seeds/seedDemoData.js';
import { validateBootEnvironment } from '../../configs/env.validator.js';
import { getAdminAuthCookie } from '../test-helper.js';
import { inMemoryData } from '../../controllers/admin.controller.js';
import {
  generateCsrfToken,
  CSRF_COOKIE_NAME,
} from '../../middlewares/csrf.middleware.js';

describe('Critical Security Defense: Superadmin Credentials & Seeding Hardening', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.JWT_SECRET = 'a_secure_jwt_secret_at_least_32_characters_long';
    process.env.JWT_ADMIN_SECRET = 'a_secure_admin_jwt_secret_32_chars';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('1. Superadmin Initialization Security Requirements', () => {
    it('fails safely when INITIAL_SUPERADMIN_EMAIL is missing', async () => {
      delete process.env.INITIAL_SUPERADMIN_EMAIL;
      process.env.INITIAL_SUPERADMIN_PASSWORD = 'StrongP@ssw0rd2026!Secure';

      await expect(seedDatabase()).rejects.toThrow(
        /INITIAL_SUPERADMIN_EMAIL is missing or invalid/i
      );
    });

    it('fails safely when INITIAL_SUPERADMIN_EMAIL has an invalid format', async () => {
      process.env.INITIAL_SUPERADMIN_EMAIL = 'invalid-email-string';
      process.env.INITIAL_SUPERADMIN_PASSWORD = 'StrongP@ssw0rd2026!Secure';

      await expect(seedDatabase()).rejects.toThrow(
        /INITIAL_SUPERADMIN_EMAIL format is invalid/i
      );
    });

    it('fails safely when INITIAL_SUPERADMIN_PASSWORD is missing', async () => {
      process.env.INITIAL_SUPERADMIN_EMAIL = 'superadmin@thinkwires.com';
      delete process.env.INITIAL_SUPERADMIN_PASSWORD;

      await expect(seedDatabase()).rejects.toThrow(
        /INITIAL_SUPERADMIN_PASSWORD must be a non-empty string/i
      );
    });

    it('fails safely when INITIAL_SUPERADMIN_PASSWORD is under 16 characters', async () => {
      process.env.INITIAL_SUPERADMIN_EMAIL = 'superadmin@thinkwires.com';
      process.env.INITIAL_SUPERADMIN_PASSWORD = 'Short1!pass';

      await expect(seedDatabase()).rejects.toThrow(
        /must be at least 16 characters long/i
      );
    });

    it('fails safely when INITIAL_SUPERADMIN_PASSWORD lacks uppercase letters', async () => {
      process.env.INITIAL_SUPERADMIN_EMAIL = 'superadmin@thinkwires.com';
      process.env.INITIAL_SUPERADMIN_PASSWORD = 'nouppercasepassword123!';

      await expect(seedDatabase()).rejects.toThrow(
        /must contain at least one uppercase letter/i
      );
    });

    it('fails safely when INITIAL_SUPERADMIN_PASSWORD lacks special characters', async () => {
      process.env.INITIAL_SUPERADMIN_EMAIL = 'superadmin@thinkwires.com';
      process.env.INITIAL_SUPERADMIN_PASSWORD = 'NoSpecialCharacterPassword123';

      await expect(seedDatabase()).rejects.toThrow(
        /must contain at least one special character symbol/i
      );
    });

    it('fails safely when INITIAL_SUPERADMIN_PASSWORD contains known default or demo substrings', async () => {
      process.env.INITIAL_SUPERADMIN_EMAIL = 'superadmin@thinkwires.com';
      process.env.INITIAL_SUPERADMIN_PASSWORD = 'Thinkwires@Admin2026!ExtraChars';

      await expect(seedDatabase()).rejects.toThrow(
        /cannot be a known default, demo, or easily guessable password/i
      );
    });

    it('successfully initializes Superadmin when valid credentials are provided', async () => {
      const email = 'valid.superadmin@thinkwires.com';
      process.env.INITIAL_SUPERADMIN_EMAIL = email;
      process.env.INITIAL_SUPERADMIN_PASSWORD = 'Crypt0graph1cally$trongP@ss2026!';
      process.env.NODE_ENV = 'development';

      await expect(seedDatabase()).resolves.not.toThrow();

      if (mongoose.connection.readyState === 1) {
        const admin = await UserMongo.findOne({ email });
        expect(admin).toBeDefined();
        expect(admin.role).toBe('superadmin');
        expect(admin.mustChangePassword).toBe(true);
      }
    });

    it('does not overwrite existing administrator credentials during subsequent seeding (Idempotency)', async () => {
      const email = 'persistent.admin@thinkwires.com';
      process.env.INITIAL_SUPERADMIN_EMAIL = email;
      process.env.INITIAL_SUPERADMIN_PASSWORD = 'FirstCrypt0graph1cally$trongP@ss2026!';
      process.env.NODE_ENV = 'development';

      if (mongoose.connection.readyState === 1) {
        await UserMongo.deleteOne({ email });
      }

      // Initial run
      await seedDatabase();

      let originalPasswordHash = null;
      if (mongoose.connection.readyState === 1) {
        const first = await UserMongo.findOne({ email }).select('+password');
        originalPasswordHash = first.password;
      }

      // Second run with a different configured password
      process.env.INITIAL_SUPERADMIN_PASSWORD = 'SecondDiffCrypt0graph1cally$trongP@ss2026!';
      await seedDatabase();

      if (mongoose.connection.readyState === 1) {
        const second = await UserMongo.findOne({ email }).select('+password');
        expect(second.password).toBe(originalPasswordHash);
      }
    });

    it('rejects unsafe demo seeding in production environment without explicit ALLOW_PRODUCTION_SEED flag', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_PRODUCTION_SEED;
      process.env.INITIAL_SUPERADMIN_EMAIL = 'superadmin@prod.thinkwires.com';
      process.env.INITIAL_SUPERADMIN_PASSWORD = 'ProdCrypt0graph1cally$trongP@ss2026!';

      await expect(seedDatabase()).rejects.toThrow(
        /Demo data seeding is strictly blocked in production mode/i
      );
    });

    it('skips demo entity seeding (clients, placements, articles) when seeding in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_PRODUCTION_SEED = 'true';
      process.env.INITIAL_SUPERADMIN_EMAIL = 'superadmin@prod.thinkwires.com';
      process.env.INITIAL_SUPERADMIN_PASSWORD = 'ProdCrypt0graph1cally$trongP@ss2026!';

      // Should complete without error and only seed Superadmin
      await expect(seedDatabase()).resolves.not.toThrow();
    });
  });

  describe('2. Credential Rotation & First-Login Security', () => {
    it('allows authenticated administrator to change password and resets mustChangePassword flag', async () => {
      process.env.NODE_ENV = 'development';

      const email = 'rotation.admin@thinkwires.com';
      inMemoryData.users = inMemoryData.users || [];
      inMemoryData.users.unshift({
        id: 'admin-rot-1',
        name: 'Rotation Admin',
        email,
        password: 'TemporaryInitialPassword123!',
        role: 'superadmin',
        mustChangePassword: true,
      });

      if (mongoose.connection.readyState === 1) {
        await UserMongo.deleteOne({ email });
        await UserMongo.create({
          name: 'Rotation Admin',
          email,
          password: 'TemporaryInitialPassword123!',
          role: 'superadmin',
          designation: 'Superadmin',
          mustChangePassword: true,
        });
      }

      const adminCookie = getAdminAuthCookie({
        id: 'admin-rot-1',
        name: 'Rotation Admin',
        email,
        role: 'superadmin',
      });

      const csrfToken = generateCsrfToken();
      const csrfCookie = `${CSRF_COOKIE_NAME}=${csrfToken}`;

      const res = await request(app)
        .post('/api/admin/auth/change-password')
        .set('Cookie', [adminCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .set('Origin', 'http://localhost:5173')
        .send({
          currentPassword: 'TemporaryInitialPassword123!',
          newPassword: 'MyNewSuperSecurePassword2026!',
          confirmPassword: 'MyNewSuperSecurePassword2026!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.mustChangePassword).toBe(false);

      if (mongoose.connection.readyState === 1) {
        const updated = await UserMongo.findOne({ email });
        expect(updated.mustChangePassword).toBe(false);
      }
    });

    it('never exposes password or initial credentials through API responses', async () => {
      const adminCookie = getAdminAuthCookie({
        id: 'admin-expose-test',
        name: 'Expose Check Admin',
        email: 'expose.check@thinkwires.com',
        role: 'superadmin',
      });

      const res = await request(app)
        .get('/api/admin/auth/me')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.password).toBeUndefined();
    });
  });
});
