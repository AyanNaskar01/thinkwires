import { describe, it, expect, vi } from 'vitest';
import {
  requireCandidateAuth,
  requireRole,
} from '../../middlewares/auth.middleware.js';
import {
  generateCandidateToken,
  revokeToken,
  clearRevocationStore,
} from '../../utils/auth.util.js';

describe('Auth Middleware (Unit Tests)', () => {
  const createMockReqRes = (options = {}) => {
    const req = {
      cookies: options.cookies || {},
      headers: options.headers || {},
      ...options.reqOverrides,
    };
    const res = {
      statusCode: 200,
      jsonData: null,
      status: vi.fn().mockImplementation(function (code) {
        this.statusCode = code;
        return this;
      }),
      json: vi.fn().mockImplementation(function (data) {
        this.jsonData = data;
        return this;
      }),
    };
    const next = vi.fn();
    return { req, res, next };
  };

  beforeEach(async () => {
    await clearRevocationStore();
  });

  describe('requireCandidateAuth', () => {
    it('returns 401 when no cookie or authorization header is present', async () => {
      const { req, res, next } = createMockReqRes();

      await requireCandidateAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.jsonData.authenticated).toBe(false);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when token is invalid or corrupted', async () => {
      const { req, res, next } = createMockReqRes({
        cookies: { thinkwires_candidate_jwt: 'invalid.corrupted.token' },
      });

      await requireCandidateAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.jsonData.error).toMatch(/invalid or forged/i);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when candidate token has been revoked', async () => {
      const validToken = generateCandidateToken({
        id: 'candidate-unit-revoked',
        email: 'revoked@thinkwires.com',
        name: 'Revoked User',
      });
      await revokeToken(validToken);

      const { req, res, next } = createMockReqRes({
        cookies: { thinkwires_candidate_jwt: validToken },
      });

      await requireCandidateAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.jsonData.error).toMatch(/revoked/i);
      expect(next).not.toHaveBeenCalled();
    });

    it('extracts candidate from valid cookie and invokes next()', async () => {
      const validToken = generateCandidateToken({
        id: 'candidate-unit-1',
        email: 'alex@thinkwires.com',
        name: 'Alex Unit',
      });

      const { req, res, next } = createMockReqRes({
        cookies: { thinkwires_candidate_jwt: validToken },
      });

      await requireCandidateAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.candidate).toBeDefined();
      expect(req.candidate.email).toBe('alex@thinkwires.com');
      expect(req.candidate.role).toBe('candidate');
    });

    it('extracts candidate from Bearer authorization header and invokes next()', async () => {
      const validToken = generateCandidateToken({
        id: 'candidate-unit-2',
        email: 'bearer@thinkwires.com',
        name: 'Bearer User',
      });

      const { req, res, next } = createMockReqRes({
        headers: { authorization: `Bearer ${validToken}` },
      });

      await requireCandidateAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.candidate.email).toBe('bearer@thinkwires.com');
    });
  });

  describe('requireRole', () => {
    it('fails closed with 401 Unauthorized when req.user is undefined', () => {
      const middleware = requireRole(['admin']);
      const { req, res, next } = createMockReqRes({
        reqOverrides: { user: undefined },
      });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.jsonData.success).toBe(false);
      expect(res.jsonData.error).toMatch(/authentication required/i);
      expect(next).not.toHaveBeenCalled();
    });

    it('fails closed with 401 Unauthorized when req.user is null', () => {
      const middleware = requireRole(['admin']);
      const { req, res, next } = createMockReqRes({
        reqOverrides: { user: null },
      });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.jsonData.success).toBe(false);
      expect(res.jsonData.error).toMatch(/authentication required/i);
      expect(next).not.toHaveBeenCalled();
    });

    it('fails closed with 401 Unauthorized when req.user is a non-object primitive', () => {
      const middleware = requireRole(['admin']);
      const { req, res, next } = createMockReqRes({
        reqOverrides: { user: 'malformed_user_string' },
      });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.jsonData.success).toBe(false);
      expect(res.jsonData.error).toMatch(/authentication required/i);
      expect(next).not.toHaveBeenCalled();
    });

    it('fails closed with 401 Unauthorized when req.user.role is missing/undefined', () => {
      const middleware = requireRole(['admin']);
      const { req, res, next } = createMockReqRes({
        reqOverrides: { user: { id: 'user-1' } },
      });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.jsonData.success).toBe(false);
      expect(res.jsonData.error).toMatch(/user role is missing, null, or malformed/i);
      expect(next).not.toHaveBeenCalled();
    });

    it('fails closed with 401 Unauthorized when req.user.role is null', () => {
      const middleware = requireRole(['admin']);
      const { req, res, next } = createMockReqRes({
        reqOverrides: { user: { id: 'user-1', role: null } },
      });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.jsonData.success).toBe(false);
      expect(res.jsonData.error).toMatch(/user role is missing, null, or malformed/i);
      expect(next).not.toHaveBeenCalled();
    });

    it('fails closed with 401 Unauthorized when req.user.role is empty string', () => {
      const middleware = requireRole(['admin']);
      const { req, res, next } = createMockReqRes({
        reqOverrides: { user: { id: 'user-1', role: '   ' } },
      });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.jsonData.success).toBe(false);
      expect(res.jsonData.error).toMatch(/user role is missing, null, or malformed/i);
      expect(next).not.toHaveBeenCalled();
    });

    it('fails closed with 401 Unauthorized when req.user.role is not a string (e.g. number/boolean/array)', () => {
      const middleware = requireRole(['admin']);
      const { req, res, next } = createMockReqRes({
        reqOverrides: { user: { id: 'user-1', role: 12345 } },
      });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.jsonData.success).toBe(false);
      expect(res.jsonData.error).toMatch(/user role is missing, null, or malformed/i);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects unrecognized or invalid roles with 403 Forbidden', () => {
      const middleware = requireRole(['admin']);
      const { req, res, next } = createMockReqRes({
        reqOverrides: { user: { role: 'recruiter' } },
      });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData.success).toBe(false);
      expect(res.jsonData.error).toMatch(/invalid or unrecognized by security policy/i);
      expect(next).not.toHaveBeenCalled();
    });

    it('blocks candidate role trying to access admin endpoints with 403 Forbidden', () => {
      const middleware = requireRole(['admin']);
      const { req, res, next } = createMockReqRes({
        reqOverrides: { user: { role: 'candidate' } },
      });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData.success).toBe(false);
      expect(next).not.toHaveBeenCalled();
    });

    it('allows access when user role matches allowed roles', () => {
      const middleware = requireRole(['admin', 'superadmin']);
      const { req, res, next } = createMockReqRes({
        reqOverrides: { user: { role: 'admin' } },
      });

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('allows explicitly verified superadmin full bypass across all module role requirements', () => {
      const middleware = requireRole(['cms_admin']);
      const { req, res, next } = createMockReqRes({
        reqOverrides: { user: { role: 'superadmin' } },
      });

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('blocks admin role when route specifically requires cms_admin with 403', () => {
      const middleware = requireRole(['cms_admin']);
      const { req, res, next } = createMockReqRes({
        reqOverrides: { user: { role: 'admin' } },
      });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData.error).toMatch(/access denied|content management system/i);
      expect(next).not.toHaveBeenCalled();
    });

    it('blocks cms_admin role when route specifically requires admin with 403', () => {
      const middleware = requireRole(['admin']);
      const { req, res, next } = createMockReqRes({
        reqOverrides: { user: { role: 'cms_admin' } },
      });

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData.error).toMatch(/access denied|cms admins have access restricted/i);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
