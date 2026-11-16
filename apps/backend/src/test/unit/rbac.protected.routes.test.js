import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import {
  generateAdminToken,
  generateCandidateToken,
  getAdminJwtSecret,
} from '../../utils/auth.util.js';
import jwt from 'jsonwebtoken';

describe('Security Audit: Protected API Routes & RBAC Enforcement', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Route Protection & Authentication Enforcement (/api/admin/system-members)', () => {
    it('returns HTTP 401 when no authentication token is provided', async () => {
      const res = await request(app).get('/api/admin/system-members');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.authenticated).toBe(false);
      expect(res.body.error).toMatch(/authentication required/i);
    });

    it('returns HTTP 401 when tampered or invalid JWT is supplied', async () => {
      const res = await request(app)
        .get('/api/admin/system-members')
        .set('Cookie', 'thinkwires_admin_jwt=invalid.tampered.token.signature');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.authenticated).toBe(false);
      expect(res.body.error).toMatch(/invalid or forged/i);
    });

    it('returns HTTP 401 when token is signed with wrong key or candidate secret', async () => {
      const candidateToken = generateCandidateToken({
        id: 'candidate-intruder-1',
        email: 'intruder@candidate.com',
        role: 'candidate',
      });

      const res = await request(app)
        .get('/api/admin/system-members')
        .set('Cookie', `thinkwires_admin_jwt=${candidateToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('returns HTTP 401 when admin JWT has malformed or missing role claim', () => {
      const adminSecret = getAdminJwtSecret();
      const tokenWithoutRole = jwt.sign(
        { id: 'admin-no-role', email: 'norole@thinkwires.com' },
        adminSecret,
        { algorithm: 'HS256', expiresIn: '1h' }
      );

      return request(app)
        .get('/api/admin/system-members')
        .set('Cookie', `thinkwires_admin_jwt=${tokenWithoutRole}`)
        .expect(401)
        .then((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.error).toMatch(/malformed admin authentication credentials/i);
        });
    });

    it('returns HTTP 403 Forbidden when standard Admin attempts to access Superadmin endpoint', async () => {
      const adminToken = generateAdminToken({
        id: 'admin-manpower-1',
        email: 'recruiter.admin@thinkwires.com',
        role: 'admin',
        designation: 'Recruiter Admin',
      });

      const res = await request(app)
        .get('/api/admin/system-members')
        .set('Cookie', `thinkwires_admin_jwt=${adminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/access denied|permission denied|not authorized/i);
    });

    it('returns HTTP 403 Forbidden when CMS Admin attempts to access Superadmin endpoint', async () => {
      const cmsAdminToken = generateAdminToken({
        id: 'cms-admin-1',
        email: 'content.editor@thinkwires.com',
        role: 'cms_admin',
        designation: 'CMS Admin',
      });

      const res = await request(app)
        .get('/api/admin/system-members')
        .set('Cookie', `thinkwires_admin_jwt=${cmsAdminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/access denied|permission denied|not authorized/i);
    });

    it('allows access (HTTP 200) when authenticated user is explicitly a verified Superadmin', async () => {
      const superadminToken = generateAdminToken({
        id: 'super-root-1',
        email: 'superadmin.verified@thinkwires.com',
        role: 'superadmin',
        designation: 'Chief Technology Officer',
      });

      const res = await request(app)
        .get('/api/admin/system-members')
        .set('Cookie', `thinkwires_admin_jwt=${superadminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.members)).toBe(true);
    });
  });

  describe('Module Boundary Separation (/api/admin/employees & /api/admin/cms/pages)', () => {
    it('blocks CMS Admin from accessing Manpower / Employees endpoints with 403', async () => {
      const cmsAdminToken = generateAdminToken({
        id: 'cms-admin-2',
        email: 'cms.boundary@thinkwires.com',
        role: 'cms_admin',
      });

      const res = await request(app)
        .get('/api/admin/employees')
        .set('Cookie', `thinkwires_admin_jwt=${cmsAdminToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('RBAC_CMS_ADMIN_RESTRICTED');
    });

    it('blocks Manpower Admin from accessing CMS pages modification endpoints with 403', async () => {
      const manpowerToken = generateAdminToken({
        id: 'manpower-admin-2',
        email: 'recruiter.boundary@thinkwires.com',
        role: 'admin',
      });

      const res = await request(app)
        .get('/api/admin/cms/pages')
        .set('Cookie', `thinkwires_admin_jwt=${manpowerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('RBAC_ADMIN_CMS_RESTRICTED');
    });

    it('allows Superadmin uninhibited access across both Manpower and CMS modules', async () => {
      const superadminToken = generateAdminToken({
        id: 'super-root-2',
        email: 'super.cross@thinkwires.com',
        role: 'superadmin',
      });

      const empRes = await request(app)
        .get('/api/admin/employees')
        .set('Cookie', `thinkwires_admin_jwt=${superadminToken}`);
      expect(empRes.status).toBe(200);

      const cmsRes = await request(app)
        .get('/api/admin/cms/pages')
        .set('Cookie', `thinkwires_admin_jwt=${superadminToken}`);
      expect(cmsRes.status).toBe(200);
    });
  });
});
