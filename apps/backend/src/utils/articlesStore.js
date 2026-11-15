import mongoose from 'mongoose';
import Article from '../models/article.mongo.model.js';
import { loadSeedJson } from './seedLoader.js';

const isMongoActive = () => mongoose.connection.readyState === 1;

// Load seed data from both admin and mock seed files
const adminSeed = loadSeedJson('adminSeedData.json', {}) || {};
const mockSeed = loadSeedJson('mockData.json', {}) || {};

const initialAdminArticles = Array.isArray(adminSeed.articles)
  ? adminSeed.articles
  : [];
const initialMockArticles = Array.isArray(mockSeed.articlesData)
  ? mockSeed.articlesData
  : [];
const initialFeaturedMock = mockSeed.featuredArticleData || null;

// Build a unified initial in-memory articles list
const seedMap = new Map();

// Helper to normalize article record
const normalizeArticle = (art, isFeatured = false) => {
  const cleanId = art.id || art.articleId || `art_${Date.now()}`;
  const cleanSlug =
    art.slug ||
    (art.title
      ? art.title
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9-_]/g, '-')
          .replace(/-+/g, '-')
      : `article-${Date.now()}`);

  const authorObj =
    typeof art.author === 'object' && art.author !== null
      ? art.author
      : { name: typeof art.author === 'string' ? art.author : 'Thinkwires Team' };

  const authorName = authorObj.name || 'Thinkwires Team';
  const authorRole = authorObj.role || 'Contributor';
  const authorAvatar = authorObj.avatar || authorObj.imageUrl || '';
  const authorInitials =
    authorObj.initials ||
    authorName
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  const bodyText = art.body || art.content || art.excerpt || art.summary || '';
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  const readTimeCalc = `${Math.max(2, Math.ceil(wordCount / 150))} min read`;

  const coverImage =
    art.featuredImageUrl ||
    art.imageUrl ||
    art.image ||
    '/images/about-philosophy.jpg';

  return {
    id: cleanId,
    articleId: cleanId,
    title: art.title || 'Untitled Article',
    slug: cleanSlug,
    summary: art.summary || art.excerpt || '',
    excerpt: art.excerpt || art.summary || '',
    body: art.body || art.content || art.summary || '',
    featured: Boolean(art.featured || isFeatured),
    category: art.category || 'Industry Insights',
    badge: art.badge || art.category || 'Industry Insights',
    badgeBg: art.badgeBg || '#dbeafe',
    badgeColor: art.badgeColor || '#1e40af',
    subCategory: art.subCategory || art.category || 'Insights',
    author: {
      name: authorName,
      role: authorRole,
      avatar: authorAvatar,
      initials: authorInitials,
    },
    featuredImageUrl: coverImage,
    imageUrl: coverImage,
    tags: Array.isArray(art.tags)
      ? art.tags
      : typeof art.tags === 'string'
        ? art.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : ['Tech', 'Insights'],
    readTime: art.readTime || readTimeCalc,
    viewsCount: Number(art.viewsCount) || 0,
    status: art.status || 'published',
    publishedAt:
      art.publishedAt ||
      (art.status === 'published' ? new Date().toISOString() : null),
    createdAt: art.createdAt || new Date().toISOString(),
    updatedAt: art.updatedAt || new Date().toISOString(),
  };
};

// Insert featured article if available
if (initialFeaturedMock) {
  const norm = normalizeArticle(initialFeaturedMock, true);
  seedMap.set(norm.slug, norm);
}

// Insert admin seed articles
for (const art of initialAdminArticles) {
  const norm = normalizeArticle(art, Boolean(art.featured));
  seedMap.set(norm.slug, norm);
}

// Insert mock articles if not already present
for (const art of initialMockArticles) {
  const norm = normalizeArticle(art, Boolean(art.featured));
  if (!seedMap.has(norm.slug)) {
    seedMap.set(norm.slug, norm);
  }
}

