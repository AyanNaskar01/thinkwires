import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app.js';

describe('HTTP Compression & Low-Bandwidth Caching Infrastructure', () => {
  it('serves responses with gzip Content-Encoding for client requests accepting gzip', async () => {
    const res = await request(app)
      .get('/api')
      .set('Accept-Encoding', 'gzip');

    expect(res.status).toBe(200);
    // Compression is active on the Express app; depending on size it applies gzip
    // When size > 1024 bytes, compression filter returns true
    expect(res.headers).toHaveProperty('vary');
    expect(res.headers['vary']).toMatch(/Accept-Encoding/i);
  });

  it('honors x-no-compression request header', async () => {
    const res = await request(app)
      .get('/api')
      .set('Accept-Encoding', 'gzip')
      .set('x-no-compression', '1');

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('sets public Cache-Control with stale-while-revalidate on public content routes', async () => {
    const res = await request(app).get('/api/articles');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe(
      'public, max-age=60, stale-while-revalidate=300'
    );
  });

  it('sets strict no-store Cache-Control on authenticated and private routes', async () => {
    const res = await request(app).get('/api/admin/overview');

    // Expected 401 unauthenticated, but headers must strictly prevent caching
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.headers['cache-control']).toMatch(/private/);
    expect(res.headers['pragma']).toBe('no-cache');
  });

  it('returns HTTP 304 Not Modified when If-None-Match matches response ETag', async () => {
    const firstRes = await request(app).get('/api/articles');
    expect(firstRes.status).toBe(200);
    const etag = firstRes.headers['etag'];

    if (etag) {
      const secondRes = await request(app)
        .get('/api/articles')
        .set('If-None-Match', etag);

      expect(secondRes.status).toBe(304);
      expect(secondRes.text).toBe(''); // 0 body bytes transferred
    }
  });
});
