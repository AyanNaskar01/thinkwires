import express from 'express';
import Page from '../models/page.mongo.model.js';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import {
  getAllArticles,
  getFeaturedArticle,
  getArticleByIdOrSlug,
} from '../utils/articlesStore.js';
import { loadSeedJson } from '../utils/seedLoader.js';

const isMongoActive = () => mongoose.connection.readyState === 1;

const mockData = loadSeedJson('mockData.json', {}) || {};
const researchers = mockData.researchersData ? [...mockData.researchersData] : [];

const publicSubmissionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false,
  },
  message: {
    success: false,
    error: 'Too many requests from this network. Please wait a few minutes before submitting again.',
  },
});

const getHomeSection = async (sectionKey, fallbackValue) => {
  if (isMongoActive()) {
    try {
      const homePage = await Page.findOne({ slug: 'home' }).lean();
      if (homePage?.data && homePage.data[sectionKey] !== undefined) {
        return homePage.data[sectionKey];
      }
    } catch (err) {
      console.warn(
        `Error reading home section '${sectionKey}' from MongoDB:`,
        err.message
      );
    }
  }
  return fallbackValue;
};

const router = express.Router();

// --- Public Blog & Articles ---

// GET /api/articles - List published articles with search and category filtering
router.get('/articles', async (req, res) => {
  try {
    const { q, category } = req.query;
    const articles = await getAllArticles({ q, category, status: 'published' });
    res.json(articles);
  } catch (err) {
    console.error('[Articles Route] Error fetching articles:', err);
    res.status(500).json({ error: 'Failed to load articles' });
  }
});

// GET /api/articles/featured - Get featured article (or latest published fallback)
router.get('/articles/featured', async (req, res) => {
  try {
    const featured = await getFeaturedArticle();
    if (!featured) {
      return res.status(404).json({ error: 'No articles available' });
    }
    res.json(featured);
  } catch (err) {
    console.error('[Articles Route] Error fetching featured article:', err);
    res.status(500).json({ error: 'Failed to load featured article' });
  }
});

// GET /api/articles/researchers - Researchers advisory list
router.get('/articles/researchers', async (req, res) => {
  try {
    const result = await getHomeSection('researchers', researchers);
    res.json(result);
  } catch (err) {
    res.json(researchers);
  }
});

// GET /api/articles/:id - Get single article by slug or ID
router.get('/articles/:id', async (req, res) => {
  try {
    const target = await getArticleByIdOrSlug(req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json(target);
  } catch (err) {
    console.error('[Articles Route] Error fetching article by ID:', err);
    res.status(500).json({ error: 'Failed to load article' });
  }
});

// POST /api/articles/newsletter - Newsletter subscription
router.post('/articles/newsletter', publicSubmissionRateLimiter, (req, res) => {
  const { email, role } = req.body;
  if (email && email.includes('@')) {
    console.log('New Newsletter Subscription:', { email, role });
    res.json({
      success: true,
      message: 'Subscribed to Thinkwires newsletter successfully!',
    });
  } else {
    res.status(400).json({ error: 'Valid email is required' });
  }
});

export default router;
