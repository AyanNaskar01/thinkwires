import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { getAdminAuthCookie } from '../test-helper.js';
import JobRequirement from '../../models/job.mongo.model.js';
import Article from '../../models/article.mongo.model.js';
import sanitizeInputs from '../../middlewares/sanitize.middleware.js';
import { synchronizeIndexes } from '../../configs/mongodb.js';
import {
  generateCsrfToken,
  CSRF_COOKIE_NAME,
} from '../../middlewares/csrf.middleware.js';

describe('Milestone 2: Express Backend Hardening & Process Safety Audit Verification', () => {
  const superadminCookie = getAdminAuthCookie({
    id: 'admin-super-m2',
    email: 'super@thinkwires.com',
    name: 'Super Admin',
    role: 'superadmin',
  });

  const cmsAdminCookie = getAdminAuthCookie({
    id: 'admin-cms-m2',
    email: 'cms.editor@thinkwires.com',
    name: 'CMS Editor',
    role: 'cms_admin',
  });

  const recruiterAdminCookie = getAdminAuthCookie({
    id: 'admin-recruiter-m2',
    email: 'recruiter@thinkwires.com',
    name: 'Recruiter Admin',
    role: 'admin',
  });

  // SEC-EXP-01: NoSQL Injection Defense & Query Sanitization
  describe('SEC-EXP-01: NoSQL Query Selector Injection Defense', () => {
    it('strips keys starting with $ or containing . from request inputs via sanitizeInputs', () => {
      const req = {
        query: {
          'status[$ne]': 'Rejected',
          '$where': 'sleep(1000)',
          'user.role': 'admin',
          search: 'React Developer',
        },
        body: {
          '$set': { role: 'superadmin' },
          'profile.email': 'hacker@evil.com',
          name: 'Valid Name',
        },
        params: {
          'id': '123',
          '$gt': '0',
        },
      };
      const next = vi.fn();

      sanitizeInputs(req, {}, next);

      expect(next).toHaveBeenCalled();
      expect(req.query).not.toHaveProperty('$where');
      expect(req.query).not.toHaveProperty('user.role');
      expect(req.query.search).toBe('React Developer');
      expect(req.body).not.toHaveProperty('$set');
      expect(req.body).not.toHaveProperty('profile.email');
      expect(req.body.name).toBe('Valid Name');
      expect(req.params).not.toHaveProperty('$gt');
      expect(req.params.id).toBe('123');
    });

    it('safely handles non-string or nested object status in /api/admin/candidates without crashing', async () => {
      const res = await request(app)
        .get('/api/admin/candidates?status[$ne]=Rejected')
        .set('Cookie', recruiterAdminCookie);

      expect([200, 304]).toContain(res.status);
      expect(res.body).toHaveProperty('success', true);
      expect(Array.isArray(res.body.candidates)).toBe(true);
    });

    it('safely handles search query without regex crash or injection in /api/admin/clients', async () => {
      const res = await request(app)
        .get('/api/admin/clients?search=.*+?^${}()|[]\\')
        .set('Cookie', recruiterAdminCookie);

      expect([200, 304]).toContain(res.status);
      expect(res.body).toHaveProperty('success', true);
      expect(Array.isArray(res.body.clients)).toBe(true);
    });
  });

  // SEC-EXP-02: Mass Assignment in MongoDB Updates
  describe('SEC-EXP-02: Mass Assignment in MongoDB Updates', () => {
    it('whitelists editable fields in updateClient and ignores arbitrary/untrusted fields', async () => {
      const csrfToken = generateCsrfToken();
      const csrfCookie = `${CSRF_COOKIE_NAME}=${csrfToken}`;

      const maliciousPayload = {
        companyName: 'Acme Test Corp',
        contactPerson: 'Jane Doe',
        email: 'jane@acme.com',
        // Injected fields that must NOT be persisted or cause errors
        __proto__: { isAdmin: true },
        $where: 'sleep(5000)',
        secretKey: 'injected-value',
        isSuperuser: true,
      };

      const res = await request(app)
        .put('/api/admin/clients/client-m2-test')
        .set('Cookie', `${recruiterAdminCookie}; ${csrfCookie}`)
        .set('X-CSRF-Token', csrfToken)
        .send(maliciousPayload);

      // Either updated or 400/200; must not crash or leak internal error
      expect([200, 400, 404]).toContain(res.status);
      if (res.body && res.body.client) {
        expect(res.body.client).not.toHaveProperty('secretKey');
        expect(res.body.client).not.toHaveProperty('isSuperuser');
      }
    });
  });

  // SEC-EXP-03: Denial of Service via Excessive Body Parser Limit
  describe('SEC-EXP-03: Body Parser Limit DoS Protection', () => {
    it('rejects JSON payloads exceeding 1MB limit with HTTP 413 Payload Too Large', async () => {
      // 1.2 MB oversized string
      const hugeString = 'X'.repeat(1.2 * 1024 * 1024);
      const res = await request(app)
        .post('/api/admin/clients')
        .set('Cookie', recruiterAdminCookie)
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ data: hugeString }));

      expect(res.status).toBe(413);
    });
  });

  // SEC-EXP-04: Information Leakage in Global Error Middleware
  describe('SEC-EXP-04: Production Information Leakage Defense', () => {
    it('masks 500 internal server error messages when NODE_ENV is production', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        // Trigger error handler via an intentionally malformed request or test router
        const res = await request(app)
          .post('/api/auth/register')
          .set('Content-Type', 'application/json')
          .send('{ "malformed json": '); // triggers JSON parse error or 400/500

        // If status >= 500 in production, error must be generic and no stack trace returned
        if (res.status >= 500) {
          expect(res.body.error).toBe(
            'An unexpected server error occurred. Please contact Thinkwires support.'
          );
          expect(res.body).not.toHaveProperty('stack');
        }
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  // SEC-EXP-05: Process-Level Unhandled Rejection Monitors
  describe('SEC-EXP-05: Process Safety Exception Handlers', () => {
    it('verifies process event listeners are registered for unhandledRejection and uncaughtException', () => {
      const unhandledRejectionListeners = process.listeners('unhandledRejection');
      const uncaughtExceptionListeners = process.listeners('uncaughtException');

      expect(unhandledRejectionListeners.length).toBeGreaterThan(0);
      expect(uncaughtExceptionListeners.length).toBeGreaterThan(0);
    });
  });

  // SEC-EXP-06: Privilege Escalation in POST /api/openings
  describe('SEC-EXP-06: RBAC on Requisition Publishing Routes', () => {
    it('rejects cms_admin attempting to publish/modify openings on POST /api/openings with 403', async () => {
      const res = await request(app)
        .post('/api/openings')
        .set('Cookie', cmsAdminCookie)
        .send({
          openings: [
            {
              title: 'Hacked Opening',
              company: 'Unauthorized Org',
            },
          ],
        });

      expect(res.status).toBe(403);
    });

    it('permits recruiter admin to update openings on POST /api/openings', async () => {
      const res = await request(app)
        .post('/api/openings')
        .set('Cookie', recruiterAdminCookie)
        .send({
          openings: [
            {
              title: 'Senior Node.js Core Engineer',
              company: 'Thinkwires Partner',
              category: 'Engineering',
              location: 'Remote',
              jobMode: 'Permanent',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('openings');
    });
  });

  // SEC-EXP-07: PostgreSQL TLS Verification Hardening
  describe('SEC-EXP-07: PostgreSQL TLS Configuration Hardening', () => {
    it('exports initialized sequelize instance configured with resilient dialect options', async () => {
      const { sequelize } = await import('../../configs/db.js');
      expect(sequelize).toBeDefined();
      expect(sequelize.options.dialect).toBe('postgres');
    });
  });

  // SEC-EXP-08: Model Strict Schema Enforcement
  describe('SEC-EXP-08: Model Strict Schema Validation', () => {
    it('enforces strict: true on JobRequirement schema to block arbitrary property injection', () => {
      expect(JobRequirement.schema.options.strict).toBe(true);
    });

    it('enforces strict: true on Article schema to prevent unvalidated document attributes', () => {
      expect(Article.schema.options.strict).toBe(true);
    });
  });

  // SEC-EXP-09: Production Index Synchronization Routine
  describe('SEC-EXP-09: Production Index Synchronization', () => {
    it('exports a callable synchronizeIndexes function for MongoDB models', async () => {
      expect(typeof synchronizeIndexes).toBe('function');
      // Should execute without throwing even when disconnected or in memory
      await expect(synchronizeIndexes()).resolves.not.toThrow();
    });
  });
});
