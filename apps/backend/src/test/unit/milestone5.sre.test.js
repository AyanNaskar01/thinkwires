import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import app, { setShuttingDown, getShuttingDown } from '../../app.js';
import { validateBootEnvironment } from '../../configs/env.validator.js';
import { StorageService } from '../../utils/storage.adapter.js';

const findProjectRoot = () => {
  const fileDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(fileDir, '../../../../..'),
    path.resolve(fileDir, '../../../..'),
    path.resolve(process.cwd()),
    path.resolve(process.cwd(), 'thinkwires'),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(path.join(p, 'Dockerfile'))) {
      return p;
    }
  }
  return process.cwd();
};

describe('Milestone 5: 12-Factor Portability & SRE Readiness Verification', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    setShuttingDown(false);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    setShuttingDown(false);
  });

  // =========================================================================
  // DEP-02: Boot-Time Environment Schema Validation & Crash-Fast Diagnostics
  // =========================================================================
  describe('DEP-02: Boot-Time Environment Schema Validation (validateBootEnvironment)', () => {
    it('passes successfully when all required production variables are provided', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a_very_secure_random_jwt_secret_32_characters_long';
      process.env.JWT_ADMIN_SECRET = 'a_very_secure_admin_jwt_secret_32_chars';
      process.env.JWT_CANDIDATE_SECRET = 'a_very_secure_cand_jwt_secret_32_chars';
      process.env.MONGODB_URI = 'mongodb+srv://user:pass@cluster0.thinkwires.mongodb.net/prod';
      process.env.INITIAL_SUPERADMIN_PASSWORD = 'V3ry$ecureP@ssw0rd!2026_Prod';
      process.env.INTERNAL_AI_SECRET = 'a'.repeat(64);

      expect(() => validateBootEnvironment()).not.toThrow();
    });

    it('throws error and lists missing secrets if required variables are omitted in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = '';
      delete process.env.JWT_ADMIN_SECRET;
      delete process.env.JWT_CANDIDATE_SECRET;
      delete process.env.MONGODB_URI;

      let caughtError = null;
      try {
        validateBootEnvironment();
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError.message).toContain('Production boot halted');
      expect(caughtError.missingVars).toEqual(
        expect.arrayContaining(['JWT_SECRET', 'JWT_ADMIN_SECRET', 'JWT_CANDIDATE_SECRET', 'MONGODB_URI'])
      );
    });

    it('rejects localhost MONGODB_URI in production mode to prevent silent dev fallbacks', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a_very_secure_random_jwt_secret_32_characters_long';
      process.env.JWT_ADMIN_SECRET = 'a_very_secure_admin_jwt_secret_32_chars';
      process.env.JWT_CANDIDATE_SECRET = 'a_very_secure_cand_jwt_secret_32_chars';
      process.env.MONGODB_URI = 'mongodb://localhost:27017/thinkwires_prod';

      expect(() => validateBootEnvironment()).toThrow(
        /points to localhost\/127\.0\.0\.1 in production/
      );
    });

    it('allows missing production secrets in development or test mode', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.JWT_SECRET;
      delete process.env.MONGODB_URI;

      expect(() => validateBootEnvironment()).not.toThrow();
    });
  });

  // =========================================================================
  // DEP-01: Pluggable Storage Service (StorageService)
  // =========================================================================
  describe('DEP-01: Pluggable Storage Adapter & Ephemeral Disk Decoupling', () => {
    const testDir = path.resolve(process.cwd(), 'uploads', 'test-sre');

    afterEach(async () => {
      if (fs.existsSync(testDir)) {
        await fs.promises.rm(testDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    it('sanitizes malicious directory traversal filenames', () => {
      const storage = new StorageService({ driver: 'local' });
      expect(storage.sanitizeFilename('../../../etc/passwd')).toBe('passwd');
      expect(storage.sanitizeFilename('..\\..\\windows\\system32\\cmd.exe')).not.toContain('..');
      expect(storage.sanitizeFilename('safe-candidate-resume.pdf')).toBe('safe-candidate-resume.pdf');
    });

    it('persists, streams, and deletes files using the local storage driver', async () => {
      const storage = new StorageService({
        driver: 'local',
        localBaseDir: testDir,
      });

      const testContent = Buffer.from('Test candidate resume content for SRE unit test');
      const filename = 'resume-test-01.pdf';

      // 1. Save file
      const relativeUrl = await storage.saveFile(testContent, filename, 'application/pdf', 'test-resumes');
      expect(relativeUrl).toBe(`/uploads/test-resumes/${filename}`);

      // 2. Read stream
      const stream = await storage.getFileStream(filename, 'test-resumes');
      expect(stream).toBeDefined();

      let chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const readContent = Buffer.concat(chunks).toString();
      expect(readContent).toBe(testContent.toString());

      // 3. Delete file
      const deleted = await storage.deleteFile(filename, 'test-resumes');
      expect(deleted).toBe(true);

      // Verify deletion
      await expect(storage.getFileStream(filename, 'test-resumes')).rejects.toThrow(/not found/);
    });

    it('resolves remote cloud URLs when configured with S3 driver', async () => {
      const s3Storage = new StorageService({
        driver: 's3',
        bucket: 'thinkwires-production-resumes',
        region: 'us-east-1',
        cdnDomain: 'cdn.thinkwires.com',
      });

      const url = s3Storage.getFileUrl('candidate-123.pdf', 'resumes');
      expect(url).toBe('https://cdn.thinkwires.com/resumes/candidate-123.pdf');

      const savedUrl = await s3Storage.saveFile(
        Buffer.from('fake'),
        'candidate-123.pdf',
        'application/pdf',
        'resumes'
      );
      expect(savedUrl).toBe('https://cdn.thinkwires.com/resumes/candidate-123.pdf');
    });
  });

  // =========================================================================
  // DEP-04 & DEP-05: Liveness & Readiness Observability Probes
  // =========================================================================
  describe('DEP-04 & DEP-05: Health, Liveness, and Readiness Endpoints', () => {
    it('GET /healthz returns 200 alive with process uptime and pid', async () => {
      const res = await request(app).get('/healthz');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'alive');
      expect(res.body).toHaveProperty('uptimeSeconds');
      expect(typeof res.body.uptimeSeconds).toBe('number');
      expect(res.body).toHaveProperty('pid', process.pid);
    });

    it('GET /ready returns datastore checks (MongoDB, PostgreSQL, Redis)', async () => {
      const res = await request(app).get('/ready');

      expect([200, 503]).toContain(res.status);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('checks');
      expect(res.body.checks).toHaveProperty('mongodb');
      expect(res.body.checks).toHaveProperty('postgresql');
      expect(res.body.checks).toHaveProperty('redis');
    });

    it('GET /api/health returns comprehensive subsystem health details', async () => {
      const res = await request(app).get('/api/health');

      expect([200, 503]).toContain(res.status);
      expect(res.body.service).toContain('Thinkwires');
      expect(res.body).toHaveProperty('databases');
      expect(res.body.databases).toHaveProperty('mongodb');
    });
  });

  // =========================================================================
  // DEP-06: Active Connection Draining & Teardown 503 Rejection
  // =========================================================================
  describe('DEP-06: Graceful Teardown & Connection Draining Middleware', () => {
    it('rejects incoming requests with HTTP 503 and Connection: close when shutting down', async () => {
      setShuttingDown(true);
      expect(getShuttingDown()).toBe(true);

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(503);
      expect(res.headers['connection']).toBe('close');
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('shutting down');
    });

    it('allows normal traffic when isShuttingDown is false', async () => {
      setShuttingDown(false);
      expect(getShuttingDown()).toBe(false);

      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // DEP-CON-01: Container Artifacts & Docker Configuration Specification
  // =========================================================================
  describe('DEP-CON-01: Production Container Artifacts & Portability Verification', () => {
    const rootDir = findProjectRoot();

    it('verifies multi-stage rootless Dockerfile exists and contains required SRE directives', () => {
      const dockerfilePath = path.resolve(rootDir, 'Dockerfile');
      expect(fs.existsSync(dockerfilePath)).toBe(true);

      const content = fs.readFileSync(dockerfilePath, 'utf8');
      expect(content).toContain('FROM node:20-alpine AS builder');
      expect(content).toContain('FROM node:20-alpine AS runner');
      expect(content).toContain('adduser --system --uid 1001 nodeapp');
      expect(content).toContain('USER nodeapp');
      expect(content).toContain('HEALTHCHECK');
      expect(content).toContain('ENV HOST=0.0.0.0');
      expect(content).toContain('ENV PORT=5000');
    });

    it('verifies .dockerignore excludes sensitive files and ephemeral paths', () => {
      const ignorePath = path.resolve(rootDir, '.dockerignore');
      expect(fs.existsSync(ignorePath)).toBe(true);

      const content = fs.readFileSync(ignorePath, 'utf8');
      expect(content).toContain('node_modules/');
      expect(content).toContain('.git/');
      expect(content).toContain('.env');
      expect(content).toContain('uploads/');
    });

    it('verifies docker-compose.yml defines multi-container architecture', () => {
      const composePath = path.resolve(rootDir, 'docker-compose.yml');
      expect(fs.existsSync(composePath)).toBe(true);

      const content = fs.readFileSync(composePath, 'utf8');
      expect(content).toContain('backend:');
      expect(content).toContain('mongo:');
      expect(content).toContain('postgres:');
      expect(content).toContain('redis:');
      expect(content).toContain('mongodb_data:');
      expect(content).toContain('postgres_data:');
    });
  });
});