// Master in-memory articles collection
export let inMemoryArticles = Array.from(seedMap.values());

/**
 * Get all published articles with search and category filters.
 * In MongoDB mode: queries MongoDB.
 * Fallback / In-Memory mode: uses inMemoryArticles.
 */
export const getAllArticles = async ({ q, category, status = 'published' } = {}) => {
  let source = [];

  if (isMongoActive()) {
    try {
      const query = status === 'All' ? {} : { status };
      const dbArticles = await Article.find(query)
        .select('-body -content')
        .sort({ publishedAt: -1, createdAt: -1 })
        .lean();

      if (dbArticles && dbArticles.length > 0) {
        source = dbArticles.map((a) => ({
          ...a,
          id: a.articleId || a.slug || a._id,
        }));
      }
    } catch (err) {
      console.warn('[ArticlesStore] MongoDB read warning:', err.message);
    }
  }

  // Fallback to in-memory if MongoDB returned no articles or is offline
  if (source.length === 0) {
    source = status === 'All'
      ? [...inMemoryArticles]
      : inMemoryArticles.filter((a) => a.status === status);
  }

  let filtered = [...source];

  if (q && q.trim() !== '') {
    const query = q.trim().toLowerCase();
    filtered = filtered.filter(
      (art) =>
        (art.title && art.title.toLowerCase().includes(query)) ||
        (art.summary && art.summary.toLowerCase().includes(query)) ||
        (art.excerpt && art.excerpt.toLowerCase().includes(query)) ||
        (art.author?.name && art.author.name.toLowerCase().includes(query)) ||
        (art.category && art.category.toLowerCase().includes(query)) ||
        (art.tags && art.tags.some((t) => t.toLowerCase().includes(query)))
    );
  }

  if (
    category &&
    category !== 'all' &&
    category !== 'All' &&
    !category.startsWith('All Insights')
  ) {
    const catLower = category.toLowerCase();
    filtered = filtered.filter(
      (art) =>
        (art.category && art.category.toLowerCase() === catLower) ||
        (art.badge && art.badge.toLowerCase() === catLower) ||
        (art.subCategory && art.subCategory.toLowerCase() === catLower)
    );
  }

  return filtered;
};

/**
 * Get the Featured Blog article.
 * Logic:
 * 1. Return article marked with featured: true and status: 'published'.
 * 2. If NO article is marked featured, fallback to the LATEST published article.
 */
export const getFeaturedArticle = async () => {
  if (isMongoActive()) {
    try {
      // 1. Check for explicitly featured article
      let feat = await Article.findOne({
        featured: true,
        status: 'published',
      })
        .sort({ publishedAt: -1, createdAt: -1 })
        .lean();

      // 2. Fallback: return the latest published article if none is marked featured
      if (!feat) {
        feat = await Article.findOne({ status: 'published' })
          .sort({ publishedAt: -1, createdAt: -1 })
          .lean();
      }

      if (feat) {
        return {
          ...feat,
          id: feat.articleId || feat.slug || feat._id,
          imageUrl: feat.featuredImageUrl || feat.imageUrl || '/images/about-philosophy.jpg',
        };
      }
    } catch (err) {
      console.warn('[ArticlesStore] Featured MongoDB read warning:', err.message);
    }
  }

  // In-memory fallback
  const published = inMemoryArticles.filter((a) => a.status === 'published');
  const feat = published.find((a) => a.featured === true);
  if (feat) {
    return feat;
  }

  // If no article is marked featured, return latest published
  if (published.length > 0) {
    return published[0];
  }

  return inMemoryArticles[0] || null;
};

/**
 * Get an article by slug, articleId, or MongoDB _id.
 * Includes full body and content.
 */
