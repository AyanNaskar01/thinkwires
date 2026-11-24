import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import app from '../../app.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  DEFAULT_TRUSTED_SUBNETS,
  CLOUDFLARE_IPS,
  resolveTrustProxyConfig,
  getTrustProxyFunction,
} from '../../configs/proxy.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Express Reverse Proxy Trust & Anti-Spoofing (SEC-05, Issue #193)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('1. Topology Resolution & Configuration Parsing (resolveTrustProxyConfig)', () => {
    it('defaults to RFC1918 / RFC4193 private subnets and loopback when TRUST_PROXY is unset', () => {
      delete process.env.TRUST_PROXY;
      const config = resolveTrustProxyConfig();
      expect(config).toEqual(DEFAULT_TRUSTED_SUBNETS);
      expect(config).toContain('loopback');
      expect(config).toContain('uniquelocal');
      expect(config).toContain('linklocal');
    });

    it('parses numeric hop count when TRUST_PROXY is an integer string', () => {
      expect(resolveTrustProxyConfig('1')).toBe(1);
      expect(resolveTrustProxyConfig('2')).toBe(2);
      expect(resolveTrustProxyConfig(' 3 ')).toBe(3);
    });

    it('parses boolean string correctly', () => {
      expect(resolveTrustProxyConfig('false')).toBe(false);
      expect(resolveTrustProxyConfig('true')).toBe(true);
    });

    it('expands cloudflare preset to private subnets plus Cloudflare CIDRs', () => {
      const config = resolveTrustProxyConfig('cloudflare');
      expect(Array.isArray(config)).toBe(true);
      expect(config).toContain('loopback');
      expect(config).toContain('uniquelocal');
      expect(config).toContain('173.245.48.0/20');
      expect(config).toContain('104.16.0.0/13');
      expect(config.length).toBe(DEFAULT_TRUSTED_SUBNETS.length + CLOUDFLARE_IPS.length);
    });

    it('parses comma-separated custom CIDRs and subnets', () => {
      const config = resolveTrustProxyConfig('10.0.0.0/8, 172.16.0.0/12, loopback');
      expect(config).toEqual(['10.0.0.0/8', '172.16.0.0/12', 'loopback']);
    });
  });

  describe('2. Subnet Predicate Evaluation (getTrustProxyFunction)', () => {
    it('trusts private cloud/container networks and loopback by default', () => {
      const trustFn = getTrustProxyFunction();
      expect(typeof trustFn).toBe('function');

      // Loopback
      expect(trustFn('127.0.0.1', 0)).toBe(true);
      expect(trustFn('::1', 0)).toBe(true);

      // RFC 1918 / RFC 4193 Unique Local (Docker / Render / AWS VPC)
      expect(trustFn('10.0.0.1', 0)).toBe(true);
      expect(trustFn('10.244.0.15', 0)).toBe(true);
      expect(trustFn('172.16.0.1', 0)).toBe(true);
      expect(trustFn('172.20.0.5', 0)).toBe(true);
      expect(trustFn('192.168.1.1', 0)).toBe(true);
      expect(trustFn('fd00::1', 0)).toBe(true);

      // Link-local
      expect(trustFn('169.254.169.254', 0)).toBe(true);
    });

    it('rejects untrusted public internet IPs by default, preventing direct socket spoofing', () => {
      const trustFn = getTrustProxyFunction();

      // Arbitrary public IPs attempting to connect directly
      expect(trustFn('203.0.113.195', 0)).toBe(false);
      expect(trustFn('198.51.100.42', 0)).toBe(false);
      expect(trustFn('8.8.8.8', 0)).toBe(false);
      expect(trustFn('1.1.1.1', 0)).toBe(false);
    });

    it('compiles numeric hop predicate correctly', () => {
      const trustFn = getTrustProxyFunction('2');
      expect(trustFn('203.0.113.1', 0)).toBe(true); // Hop 0 (first proxy)
      expect(trustFn('203.0.113.1', 1)).toBe(true); // Hop 1 (second proxy)
      expect(trustFn('203.0.113.1', 2)).toBe(false); // Hop 2 (client)
    });
  });

  describe('3. Active Express App Configuration', () => {
    it('verifies Express trust proxy is compiled and trusts loopback/private subnets', () => {
      const trustProxy = app.get('trust proxy');
      expect(trustProxy).toBeTruthy();
      expect(typeof trustProxy).toBe('function');

      // Must trust loopback and private container subnets
      expect(trustProxy('127.0.0.1', 0)).toBe(true);
      expect(trustProxy('10.0.0.1', 0)).toBe(true);
      expect(trustProxy('172.16.0.1', 0)).toBe(true);

      // Must reject untrusted public IP
      expect(trustProxy('203.0.113.1', 0)).toBe(false);
    });

    it('verifies all backend rate limiters suppress proxy header collision warnings', () => {
      const routesDir = path.resolve(__dirname, '../../routes');
      const routeFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith('.js'));

      for (const file of routeFiles) {
        const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
        if (content.includes('rateLimit(')) {
          expect(content).toContain('validate:');
          expect(content).toContain('xForwardedForHeader: false');
          expect(content).toContain('forwardedHeader: false');
        }
      }
    });
  });

  describe('4. End-to-End Forwarded Header Handling & Anti-Spoofing', () => {
    let testApp;

    beforeEach(() => {
      testApp = express();
      testApp.set('trust proxy', getTrustProxyFunction());
      testApp.get('/api/test-ip', (req, res) => {
        res.json({
          ip: req.ip,
          ips: req.ips,
          remoteAddress: req.socket.remoteAddress,
        });
      });
    });

    it('extracts legitimate client IP when request originates through trusted proxy', async () => {
      const res = await request(testApp)
        .get('/api/test-ip')
        .set('X-Forwarded-For', '203.0.113.50');

      expect(res.status).toBe(200);
      expect(res.body.ip).toBe('203.0.113.50');
      expect(res.body.ips).toEqual(['203.0.113.50']);
    });

    it('stops at the first untrusted IP and discards attacker-injected header entries (anti-spoofing)', async () => {
      // Attacker injects fake client IP (198.51.100.99) followed by their real IP (203.0.113.50)
      const res = await request(testApp)
        .get('/api/test-ip')
        .set('X-Forwarded-For', '198.51.100.99, 203.0.113.50');

      expect(res.status).toBe(200);
      // Express correctly stops at 203.0.113.50 because 203.0.113.50 is not a trusted proxy
      expect(res.body.ip).toBe('203.0.113.50');
    });

    it('correctly traverses multi-hop proxy architecture (Cloudflare -> Render -> Node)', async () => {
      const multiHopApp = express();
      multiHopApp.set('trust proxy', getTrustProxyFunction('cloudflare'));
      multiHopApp.get('/api/test-ip', (req, res) => {
        res.json({ ip: req.ip, ips: req.ips });
      });

      // Legitimate client -> Cloudflare Edge (173.245.48.5) -> Render internal proxy (10.0.0.1) -> Node
      const res = await request(multiHopApp)
        .get('/api/test-ip')
        .set('X-Forwarded-For', '198.51.100.77, 173.245.48.5');

      expect(res.status).toBe(200);
      expect(res.body.ip).toBe('198.51.100.77');
    });
  });
});
