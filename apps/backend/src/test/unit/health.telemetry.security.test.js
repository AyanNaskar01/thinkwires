import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAuthorizedDiagnosticRequest } from '../../middlewares/auth.middleware.js';
import { generateAdminToken } from '../../utils/auth.util.js';
import express from 'express';

describe('Security Hardening: Issue 4 - Public Infrastructure Telemetry Exposure Defense', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('isAuthorizedDiagnosticRequest authorization helper', () => {
    it('authorizes all requests in non-production environments (development / test)', () => {
      process.env.NODE_ENV = 'test';
      const mockReq = { cookies: {}, headers: {} };
      expect(isAuthorizedDiagnosticRequest(mockReq)).toBe(true);

      process.env.NODE_ENV = 'development';
      expect(isAuthorizedDiagnosticRequest(mockReq)).toBe(true);
    });

    it('denies unauthenticated requests in production', () => {
      process.env.NODE_ENV = 'production';
      const mockReq = { cookies: {}, headers: {} };
      expect(isAuthorizedDiagnosticRequest(mockReq)).toBe(false);
    });

    it('denies requests with invalid or forged admin tokens in production', () => {
      process.env.NODE_ENV = 'production';
      const mockReq = {
        cookies: { thinkwires_admin_jwt: 'invalid.forged.jwt' },
        headers: {},
      };
      expect(isAuthorizedDiagnosticRequest(mockReq)).toBe(false);
    });

    it('authorizes requests with valid Admin JWT in cookies in production', () => {
      process.env.NODE_ENV = 'production';
      const validAdminToken = generateAdminToken({
        id: 'admin-telemetry-1',
        email: 'ops@thinkwires.com',
        role: 'admin',
      });

      const mockReq = {
        cookies: { thinkwires_admin_jwt: validAdminToken },
        headers: {},
      };
      expect(isAuthorizedDiagnosticRequest(mockReq)).toBe(true);
    });

    it('authorizes requests with valid Superadmin Bearer token in production', () => {
      process.env.NODE_ENV = 'production';
      const validSuperadminToken = generateAdminToken({
        id: 'super-telemetry-1',
        email: 'superops@thinkwires.com',
        role: 'superadmin',
      });

      const mockReq = {
        cookies: {},
        headers: {
          authorization: `Bearer ${validSuperadminToken}`,
        },
      };
      expect(isAuthorizedDiagnosticRequest(mockReq)).toBe(true);
    });

    it('authorizes internal monitoring requests with valid x-monitoring-key in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.INTERNAL_MONITORING_KEY = 'secret-internal-k8s-prometheus-key';

      const mockReq = {
        cookies: {},
        headers: {
          'x-monitoring-key': 'secret-internal-k8s-prometheus-key',
        },
      };
      expect(isAuthorizedDiagnosticRequest(mockReq)).toBe(true);
    });

    it('denies internal monitoring requests with mismatched x-monitoring-key in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.INTERNAL_MONITORING_KEY = 'secret-internal-k8s-prometheus-key';

      const mockReq = {
        cookies: {},
        headers: {
          'x-monitoring-key': 'wrong-key-attacker',
        },
      };
      expect(isAuthorizedDiagnosticRequest(mockReq)).toBe(false);
    });
  });

  describe('GET /api/health public minimal payload vs authenticated diagnostics', () => {
    it('omits infrastructure details on /api/health in production for unauthenticated callers', async () => {
      const { default: app } = await import('../../app.js');
      process.env.NODE_ENV = 'production';

      let responseBody = null;
      let responseStatus = null;

      const req = {
        method: 'GET',
        url: '/api/health',
        headers: {},
        cookies: {},
      };
      const res = {
        setHeader: () => {},
        getHeader: () => {},
        removeHeader: () => {},
        status: (code) => {
          responseStatus = code;
          return {
            json: (data) => {
              responseBody = data;
              return data;
            },
          };
        },
      };

      app.handle(req, res);

      expect(responseStatus).toBeDefined();
      expect(responseBody).toBeDefined();
      expect(responseBody.status).toMatch(/healthy|unhealthy/);
      expect(responseBody.service).toBe('Thinkwires Enterprise Core Backend');
      expect(responseBody.version).toBe('1.0.0');
      expect(responseBody.timestamp).toBeDefined();

      // Zero infrastructure telemetry leaked to public attacker
      expect(responseBody.databases).toBeUndefined();
      expect(responseBody.architecture).toBeUndefined();
      expect(responseBody.memoryUsage).toBeUndefined();
      expect(responseBody.uptime).toBeUndefined();
      expect(responseBody.environment).toBeUndefined();
    });

    it('includes complete infrastructure telemetry on /api/health when operator is authenticated in production', async () => {
      const { default: app } = await import('../../app.js');
      process.env.NODE_ENV = 'production';

      const validAdminToken = generateAdminToken({
        id: 'admin-telemetry-1',
        email: 'ops@thinkwires.com',
        role: 'admin',
      });

      let responseBody = null;
      let responseStatus = null;

      const req = {
        method: 'GET',
        url: '/api/health',
        headers: {},
        cookies: { thinkwires_admin_jwt: validAdminToken },
      };
      const res = {
        setHeader: () => {},
        getHeader: () => {},
        removeHeader: () => {},
        status: (code) => {
          responseStatus = code;
          return {
            json: (data) => {
              responseBody = data;
              return data;
            },
          };
        },
      };

      app.handle(req, res);

      expect(responseBody.status).toMatch(/healthy|unhealthy/);
      expect(responseBody.databases).toBeDefined();
      expect(responseBody.architecture).toBeDefined();
      expect(responseBody.memoryUsage).toBeDefined();
      expect(responseBody.uptime).toBeDefined();
      expect(responseBody.environment).toBe('production');
    });

    it('omits checks breakdown on /ready in production for unauthenticated callers', async () => {
      const { default: app } = await import('../../app.js');
      process.env.NODE_ENV = 'production';

      let responseBody = null;
      let responseStatus = null;

      const req = {
        method: 'GET',
        url: '/ready',
        headers: {},
        cookies: {},
      };

      await new Promise((resolve) => {
        const res = {
          setHeader: () => {},
          getHeader: () => {},
          removeHeader: () => {},
          status: (code) => {
            responseStatus = code;
            return {
              json: (data) => {
                responseBody = data;
                resolve();
                return data;
              },
            };
          },
        };

        app.handle(req, res);
      });

      expect(responseStatus).toBeDefined();
      expect(responseBody).toBeDefined();
      expect(responseBody.status).toMatch(/ready|unready/);
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.checks).toBeUndefined();
    });

    it('omits process pid on /healthz in production for unauthenticated callers', async () => {
      const { default: app } = await import('../../app.js');
      process.env.NODE_ENV = 'production';

      let responseBody = null;
      let responseStatus = null;

      const req = {
        method: 'GET',
        url: '/healthz',
        headers: {},
        cookies: {},
      };
      const res = {
        setHeader: () => {},
        getHeader: () => {},
        removeHeader: () => {},
        status: (code) => {
          responseStatus = code;
          return {
            json: (data) => {
              responseBody = data;
              return data;
            },
          };
        },
      };

      app.handle(req, res);

      expect(responseStatus).toBe(200);
      expect(responseBody).toBeDefined();
      expect(responseBody.status).toBe('alive');
      expect(responseBody.timestamp).toBeDefined();
      expect(responseBody.uptimeSeconds).toBeDefined();
      expect(responseBody.pid).toBeUndefined();
    });
  });
});