export const getArticleByIdOrSlug = async (idOrSlug) => {
  if (!idOrSlug) return null;

  if (isMongoActive()) {
    try {
      const isObjectId = mongoose.isValidObjectId(idOrSlug);
      const query = isObjectId
        ? { $or: [{ _id: idOrSlug }, { slug: idOrSlug }, { articleId: idOrSlug }] }
        : { $or: [{ slug: idOrSlug }, { articleId: idOrSlug }] };

      const dbArt = await Article.findOne(query).lean();
      if (dbArt) {
        return {
          ...dbArt,
          id: dbArt.articleId || dbArt.slug || dbArt._id,
          imageUrl: dbArt.featuredImageUrl || dbArt.imageUrl || '/images/about-philosophy.jpg',
        };
      }
    } catch (err) {
      console.warn('[ArticlesStore] Article by ID/slug MongoDB read warning:', err.message);
    }
  }

  // In-memory fallback
  const found = inMemoryArticles.find(
    (a) =>
      a.id === idOrSlug ||
      a.articleId === idOrSlug ||
      a.slug === idOrSlug ||
      String(a._id) === idOrSlug
  );

  return found || null;
};

/**
 * List all articles for the Admin CMS (includes drafts and full fields).
 */
export const getCmsArticles = async ({ search, category, status } = {}) => {
  let items = [];

  if (isMongoActive()) {
    try {
      const query = {};
      if (category && category !== 'All') query.category = category;
      if (status && status !== 'All') query.status = status;
      if (search && search.trim() !== '') {
        const regex = new RegExp(search.trim(), 'i');
        query.$or = [{ title: regex }, { summary: regex }, { tags: regex }];
      }

      const dbItems = await Article.find(query)
        .sort({ createdAt: -1 })
        .lean();

      if (dbItems && dbItems.length > 0) {
        items = dbItems.map((a) => ({
          ...a,
          id: a.articleId || a.slug || a._id,
        }));
      }
    } catch (err) {
      console.warn('[ArticlesStore] CMS articles MongoDB read warning:', err.message);
    }
  }

  if (items.length === 0) {
    items = inMemoryArticles.filter((art) => {
      let match = true;
      if (search) {
        const s = search.toLowerCase();
        match =
          art.title.toLowerCase().includes(s) ||
          art.summary.toLowerCase().includes(s) ||
          (art.tags && art.tags.some((t) => t.toLowerCase().includes(s)));
      }
      if (match && category && category !== 'All') {
        match = art.category === category;
      }
      if (match && status && status !== 'All') {
        match = art.status === status;
      }
      return match;
    });
  }

  return items;
};

/**
 * Create a new article.
 * Saves to both in-memory store and MongoDB if active.
 */
