import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  candidateCsrfProtection,
  CSRF_COOKIE_NAME,
  generateCsrfToken,
} from '../../middlewares/csrf.middleware.js';
import { generateCandidateToken, setAuthCookie } from '../../utils/auth.util.js';

describe('Candidate Portal Anti-CSRF & Cookie Protection (SEC-CSRF-02)', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.JWT_SECRET = 'test_jwt_secret_must_be_at_least_32_characters_long';
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  const createMockReqRes = (method = 'POST', headers = {}, cookies = {}, body = {}) => {
    const req = {
      method,
      path: '/apply',
      originalUrl: '/api/candidate/apply',
      headers: { ...headers },
      cookies: { ...cookies },
      body: { ...body },
    };

    let statusCode = 200;
    let jsonBody = null;
    const cookiesSet = {};

    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        jsonBody = data;
        return res;
      },
      cookie: (name, val, opts) => {
        cookiesSet[name] = { val, opts };
      },
      getStatusCode: () => statusCode,
      getJson: () => jsonBody,
      getCookiesSet: () => cookiesSet,
    };

    return { req, res };
  };

  it('allows safe methods (GET, HEAD, OPTIONS) through and auto-sets CSRF cookie if absent', () => {
    const { req, res } = createMockReqRes('GET');
    let called = false;
    const next = () => { called = true; };

    candidateCsrfProtection(req, res, next);

    expect(called).toBe(true);
    expect(res.getCookiesSet()[CSRF_COOKIE_NAME]).toBeDefined();
    expect(res.getCookiesSet()[CSRF_COOKIE_NAME].opts.httpOnly).toBe(false);
  });

  it('exempts public authentication entrypoints (login, register, logout, csrf-token)', () => {
    const { req, res } = createMockReqRes('POST');
    req.path = '/auth/login';
    let called = false;
    const next = () => { called = true; };

    candidateCsrfProtection(req, res, next);
    expect(called).toBe(true);
  });

  it('rejects mutating requests originating from untrusted third-party origins with 403', () => {
    const { req, res } = createMockReqRes('POST', {
      origin: 'https://evil-hacker.com',
    });
    let called = false;
    const next = () => { called = true; };

    candidateCsrfProtection(req, res, next);

    expect(called).toBe(false);
    expect(res.getStatusCode()).toBe(403);
    expect(res.getJson().error).toContain('Cross-site request blocked');
  });

  it('rejects cookie-authenticated candidate mutating request if X-CSRF-Token is missing with 403', () => {
    const token = generateCandidateToken({ _id: 'cand123', email: 'cand@test.com', name: 'Test' });
    const csrfToken = generateCsrfToken();

    const { req, res } = createMockReqRes('POST', {}, {
      thinkwires_candidate_jwt: token,
      [CSRF_COOKIE_NAME]: csrfToken,
    });

    let called = false;
    const next = () => { called = true; };

    candidateCsrfProtection(req, res, next);

    expect(called).toBe(false);
    expect(res.getStatusCode()).toBe(403);
    expect(res.getJson().error).toContain('CSRF validation failed');
  });

  it('rejects cookie-authenticated candidate mutating request if X-CSRF-Token does not match cookie', () => {
    const token = generateCandidateToken({ _id: 'cand123', email: 'cand@test.com', name: 'Test' });
    const csrfToken = generateCsrfToken();
    const wrongToken = generateCsrfToken();

    const { req, res } = createMockReqRes('POST', {
      'x-csrf-token': wrongToken,
    }, {
      thinkwires_candidate_jwt: token,
      [CSRF_COOKIE_NAME]: csrfToken,
    });

    let called = false;
    const next = () => { called = true; };

    candidateCsrfProtection(req, res, next);

    expect(called).toBe(false);
    expect(res.getStatusCode()).toBe(403);
    expect(res.getJson().error).toContain('CSRF validation failed');
  });

  it('accepts cookie-authenticated candidate mutating request when X-CSRF-Token matches cookie', () => {
    const token = generateCandidateToken({ _id: 'cand123', email: 'cand@test.com', name: 'Test' });
    const csrfToken = generateCsrfToken();

    const { req, res } = createMockReqRes('POST', {
      'x-csrf-token': csrfToken,
    }, {
      thinkwires_candidate_jwt: token,
      [CSRF_COOKIE_NAME]: csrfToken,
    });

    let called = false;
    const next = () => { called = true; };

    candidateCsrfProtection(req, res, next);

    expect(called).toBe(true);
    expect(res.getStatusCode()).toBe(200);
  });

  it('bypasses CSRF token requirement when verified Bearer token authorization header is provided', () => {
    const token = generateCandidateToken({ _id: 'cand123', email: 'cand@test.com', name: 'Test' });

    const { req, res } = createMockReqRes('POST', {
      authorization: `Bearer ${token}`,
    });

    let called = false;
    const next = () => { called = true; };

    candidateCsrfProtection(req, res, next);

    expect(called).toBe(true);
  });

  it('setAuthCookie defaults sameSite to lax in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.COOKIE_SAME_SITE;

    let cookieOptions = null;
    const mockRes = {
      cookie: (name, val, opts) => {
        cookieOptions = opts;
      },
    };

    setAuthCookie(mockRes, 'dummy-token');

    expect(cookieOptions.sameSite).toBe('lax');
    expect(cookieOptions.httpOnly).toBe(true);
    expect(cookieOptions.secure).toBe(true);
  });
});
