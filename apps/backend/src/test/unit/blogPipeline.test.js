import { describe, it, expect, beforeEach } from 'vitest';
import articlesStore, { inMemoryArticles } from '../../utils/articlesStore.js';
import request from 'supertest';
import app from '../../app.js';

describe('Blog Pipeline - Backend Store & API', () => {
  it('should list published articles from the store', async () => {
    const list = await articlesStore.getAllArticles();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    // All items should have status published
    list.forEach((art) => {
      expect(art.status).toBe('published');
      expect(art.title).toBeTruthy();
      expect(art.slug).toBeTruthy();
    });
  });

  it('should support search and category filters', async () => {
    const all = await articlesStore.getAllArticles();
    const first = all[0];

    const searched = await articlesStore.getAllArticles({ q: first.title.slice(0, 5) });
    expect(searched.length).toBeGreaterThan(0);
    expect(searched.some((a) => a.slug === first.slug)).toBe(true);

    if (first.category) {
      const byCat = await articlesStore.getAllArticles({ category: first.category });
      expect(byCat.length).toBeGreaterThan(0);
      byCat.forEach((a) => {
        expect(
          a.category?.toLowerCase() === first.category.toLowerCase() ||
          a.badge?.toLowerCase() === first.category.toLowerCase()
        ).toBe(true);
      });
    }
  });

  it('should create a new article with required fields and normalized author', async () => {
    const testTitle = `AI in Supply Chain Delivery ${Date.now()}`;
    const newArt = await articlesStore.createArticle({
      title: testTitle,
      summary: 'A short summary for supply chain automation.',
      body: 'Full analysis and architecture diagrams for automated delivery.',
      authorName: 'Ayan Naskar',
      authorRole: 'Lead Architect',
      category: 'Tech & AI',
      tags: ['AI', 'Supply Chain'],
      status: 'published',
      featured: false,
    });

    expect(newArt).toBeDefined();
    expect(newArt.title).toBe(testTitle);
    expect(newArt.slug).toContain('ai-in-supply-chain-delivery');
    expect(newArt.author.name).toBe('Ayan Naskar');
    expect(newArt.author.role).toBe('Lead Architect');
    expect(newArt.author.initials).toBe('AN');
    expect(newArt.status).toBe('published');
    expect(newArt.publishedAt).toBeTruthy();
    expect(newArt.featured).toBe(false);

    // Verify it is retrievable by slug
    const fetched = await articlesStore.getArticleByIdOrSlug(newArt.slug);
    expect(fetched).toBeDefined();
    expect(fetched.title).toBe(testTitle);
    expect(fetched.body).toContain('Full analysis and architecture');
  });

  it('should feature an article and un-feature previous featured articles', async () => {
    const featTitle = `Featured Cloud Engineering ${Date.now()}`;
    const featArt = await articlesStore.createArticle({
      title: featTitle,
      summary: 'Cloud computing benchmarks for enterprise applications.',
      body: 'Detailed performance benchmarks across global regions.',
      authorName: 'Thinkwires Research',
      category: 'Industry Insights',
      status: 'published',
      featured: true,
    });

    expect(featArt.featured).toBe(true);

    const activeFeatured = await articlesStore.getFeaturedArticle();
    expect(activeFeatured).toBeDefined();
    expect(activeFeatured.title).toBe(featTitle);
    expect(activeFeatured.featured).toBe(true);
  });

  it('should automatically fallback to latest published article if NO article is marked featured', async () => {
    // Un-feature all articles in in-memory store
    inMemoryArticles.forEach((a) => {
      a.featured = false;
    });

    const fallback = await articlesStore.getFeaturedArticle();
    expect(fallback).toBeDefined();
    expect(fallback.title).toBeTruthy();
    expect(fallback.status).toBe('published');
  });

  it('should update an existing article', async () => {
    const created = await articlesStore.createArticle({
      title: `Update Test Article ${Date.now()}`,
      summary: 'Initial summary',
      body: 'Initial content',
      status: 'draft',
      featured: false,
    });

    const updated = await articlesStore.updateArticle(created.slug, {
      summary: 'Updated summary text',
      status: 'published',
    });

    expect(updated.summary).toBe('Updated summary text');
    expect(updated.status).toBe('published');
    expect(updated.publishedAt).toBeTruthy();
  });

  it('should toggle publish status between published and draft', async () => {
    const created = await articlesStore.createArticle({
      title: `Toggle Status Test ${Date.now()}`,
      summary: 'Toggle summary',
      body: 'Toggle content',
      status: 'published',
    });

    const toggled1 = await articlesStore.togglePublishArticle(created.slug);
    expect(toggled1.newStatus).toBe('draft');
    expect(toggled1.article.status).toBe('draft');

    const toggled2 = await articlesStore.togglePublishArticle(created.slug);
    expect(toggled2.newStatus).toBe('published');
    expect(toggled2.article.status).toBe('published');
  });

  it('should delete an article', async () => {
    const created = await articlesStore.createArticle({
      title: `Delete Test ${Date.now()}`,
      summary: 'Delete summary',
      body: 'Delete content',
      status: 'draft',
    });

    const deleted = await articlesStore.deleteArticle(created.slug);
    expect(deleted.title).toBe(created.title);

    const lookup = await articlesStore.getArticleByIdOrSlug(created.slug);
    expect(lookup).toBeNull();
  });

  it('verifies public HTTP endpoints /api/articles and /api/articles/featured', async () => {
    const resArticles = await request(app).get('/api/articles');
    expect(resArticles.status).toBe(200);
    expect(Array.isArray(resArticles.body)).toBe(true);
    expect(resArticles.body.length).toBeGreaterThan(0);

    const resFeatured = await request(app).get('/api/articles/featured');
    expect(resFeatured.status).toBe(200);
    expect(resFeatured.body).toBeDefined();
    expect(resFeatured.body.title).toBeTruthy();

    const firstSlug = resArticles.body[0].slug;
    const resSingle = await request(app).get(`/api/articles/${firstSlug}`);
    expect(resSingle.status).toBe(200);
    expect(resSingle.body.slug).toBe(firstSlug);
  });
});