export const createArticle = async (data, user = null) => {
  const {
    title,
    slug,
    summary,
    body,
    author,
    authorName,
    authorRole,
    authorAvatar,
    category,
    featuredImageUrl,
    tags,
    status,
    featured,
    readTime,
  } = data;

  if (!title || !summary || !body) {
    throw new Error('Article title, short summary, and full content are required.');
  }

  const cleanSlug = (slug || title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-');

  // Check for duplicate slug
  const duplicate = inMemoryArticles.some((a) => a.slug === cleanSlug);
  if (duplicate) {
    throw new Error(`An article with the web address '${cleanSlug}' already exists.`);
  }

  const tagsArray = Array.isArray(tags)
    ? tags
    : typeof tags === 'string'
      ? tags.split(',').map((t) => t.trim()).filter(Boolean)
      : ['Tech', 'Insights'];

  const authorObj = typeof author === 'object' && author !== null ? author : {};
  const resolvedName =
    authorObj.name ||
    authorName ||
    (typeof author === 'string' ? author : '') ||
    user?.name ||
    'Thinkwires Team';
  const resolvedRole =
    authorObj.role || authorRole || 'Technology Specialist';
  const resolvedAvatar =
    authorObj.avatar || authorObj.imageUrl || authorAvatar || '';
  const resolvedInitials =
    authorObj.initials ||
    resolvedName
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  const isFeatured = Boolean(featured);
  const isPublished = status === 'published';

  // If this article is marked featured, un-feature older featured articles
  if (isFeatured) {
    inMemoryArticles.forEach((a) => {
      a.featured = false;
    });
    if (isMongoActive()) {
      try {
        await Article.updateMany({ featured: true }, { $set: { featured: false } });
      } catch (err) {
        console.warn('[ArticlesStore] Un-feature MongoDB warning:', err.message);
      }
    }
  }

  const wordCount = body.split(/\s+/).filter(Boolean).length;
  const calculatedReadTime =
    readTime || `${Math.max(2, Math.ceil(wordCount / 150))} min read`;

  const coverImage = featuredImageUrl || '/images/about-philosophy.jpg';

  const newArticle = {
    id: `art_${Date.now()}`,
    articleId: `art_${Date.now()}`,
    title: title.trim(),
    slug: cleanSlug,
    summary: summary.trim(),
    excerpt: summary.trim(),
    body: body.trim(),
    author: {
      name: resolvedName,
      role: resolvedRole,
      avatar: resolvedAvatar,
      initials: resolvedInitials,
    },
    category: category || 'Industry Insights',
    badge: category || 'Industry Insights',
    badgeBg: '#dbeafe',
    badgeColor: '#1e40af',
    subCategory: tagsArray[0] || category || 'Insights',
    featuredImageUrl: coverImage,
    imageUrl: coverImage,
    tags: tagsArray,
    readTime: calculatedReadTime,
    viewsCount: 0,
    featured: isFeatured,
    status: status || 'published',
    publishedAt: isPublished ? new Date().toISOString() : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Add to the front of in-memory list
  inMemoryArticles.unshift(newArticle);

  if (isMongoActive()) {
    try {
      await Article.create(newArticle);
    } catch (err) {
      console.warn('[ArticlesStore] MongoDB create warning:', err.message);
    }
  }

  return newArticle;
};

/**
 * Update an existing article.
 */
export const updateArticle = async (idOrSlug, updates) => {
  const idx = inMemoryArticles.findIndex(
    (a) =>
      a.id === idOrSlug ||
      a.articleId === idOrSlug ||
      a.slug === idOrSlug ||
      String(a._id) === idOrSlug
  );

  if (idx === -1) {
    throw new Error('Article not found.');
  }

  if (updates.tags && typeof updates.tags === 'string') {
    updates.tags = updates.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  // Handle author updates
  if (
    updates.author !== undefined ||
    updates.authorName !== undefined ||
    updates.authorRole !== undefined ||
    updates.authorAvatar !== undefined
  ) {
    const currentAuthor = inMemoryArticles[idx].author || {};
    const authorObj =
      typeof updates.author === 'object' && updates.author !== null
        ? updates.author
        : {};
    const resolvedName =
      authorObj.name ||
      updates.authorName ||
      currentAuthor.name ||
      'Thinkwires Team';
    const resolvedRole =
      authorObj.role ||
      updates.authorRole ||
      currentAuthor.role ||
      'Technology Specialist';
    const resolvedAvatar =
      authorObj.avatar !== undefined
        ? authorObj.avatar
        : updates.authorAvatar !== undefined
          ? updates.authorAvatar
          : currentAuthor.avatar || '';
    const resolvedInitials =
      authorObj.initials ||
      resolvedName
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

    updates.author = {
      name: resolvedName,
      role: resolvedRole,
      avatar: resolvedAvatar,
      initials: resolvedInitials,
    };
  }

  // Handle featured exclusivity
  if (updates.featured === true) {
    inMemoryArticles.forEach((a, i) => {
      if (i !== idx) a.featured = false;
    });
    if (isMongoActive()) {
      try {
        await Article.updateMany(
          { featured: true, slug: { $ne: inMemoryArticles[idx].slug } },
          { $set: { featured: false } }
        );
      } catch (err) {
        console.warn('[ArticlesStore] Un-feature MongoDB warning:', err.message);
      }
    }
  }

  // Handle image field mirror
  if (updates.featuredImageUrl) {
    updates.imageUrl = updates.featuredImageUrl;
  }

  // Handle publishing date
  if (updates.status === 'published' && !inMemoryArticles[idx].publishedAt) {
    updates.publishedAt = new Date().toISOString();
  }

  updates.updatedAt = new Date().toISOString();

  inMemoryArticles[idx] = { ...inMemoryArticles[idx], ...updates };

  if (isMongoActive()) {
    try {
      const isObjectId = mongoose.isValidObjectId(idOrSlug);
      const query = isObjectId
        ? { $or: [{ _id: idOrSlug }, { slug: idOrSlug }, { articleId: idOrSlug }] }
        : { $or: [{ slug: idOrSlug }, { articleId: idOrSlug }] };

      await Article.findOneAndUpdate(query, updates, { new: true });
    } catch (err) {
      console.warn('[ArticlesStore] MongoDB update warning:', err.message);
    }
  }

  return inMemoryArticles[idx];
};

/**
 * Toggle publish / draft status.
 */
export const togglePublishArticle = async (idOrSlug) => {
  const idx = inMemoryArticles.findIndex(
    (a) =>
      a.id === idOrSlug ||
      a.articleId === idOrSlug ||
      a.slug === idOrSlug ||
      String(a._id) === idOrSlug
  );

  if (idx === -1) {
    throw new Error('Article not found.');
  }

  const currentStatus = inMemoryArticles[idx].status;
  const newStatus = currentStatus === 'published' ? 'draft' : 'published';

  inMemoryArticles[idx].status = newStatus;
  inMemoryArticles[idx].updatedAt = new Date().toISOString();

  if (newStatus === 'published' && !inMemoryArticles[idx].publishedAt) {
    inMemoryArticles[idx].publishedAt = new Date().toISOString();
  }

  if (isMongoActive()) {
    try {
      const isObjectId = mongoose.isValidObjectId(idOrSlug);
      const query = isObjectId
        ? { $or: [{ _id: idOrSlug }, { slug: idOrSlug }, { articleId: idOrSlug }] }
        : { $or: [{ slug: idOrSlug }, { articleId: idOrSlug }] };

      await Article.findOneAndUpdate(query, {
        status: newStatus,
        publishedAt: inMemoryArticles[idx].publishedAt,
        updatedAt: inMemoryArticles[idx].updatedAt,
      });
    } catch (err) {
      console.warn('[ArticlesStore] MongoDB toggle publish warning:', err.message);
    }
  }

  return { article: inMemoryArticles[idx], newStatus };
};

/**
 * Delete an article.
 */
export const deleteArticle = async (idOrSlug) => {
  const idx = inMemoryArticles.findIndex(
    (a) =>
      a.id === idOrSlug ||
      a.articleId === idOrSlug ||
      a.slug === idOrSlug ||
      String(a._id) === idOrSlug
  );

  if (idx === -1) {
    throw new Error('Article not found.');
  }

  const deleted = inMemoryArticles.splice(idx, 1)[0];

  if (isMongoActive()) {
    try {
      const isObjectId = mongoose.isValidObjectId(idOrSlug);
      const query = isObjectId
        ? { $or: [{ _id: idOrSlug }, { slug: idOrSlug }, { articleId: idOrSlug }] }
        : { $or: [{ slug: idOrSlug }, { articleId: idOrSlug }] };

      await Article.findOneAndDelete(query);
    } catch (err) {
      console.warn('[ArticlesStore] MongoDB delete warning:', err.message);
    }
  }

  return deleted;
};

export default {
  getAllArticles,
  getFeaturedArticle,
  getArticleByIdOrSlug,
  getCmsArticles,
  createArticle,
  updateArticle,
  togglePublishArticle,
  deleteArticle,
};
