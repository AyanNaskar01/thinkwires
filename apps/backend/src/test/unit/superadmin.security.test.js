import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app.js';
import UserMongo from '../../models/user.mongo.model.js';
import { seedDatabase } from '../../seeds/seedDemoData.js';
import { validateBootEnvironment } from '../../configs/env.validator.js';
import { getAdminAuthCookie } from '../test-helper.js';
import { inMemoryData } from '../../controllers/admin.controller.js';
import {
  generateCsrfToken,
  CSRF_COOKIE_NAME,
} from '../../middlewares/csrf.middleware.js';

describe('Critical Security Defense: Superadmin Credentials & Password Rotation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.JWT_SECRET = 'a_secure_jwt_secret_at_least_32_characters_long';
    process.env.JWT_ADMIN_SECRET = 'a_secure_admin_jwt_secret_32_chars';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('1. Production Seeding Refusal & Validation', () => {
    it('refuses production seeding if INITIAL_SUPERADMIN_EMAIL or PASSWORD is missing', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.INITIAL_SUPERADMIN_EMAIL;
      delete process.env.INITIAL_SUPERADMIN_PASSWORD;

      await expect(seedDatabase()).rejects.toThrow(
        /Refusing production seed: Missing required INITIAL_SUPERADMIN_EMAIL or INITIAL_SUPERADMIN_PASSWORD/
      );
    });

    it('refuses production seeding if INITIAL_SUPERADMIN_PASSWORD is a known default or demo value', async () => {
      process.env.NODE_ENV = 'production';
      process.env.INITIAL_SUPERADMIN_EMAIL = 'superadmin@prod.thinkwires.com';
      process.env.INITIAL_SUPERADMIN_PASSWORD = 'Thinkwires@Admin2026!';

      await expect(seedDatabase()).rejects.toThrow(
        /cannot be a known default, demo password, or under 16 characters/
      );
    });

    it('refuses production boot in validateBootEnvironment if INITIAL_SUPERADMIN_PASSWORD contains a known default', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a_secure_jwt_secret_at_least_32_characters_long';
      process.env.JWT_ADMIN_SECRET = 'a_secure_admin_jwt_secret_32_chars';
      process.env.JWT_CANDIDATE_SECRET = 'a_secure_cand_jwt_secret_32_chars';
      process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster.mongodb.net/prod';
      process.env.INITIAL_SUPERADMIN_PASSWORD = 'Thinkwires@Admin2026!';

      expect(() => validateBootEnvironment()).toThrow(
        /INITIAL_SUPERADMIN_PASSWORD cannot be a known default/
      );
    });
  });

  describe('2. Ephemeral Random Password Generation in Development', () => {
    it('generates a random secure password and sets mustChangePassword to true in development', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.INITIAL_SUPERADMIN_PASSWORD;
      process.env.INITIAL_SUPERADMIN_EMAIL = 'test.dev.super@thinkwires.com';

      // Seed database
      await seedDatabase();

      if (mongoose.connection.readyState === 1) {
        const user = await UserMongo.findOne({ email: 'test.dev.super@thinkwires.com' });
        expect(user).toBeDefined();
        expect(user.mustChangePassword).toBe(true);
      }
    }, 20000);
  });

  describe('3. Production Login Defense & Credential Rotation', () => {
    it('rejects known default passwords during production login with HTTP 403', async () => {
      process.env.NODE_ENV = 'production';

      const res = await request(app)
        .post('/api/admin/auth/login')
        .send({
          email: 'superadmin@thinkwires.com',
          password: 'Thinkwires@Admin2026!',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Default demo credentials are not permitted in production');
    });

    it('allows authenticated administrator to change password and resets mustChangePassword flag', async () => {
      process.env.NODE_ENV = 'development';

      // Create test admin with mustChangePassword = true
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

      // Execute password change
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
  });
});
