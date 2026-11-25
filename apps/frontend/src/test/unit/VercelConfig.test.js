import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Vercel SPA Routing Configuration (Issue #195)', () => {
  const rootVercelPath = path.resolve(__dirname, '../../../../../vercel.json');
  const frontendVercelPath = path.resolve(__dirname, '../../../vercel.json');

  it('verifies root vercel.json does not contain cleanUrls: true', () => {
    const raw = fs.readFileSync(rootVercelPath, 'utf8');
    const config = JSON.parse(raw);

    expect(config.cleanUrls).toBeUndefined();
  });

  it('verifies root vercel.json routes all SPA paths to /index.html', () => {
    const raw = fs.readFileSync(rootVercelPath, 'utf8');
    const config = JSON.parse(raw);

    expect(Array.isArray(config.rewrites)).toBe(true);
    const spaRewrite = config.rewrites.find(
      (r) => r.source === '/(.*)' && r.destination === '/index.html'
    );
    expect(spaRewrite).toBeDefined();
  });

  it('verifies apps/frontend/vercel.json does not contain cleanUrls: true', () => {
    const raw = fs.readFileSync(frontendVercelPath, 'utf8');
    const config = JSON.parse(raw);

    expect(config.cleanUrls).toBeUndefined();
  });

  it('verifies apps/frontend/vercel.json routes all SPA paths to /index.html', () => {
    const raw = fs.readFileSync(frontendVercelPath, 'utf8');
    const config = JSON.parse(raw);

    expect(Array.isArray(config.rewrites)).toBe(true);
    const spaRewrite = config.rewrites.find(
      (r) => r.source === '/(.*)' && r.destination === '/index.html'
    );
    expect(spaRewrite).toBeDefined();
  });

  describe('SEC-06: Production Security Headers & Hosting Configuration', () => {
    it('verifies vercel.json configures modern security headers (disabling obsolete X-XSS-Protection)', () => {
      const raw = fs.readFileSync(frontendVercelPath, 'utf8');
      const config = JSON.parse(raw);

      expect(Array.isArray(config.headers)).toBe(true);
      const rootHeadersConfig = config.headers.find((h) => h.source === '/(.*)');
      expect(rootHeadersConfig).toBeDefined();

      const headersMap = {};
      rootHeadersConfig.headers.forEach((h) => {
        headersMap[h.key] = h.value;
      });

      // Obsolete X-XSS-Protection replaced with '0'
      expect(headersMap['X-XSS-Protection']).toBe('0');
      expect(headersMap['X-Content-Type-Options']).toBe('nosniff');
      expect(headersMap['X-Frame-Options']).toBe('SAMEORIGIN');
      expect(headersMap['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(headersMap['Strict-Transport-Security']).toContain('max-age=31536000');
      expect(headersMap['Permissions-Policy']).toBeDefined();
      expect(headersMap['Content-Security-Policy']).toContain("default-src 'self'");
      expect(headersMap['Content-Security-Policy']).toContain("object-src 'none'");
    });

    it('verifies Cloudflare Pages _headers file exists and defines comprehensive security headers', () => {
      const cfHeadersPath = path.resolve(__dirname, '../../../public/_headers');
      expect(fs.existsSync(cfHeadersPath)).toBe(true);

      const content = fs.readFileSync(cfHeadersPath, 'utf8');
      expect(content).toContain('X-XSS-Protection: 0');
      expect(content).toContain('X-Content-Type-Options: nosniff');
      expect(content).toContain('X-Frame-Options: SAMEORIGIN');
      expect(content).toContain('Strict-Transport-Security: max-age=31536000');
      expect(content).toContain('Permissions-Policy: camera=(), microphone=()');
      expect(content).toContain("Content-Security-Policy: default-src 'self'");
      expect(content).toContain("object-src 'none'");
    });

    it('verifies Cloudflare Pages wrangler.toml configuration is valid', () => {
      const wranglerPath = path.resolve(__dirname, '../../../wrangler.toml');
      expect(fs.existsSync(wranglerPath)).toBe(true);

      const content = fs.readFileSync(wranglerPath, 'utf8');
      expect(content).toMatch(/name = "thinkwires(-frontend)?"/);
      expect(content).toContain('pages_build_output_dir = "dist"');
    });
  });
});

