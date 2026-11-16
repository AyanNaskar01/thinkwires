import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { adminApi } from './adminService';
import {
  EditIcon,
  EyeIcon,
  TrashIcon,
  CloseIcon,
  AlertCircleIcon,
} from './AdminIcons';

// Lucide-style SVG icons (clean, no emojis)
const UploadCloudIcon = ({ size = 20, color = 'currentColor', style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
  >
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    <polyline points="16 16 12 12 8 16" />
  </svg>
);

const CheckIcon = ({ size = 16, color = 'currentColor', style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ExternalLinkIcon = ({ size = 13, color = 'currentColor', style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const StarBadgeIcon = ({ size = 13, color = '#2563EB', fill = 'none' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

/**
 * Loads an image file from the user's computer/file manager.
 * If aspectRatio is provided (e.g. 16/9 for banners, 1/1 for avatars):
 * center-crops the image to that exact ratio and resizes to target dimensions.
 * Returns an optimized Base64 data URL.
 */
const cropAndResizeImage = (
  file,
  { targetWidth = 1280, targetHeight = 720, aspectRatio = 16 / 9, quality = 0.88 } = {}
) => {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected'));
    if (!file.type || !file.type.startsWith('image/')) {
      return reject(
        new Error('Please select a valid image file (PNG, JPG, WebP, SVG).')
      );
    }

    // Direct read for vector SVGs
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const { naturalWidth: srcW, naturalHeight: srcH } = img;
        if (!srcW || !srcH) {
          return resolve(e.target.result);
        }

        let sx = 0;
        let sy = 0;
        let sWidth = srcW;
        let sHeight = srcH;

        if (aspectRatio) {
          const currentRatio = srcW / srcH;
          if (currentRatio > aspectRatio) {
            // Image is wider than target ratio: crop left and right sides
            sWidth = Math.round(srcH * aspectRatio);
            sx = Math.round((srcW - sWidth) / 2);
          } else if (currentRatio < aspectRatio) {
            // Image is taller than target ratio: crop top and bottom
            sHeight = Math.round(srcW / aspectRatio);
            sy = Math.round((srcH - sHeight) / 2);
          }
        }

        const outWidth = Math.min(targetWidth, sWidth);
        const outHeight = aspectRatio
          ? Math.round(outWidth / aspectRatio)
          : Math.round((outWidth * sHeight) / sWidth);

        const canvas = document.createElement('canvas');
        canvas.width = outWidth;
        canvas.height = outHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return resolve(e.target.result);
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, outWidth, outHeight);

        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, quality);
        resolve(dataUrl);
      };
      img.onerror = () =>
        reject(new Error('Could not read image. Please select a valid file.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
};

// Helper to render article body paragraphs and markdown images in preview modal
const renderArticleContent = (content) => {
  if (!content) return null;
  const blocks = String(content)
    .split(/\n\n+/)
    .filter((p) => p.trim() !== '');

  return blocks.map((block, idx) => {
    const trimmed = block.trim();
    const imgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imgMatch) {
      const [, alt, src] = imgMatch;
      return (
        <figure
          key={idx}
          style={{
            margin: '1.25rem 0',
            textAlign: 'center',
            backgroundColor: '#F8FAFC',
            padding: '0.5rem',
            borderRadius: '8px',
          }}
        >
          <img
            src={src}
            alt={alt || 'Article visual'}
            style={{
              maxWidth: '100%',
              borderRadius: '6px',
              border: '1px solid #E2E8F0',
              maxHeight: '360px',
              objectFit: 'contain',
              display: 'block',
              margin: '0 auto',
            }}
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          {alt && (
            <figcaption
              style={{
                fontSize: '0.75rem',
                color: '#64748B',
                marginTop: '0.35rem',
                fontStyle: 'italic',
              }}
            >
              {alt}
            </figcaption>
          )}
        </figure>
      );
    }
    return (
      <p
        key={idx}
        style={{
          lineHeight: '1.7',
          fontSize: '0.9rem',
          color: '#172033',
          marginBottom: '0.85rem',
          whiteSpace: 'pre-line',
        }}
      >
        {block}
      </p>
    );
  });
};

const STANDARD_CATEGORIES = [
  'Tech & AI',
  'Industry Insights',
  'Hiring & Talent',
  'Global Delivery',
  'General',
];

const BlogManager = () => {
  const { showToast, activeRole } = useOutletContext();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modals
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewArticle, setPreviewArticle] = useState(null);
  const [editingArticle, setEditingArticle] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    summary: '',
    body: '',
    authorName: 'Biswarupa Swain',
    authorRole: 'Chief Technology Advisor',
    authorAvatar: '',
    category: 'Industry Insights',
    featuredImageUrl: '',
    tags: 'Tech, Strategy, Insights',
    featured: false,
    status: 'published',
  });

  const [customCategoryActive, setCustomCategoryActive] = useState(false);
  const [formError, setFormError] = useState('');

  // Image Upload File References & Upload Mode States
  const featuredFileInputRef = useRef(null);
  const authorFileInputRef = useRef(null);
  const bodyImageFileInputRef = useRef(null);

  const [featuredInputMode, setFeaturedInputMode] = useState('file'); // 'file' | 'url'
  const [authorInputMode, setAuthorInputMode] = useState('file'); // 'file' | 'url'
  const [isDraggingFeatured, setIsDraggingFeatured] = useState(false);

  // 16:9 Banner Image Handler (Direct file selection with automatic 16:9 crop)
  const handleFeaturedFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await cropAndResizeImage(file, {
        targetWidth: 1280,
        targetHeight: 720,
        aspectRatio: 16 / 9,
        quality: 0.88,
      });
      setFormData((prev) => ({ ...prev, featuredImageUrl: dataUrl }));
      showToast(`Cover banner formatted to 16:9 from '${file.name}'.`);
    } catch (err) {
      showToast(err.message || 'Could not process cover image.');
    }
    e.target.value = '';
  };

  const handleFeaturedDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFeatured(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await cropAndResizeImage(file, {
        targetWidth: 1280,
        targetHeight: 720,
        aspectRatio: 16 / 9,
        quality: 0.88,
      });
      setFormData((prev) => ({ ...prev, featuredImageUrl: dataUrl }));
      showToast(`Cover banner formatted to 16:9 from '${file.name}'.`);
    } catch (err) {
      showToast(err.message || 'Could not process dropped image.');
    }
  };

  // 1:1 Author Avatar Handler (Direct file selection with automatic 1:1 square crop)
  const handleAuthorFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await cropAndResizeImage(file, {
        targetWidth: 400,
        targetHeight: 400,
        aspectRatio: 1 / 1,
        quality: 0.88,
      });
      setFormData((prev) => ({ ...prev, authorAvatar: dataUrl }));
      showToast(`Author photo loaded from '${file.name}'.`);
    } catch (err) {
      showToast(err.message || 'Could not process author photo.');
    }
    e.target.value = '';
  };

  // Inline Body Image Handler (Preserves natural aspect ratio, max width 1200)
  const handleBodyImageFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await cropAndResizeImage(file, {
        targetWidth: 1200,
        aspectRatio: null,
        quality: 0.88,
      });
      const defaultCaption = file.name.replace(/\.[^/.]+$/, '');
      const caption =
        window.prompt('Enter Image Caption (optional):', defaultCaption) ||
        defaultCaption ||
        'Article Visual';
      const mdImage = `\n\n![${caption}](${dataUrl})\n\n`;
      setFormData((prev) => ({
        ...prev,
        body: (prev.body || '') + mdImage,
      }));
      showToast(`Image '${file.name}' inserted into article content.`);
    } catch (err) {
      showToast(err.message || 'Could not process body image.');
    }
    e.target.value = '';
  };

  const handleInsertBodyImageUrl = () => {
    const url = window.prompt('Enter Image URL:');
    if (!url) return;
    const caption =
      window.prompt('Enter Image Caption (optional):') || 'Article Visual';
    const mdImage = `\n\n![${caption}](${url})\n\n`;
    setFormData((prev) => ({
      ...prev,
      body: (prev.body || '') + mdImage,
    }));
  };

  const fetchArticles = () => {
    setLoading(true);
    adminApi
      .getCmsArticles({ search, status: statusFilter })
      .then((res) => {
        setArticles(res.articles || []);
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        showToast(`Failed to load articles: ${err.message}`);
      });
  };

  useEffect(() => {
    let isMounted = true;
    adminApi
      .getCmsArticles({ search, status: statusFilter })
      .then((res) => {
        if (isMounted) {
          setArticles(res.articles || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setLoading(false);
          showToast(`Failed to load articles: ${err.message}`);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [search, statusFilter, showToast]);

  const openAddModal = () => {
    if (activeRole === 'viewer') {
      showToast('Viewer accounts cannot author blog articles.');
      return;
    }
    setEditingArticle(null);
    setFormData({
      title: '',
      slug: '',
      summary: '',
      body: '',
      authorName: 'Biswarupa Swain',
      authorRole: 'Chief Technology Advisor',
      authorAvatar: '',
      category: 'Industry Insights',
      featuredImageUrl: '',
      tags: 'Tech, Strategy, Insights',
      featured: false,
      status: 'published',
    });
    setCustomCategoryActive(false);
    setFeaturedInputMode('file');
    setAuthorInputMode('file');
    setFormError('');
    setEditorOpen(true);
  };

  const openEditModal = (art) => {
    if (activeRole === 'viewer') {
      showToast('Viewer accounts cannot edit articles.');
      return;
    }
    setEditingArticle(art);
    const cat = art.category || 'Industry Insights';
    const isCustom = !STANDARD_CATEGORIES.includes(cat);
    setCustomCategoryActive(isCustom);

    setFormData({
      title: art.title || '',
      slug: art.slug || '',
      summary: art.summary || art.excerpt || '',
      body: art.body || art.content || '',
      authorName: art.author?.name || 'Thinkwires Team',
      authorRole: art.author?.role || 'Staff Contributor',
      authorAvatar:
        art.author?.avatar || art.author?.imageUrl || art.authorAvatar || '',
      category: cat,
      featuredImageUrl: art.featuredImageUrl || art.imageUrl || '',
      tags: Array.isArray(art.tags) ? art.tags.join(', ') : art.tags || '',
      featured: Boolean(art.featured),
      status: art.status || 'published',
    });
    setFeaturedInputMode('file');
    setAuthorInputMode('file');
    setFormError('');
    setEditorOpen(true);
  };

  const handleTogglePublish = (id) => {
    if (activeRole === 'viewer') {
      showToast('Viewer accounts cannot change article status.');
      return;
    }
    adminApi
      .togglePublishCmsArticle(id)
      .then((res) => {
        showToast(`Article status changed to ${res.status}`);
        fetchArticles();
      })
      .catch((err) => showToast(`Status change failed: ${err.message}`));
  };

  const handleToggleFeatured = async (art) => {
    if (activeRole === 'viewer') {
      showToast('Viewer accounts cannot change featured status.');
      return;
    }
    const newFeatured = !art.featured;
    try {
      await adminApi.updateCmsArticle(art.id || art._id, {
        featured: newFeatured,
      });
      showToast(
        newFeatured
          ? `Article '${art.title}' marked as Featured.`
          : `Featured status removed from '${art.title}'.`
      );
      fetchArticles();
    } catch (err) {
      showToast(`Failed to update featured status: ${err.message}`);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (
      !formData.title.trim() ||
      !formData.summary.trim() ||
      !formData.body.trim()
    ) {
      setFormError('Please enter article Title, Short Summary, and Full Article Content.');
      return;
    }

    const resolvedInitials = formData.authorName
      ? formData.authorName
          .split(' ')
          .map((n) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()
      : 'TW';

    const payload = {
      ...formData,
      author: {
        name: formData.authorName,
        role: formData.authorRole,
        avatar: formData.authorAvatar,
        initials: resolvedInitials,
      },
      authorAvatar: formData.authorAvatar,
      tags: formData.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    };

    if (editingArticle) {
      adminApi
        .updateCmsArticle(editingArticle.id || editingArticle._id, payload)
        .then(() => {
          showToast(`Article '${formData.title}' updated successfully.`);
          setEditorOpen(false);
          fetchArticles();
        })
        .catch((err) => setFormError(err.message));
    } else {
      adminApi
        .createCmsArticle(payload)
        .then(() => {
          showToast(`Article '${formData.title}' created successfully.`);
          setEditorOpen(false);
          fetchArticles();
        })
        .catch((err) => setFormError(err.message));
    }
  };

  const handleDelete = (id) => {
    if (activeRole === 'viewer') {
      showToast('Viewer accounts cannot delete articles.');
      return;
    }
    adminApi
      .deleteCmsArticle(id)
      .then(() => {
        showToast('Article deleted.');
        setDeleteConfirmId(null);
        fetchArticles();
      })
      .catch((err) => showToast(`Delete failed: ${err.message}`));
  };

  return (
    <div>
      <div className="tw-view-header">
        <div className="tw-view-title-group">
          <h1>Blog & Articles Management</h1>
          <p className="tw-view-subtitle">
            Create, edit, and publish blogs, research reports, and industry insights for the Thinkwires website.
          </p>
        </div>

        <button className="tw-btn-primary" onClick={openAddModal}>
          <EditIcon size={15} />
          <span>New Article</span>
        </button>
      </div>

      <div className="tw-table-container">
        <div className="tw-table-toolbar">
          <div className="tw-table-filters">
            <input
              type="text"
              className="tw-filter-input"
              placeholder="Search by title, summary, or tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '260px' }}
            />

            <select
              className="tw-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Statuses</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </div>

          <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
            Total Articles: <strong>{articles.length}</strong>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="tw-table">
            <thead>
              <tr>
                <th>Article Title & Link</th>
                <th>Author</th>
                <th>Category</th>
                <th>Featured</th>
                <th>Status</th>
                <th>Views</th>
                <th>Published</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan="8"
                    style={{
                      textAlign: 'center',
                      padding: '2rem',
                      color: '#64748B',
                    }}
                  >
                    Loading articles...
                  </td>
                </tr>
              ) : articles.length === 0 ? (
                <tr>
                  <td
                    colSpan="8"
                    style={{
                      textAlign: 'center',
                      padding: '2.5rem',
                      color: '#64748B',
                    }}
                  >
                    No articles found. Click "New Article" to create your first blog.
                  </td>
                </tr>
              ) : (
                articles.map((art) => (
                  <tr key={art.id || art._id}>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.65rem',
                        }}
                      >
                        {art.featuredImageUrl && (
                          <img
                            src={art.featuredImageUrl}
                            alt=""
                            style={{
                              width: '44px',
                              height: '28px',
                              borderRadius: '4px',
                              objectFit: 'cover',
                              border: '1px solid #E2E8F0',
                              flexShrink: 0,
                            }}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        )}
                        <div>
                          <div style={{ fontWeight: 600 }}>{art.title}</div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              marginTop: '2px',
                            }}
                          >
                            <a
                              href={`/blog/${art.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: '0.72rem',
                                color: '#2563EB',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                            >
                              <span>/blog/{art.slug}</span>
                              <ExternalLinkIcon size={11} color="#2563EB" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        {art.author?.avatar ? (
                          <img
                            src={art.author.avatar}
                            alt={art.author.name}
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: '1px solid #CBD5E1',
                              flexShrink: 0,
                            }}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              backgroundColor: '#E2E8F0',
                              color: '#475569',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              flexShrink: 0,
                            }}
                          >
                            {art.author?.initials ||
                              (art.author?.name
                                ? art.author.name
                                    .split(' ')
                                    .map((n) => n[0])
                                    .join('')
                                    .slice(0, 2)
                                    .toUpperCase()
                                : 'TW')}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.82rem' }}>
                            {art.author?.name || 'Staff'}
                          </div>
                          <div
                            style={{
                              fontSize: '0.7rem',
                              color: '#64748B',
                            }}
                          >
                            {art.author?.role || 'Contributor'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="tw-badge available">{art.category}</span>
                    </td>
                    <td>
                      <button
                        onClick={() => handleToggleFeatured(art)}
                        style={{
                          border: art.featured
                            ? '1px solid #93C5FD'
                            : '1px solid #E2E8F0',
                          backgroundColor: art.featured ? '#EFF6FF' : '#F8FAFC',
                          color: art.featured ? '#1D4ED8' : '#64748B',
                          padding: '0.25rem 0.6rem',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        title={
                          art.featured
                            ? 'Click to remove featured status'
                            : 'Click to make this the featured article on top'
                        }
                      >
                        <StarBadgeIcon
                          size={12}
                          color={art.featured ? '#1D4ED8' : '#94A3B8'}
                          fill={art.featured ? '#1D4ED8' : 'none'}
                        />
                        <span>{art.featured ? 'Featured' : 'Standard'}</span>
                      </button>
                    </td>
                    <td>
                      <button
                        onClick={() => handleTogglePublish(art.id || art._id)}
                        className={`tw-badge ${art.status.toLowerCase()}`}
                        style={{ border: 'none', cursor: 'pointer' }}
                        title="Click to toggle status"
                      >
                        {art.status === 'published' ? 'Live' : 'Draft'}
                      </button>
                    </td>
                    <td>
                      <strong>{(art.viewsCount || 0).toLocaleString()}</strong>
                    </td>
                    <td>
                      {art.publishedAt
                        ? new Date(art.publishedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : 'Unpublished'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div
                        className="tw-action-btn-group"
                        style={{ justifyContent: 'flex-end' }}
                      >
                        <button
                          className="tw-action-icon-btn"
                          onClick={() => setPreviewArticle(art)}
                          title="Preview Article"
                        >
                          <EyeIcon size={14} />
                        </button>
                        <button
                          className="tw-action-icon-btn"
                          onClick={() => openEditModal(art)}
                          title="Edit Article"
                        >
                          <EditIcon size={14} />
                        </button>
                        <button
                          className="tw-action-icon-btn delete"
                          onClick={() => setDeleteConfirmId(art.id || art._id)}
                          title="Delete Article"
                        >
                          <TrashIcon size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview Modal */}
      {previewArticle && (
        <div className="tw-modal-overlay">
          <div className="tw-modal" style={{ maxWidth: '680px' }}>
            <div className="tw-modal-header">
              <div>
                <span
                  className="tw-badge deployed"
                  style={{ marginBottom: '0.25rem' }}
                >
                  {previewArticle.category} •{' '}
                  {previewArticle.readTime || '4 min read'}
                </span>
                <h2 className="tw-modal-title">{previewArticle.title}</h2>
              </div>
              <button
                className="tw-modal-close-btn"
                onClick={() => setPreviewArticle(null)}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <div className="tw-modal-body">
              {previewArticle.featuredImageUrl && (
                <div
                  style={{
                    marginBottom: '1rem',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    aspectRatio: '16/9',
                    backgroundColor: '#F1F5F9',
                  }}
                >
                  <img
                    src={previewArticle.featuredImageUrl}
                    alt={previewArticle.title}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  marginBottom: '1rem',
                  fontSize: '0.82rem',
                  color: '#64748B',
                }}
              >
                {previewArticle.author?.avatar ? (
                  <img
                    src={previewArticle.author.avatar}
                    alt={previewArticle.author.name}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '1px solid #CBD5E1',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: '#E2E8F0',
                      color: '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '0.72rem',
                    }}
                  >
                    {previewArticle.author?.initials || 'TW'}
                  </div>
                )}
                <div>
                  <strong>By {previewArticle.author?.name || 'Staff'}</strong> •{' '}
                  {previewArticle.author?.role || 'Contributor'}
                </div>
              </div>

              {(previewArticle.summary || previewArticle.excerpt) && (
                <div
                  style={{
                    fontStyle: 'italic',
                    padding: '0.85rem 1rem',
                    backgroundColor: '#F8FAFC',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    borderLeft: '4px solid #008F68',
                    fontSize: '0.88rem',
                    color: '#334155',
                  }}
                >
                  {previewArticle.summary || previewArticle.excerpt}
                </div>
              )}

              <div style={{ color: '#172033' }}>
                {renderArticleContent(
                  previewArticle.body ||
                    previewArticle.content ||
                    previewArticle.summary
                )}
              </div>
            </div>

            <div className="tw-modal-footer">
              <button
                className="tw-btn-secondary"
                onClick={() => setPreviewArticle(null)}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Article Modal */}
      {editorOpen && (
        <div className="tw-modal-overlay">
          <div className="tw-modal" style={{ maxWidth: '680px' }}>
            <div className="tw-modal-header">
              <h2 className="tw-modal-title">
                {editingArticle ? 'Edit Article' : 'New Article'}
              </h2>
              <button
                className="tw-modal-close-btn"
                onClick={() => setEditorOpen(false)}
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="tw-modal-body">
                {formError && (
                  <div
                    style={{
                      padding: '0.65rem 0.9rem',
                      backgroundColor: '#FEE2E2',
                      color: '#DC2626',
                      borderRadius: '8px',
                      marginBottom: '1rem',
                      fontSize: '0.82rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <AlertCircleIcon size={16} />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Article Title */}
                <div className="tw-form-group">
                  <label className="tw-form-label">
                    Article Title *
                  </label>
                  <input
                    type="text"
                    className="tw-form-input"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="Enter article headline..."
                    required
                  />
                </div>

                {/* Web Address (Slug) & Category */}
                <div className="tw-form-row">
                  <div className="tw-form-group">
                    <label className="tw-form-label">Web Address (Slug)</label>
                    <input
                      type="text"
                      className="tw-form-input"
                      value={formData.slug}
                      onChange={(e) =>
                        setFormData({ ...formData, slug: e.target.value })
                      }
                      placeholder="e.g. scaling-tech-delivery"
                    />
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: '#64748B',
                        marginTop: '3px',
                        display: 'block',
                      }}
                    >
                      Web link: /blog/{formData.slug || 'your-address'} (auto-generated if empty)
                    </span>
                  </div>

                  <div className="tw-form-group">
                    <label className="tw-form-label">Category</label>
                    <select
                      className="tw-form-select"
                      value={
                        customCategoryActive
                          ? 'custom'
                          : formData.category
                      }
                      onChange={(e) => {
                        if (e.target.value === 'custom') {
                          setCustomCategoryActive(true);
                        } else {
                          setCustomCategoryActive(false);
                          setFormData({ ...formData, category: e.target.value });
                        }
                      }}
                    >
                      {STANDARD_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="custom">Custom Category...</option>
                    </select>

                    {customCategoryActive && (
                      <input
                        type="text"
                        className="tw-form-input"
                        style={{ marginTop: '0.5rem' }}
                        value={formData.category}
                        onChange={(e) =>
                          setFormData({ ...formData, category: e.target.value })
                        }
                        placeholder="Type custom category name..."
                        required
                      />
                    )}
                  </div>
                </div>

                {/* Featured Blog Option */}
                <div
                  className="tw-form-group"
                  style={{
                    backgroundColor: '#F8FAFC',
                    padding: '0.85rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.65rem',
                      cursor: 'pointer',
                      margin: 0,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.featured}
                      onChange={(e) =>
                        setFormData({ ...formData, featured: e.target.checked })
                      }
                      style={{
                        width: '18px',
                        height: '18px',
                        marginTop: '2px',
                        accentColor: '#2563EB',
                        cursor: 'pointer',
                      }}
                    />
                    <div>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: '0.88rem',
                          color: '#0F172A',
                          display: 'block',
                        }}
                      >
                        Make this a Featured Blog
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: '#64748B',
                          display: 'block',
                          marginTop: '2px',
                        }}
                      >
                        Show this blog in the top banner on the main blog page. If no blog is marked featured, the latest published blog will be shown on the top automatically.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Cover Image (16:9 Banner) */}
                <div className="tw-form-group">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.4rem',
                    }}
                  >
                    <label className="tw-form-label" style={{ marginBottom: 0 }}>
                      Cover Image (16:9 Banner)
                    </label>
                    <div
                      style={{
                        display: 'inline-flex',
                        backgroundColor: '#F1F5F9',
                        borderRadius: '6px',
                        padding: '2px',
                        gap: '2px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setFeaturedInputMode('file')}
                        style={{
                          border: 'none',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          backgroundColor:
                            featuredInputMode === 'file' ? '#FFFFFF' : 'transparent',
                          color:
                            featuredInputMode === 'file' ? '#0F172A' : '#64748B',
                          boxShadow:
                            featuredInputMode === 'file'
                              ? '0 1px 2px rgba(0,0,0,0.06)'
                              : 'none',
                        }}
                      >
                        Upload from Computer
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeaturedInputMode('url')}
                        style={{
                          border: 'none',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          backgroundColor:
                            featuredInputMode === 'url' ? '#FFFFFF' : 'transparent',
                          color:
                            featuredInputMode === 'url' ? '#0F172A' : '#64748B',
                          boxShadow:
                            featuredInputMode === 'url'
                              ? '0 1px 2px rgba(0,0,0,0.06)'
                              : 'none',
                        }}
                      >
                        Image Link
                      </button>
                    </div>
                  </div>

                  {/* Hidden file input for Cover Image (16:9) */}
                  <input
                    type="file"
                    ref={featuredFileInputRef}
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                    style={{ display: 'none' }}
                    onChange={handleFeaturedFileSelect}
                  />

                  {featuredInputMode === 'file' ? (
                    formData.featuredImageUrl ? (
                      <div
                        style={{
                          position: 'relative',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          border: '1px solid #CBD5E1',
                          backgroundColor: '#0F172A',
                          aspectRatio: '16/9',
                          maxHeight: '220px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <img
                          src={formData.featuredImageUrl}
                          alt="Cover Preview"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background:
                              'linear-gradient(to top, rgba(15,23,42,0.85) 0%, rgba(15,23,42,0.15) 50%, rgba(15,23,42,0.4) 100%)',
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'space-between',
                            padding: '0.75rem 1rem',
                          }}
                        >
                          <span
                            style={{
                              color: '#F8FAFC',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              backgroundColor: 'rgba(0,0,0,0.45)',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                            }}
                          >
                            <CheckIcon size={14} color="#10B981" />
                            <span>Cover Image Ready (Fixed 16:9)</span>
                          </span>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              type="button"
                              onClick={() => featuredFileInputRef.current?.click()}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                backgroundColor: '#FFFFFF',
                                color: '#0F172A',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '0.35rem 0.75rem',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                              }}
                            >
                              Replace Image
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  featuredImageUrl: '',
                                }))
                              }
                              style={{
                                backgroundColor: '#EF4444',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '0.35rem 0.65rem',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => featuredFileInputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDraggingFeatured(true);
                        }}
                        onDragLeave={() => setIsDraggingFeatured(false)}
                        onDrop={handleFeaturedDrop}
                        style={{
                          border: isDraggingFeatured
                            ? '2px dashed #2563EB'
                            : '2px dashed #CBD5E1',
                          backgroundColor: isDraggingFeatured
                            ? '#EFF6FF'
                            : '#F8FAFC',
                          borderRadius: '8px',
                          padding: '1.75rem 1rem',
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease-in-out',
                        }}
                      >
                        <div
                          style={{
                            color: '#2563EB',
                            marginBottom: '0.5rem',
                            display: 'flex',
                            justifyContent: 'center',
                          }}
                        >
                          <UploadCloudIcon size={32} color="#2563EB" />
                        </div>
                        <div
                          style={{
                            fontSize: '0.88rem',
                            fontWeight: 600,
                            color: '#1E293B',
                            marginBottom: '0.25rem',
                          }}
                        >
                          Click to select image from your computer
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                          or drag and drop your image file here (PNG, JPG, WebP)
                        </div>
                      </div>
                    )
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                      }}
                    >
                      <input
                        type="text"
                        className="tw-form-input"
                        value={formData.featuredImageUrl}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            featuredImageUrl: e.target.value,
                          })
                        }
                        placeholder="/assets/blog_image.jpg or https://..."
                        style={{ flex: 1 }}
                      />
                      {formData.featuredImageUrl && (
                        <img
                          src={formData.featuredImageUrl}
                          alt="Cover Preview"
                          style={{
                            width: '54px',
                            height: '36px',
                            borderRadius: '6px',
                            objectFit: 'cover',
                            border: '1px solid #CBD5E1',
                            flexShrink: 0,
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                  )}
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: '#64748B',
                      marginTop: '0.3rem',
                      display: 'block',
                    }}
                  >
                    Image is automatically formatted to a 16:9 ratio so cards and banner displays stay uniform.
                  </span>
                </div>

                {/* Author Information */}
                <div className="tw-form-row">
                  <div className="tw-form-group">
                    <label className="tw-form-label">Author Name</label>
                    <input
                      type="text"
                      className="tw-form-input"
                      value={formData.authorName}
                      onChange={(e) =>
                        setFormData({ ...formData, authorName: e.target.value })
                      }
                      placeholder="e.g. Biswarupa Swain"
                    />
                  </div>
                  <div className="tw-form-group">
                    <label className="tw-form-label">Author Role</label>
                    <input
                      type="text"
                      className="tw-form-input"
                      value={formData.authorRole}
                      onChange={(e) =>
                        setFormData({ ...formData, authorRole: e.target.value })
                      }
                      placeholder="e.g. Chief Technology Advisor"
                    />
                  </div>
                </div>

                {/* Author Photo (1:1 Square) */}
                <div className="tw-form-group">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.4rem',
                    }}
                  >
                    <label className="tw-form-label" style={{ marginBottom: 0 }}>
                      Author Photo
                    </label>
                    <div
                      style={{
                        display: 'inline-flex',
                        backgroundColor: '#F1F5F9',
                        borderRadius: '6px',
                        padding: '2px',
                        gap: '2px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setAuthorInputMode('file')}
                        style={{
                          border: 'none',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          backgroundColor:
                            authorInputMode === 'file' ? '#FFFFFF' : 'transparent',
                          color:
                            authorInputMode === 'file' ? '#0F172A' : '#64748B',
                          boxShadow:
                            authorInputMode === 'file'
                              ? '0 1px 2px rgba(0,0,0,0.06)'
                              : 'none',
                        }}
                      >
                        Upload from Computer
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthorInputMode('url')}
                        style={{
                          border: 'none',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          backgroundColor:
                            authorInputMode === 'url' ? '#FFFFFF' : 'transparent',
                          color:
                            authorInputMode === 'url' ? '#0F172A' : '#64748B',
                          boxShadow:
                            authorInputMode === 'url'
                              ? '0 1px 2px rgba(0,0,0,0.06)'
                              : 'none',
                        }}
                      >
                        Image Link
                      </button>
                    </div>
                  </div>

                  <input
                    type="file"
                    ref={authorFileInputRef}
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                    style={{ display: 'none' }}
                    onChange={handleAuthorFileSelect}
                  />

                  {authorInputMode === 'file' ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.85rem',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0',
                        backgroundColor: '#F8FAFC',
                      }}
                    >
                      {formData.authorAvatar ? (
                        <img
                          src={formData.authorAvatar}
                          alt="Author Preview"
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '2px solid #2563EB',
                            flexShrink: 0,
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '50%',
                            backgroundColor: '#E2E8F0',
                            color: '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {formData.authorName
                            ? formData.authorName
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()
                            : 'TW'}
                        </div>
                      )}

                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => authorFileInputRef.current?.click()}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              padding: '0.35rem 0.75rem',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              borderRadius: '6px',
                              backgroundColor: '#FFFFFF',
                              color: '#0F172A',
                              border: '1px solid #CBD5E1',
                              cursor: 'pointer',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            }}
                          >
                            Choose Photo from Computer
                          </button>
                          {formData.authorAvatar && (
                            <button
                              type="button"
                              onClick={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  authorAvatar: '',
                                }))
                              }
                              style={{
                                border: 'none',
                                background: 'transparent',
                                color: '#EF4444',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                padding: '0.2rem 0.4rem',
                              }}
                            >
                              Remove Photo
                            </button>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            color: '#64748B',
                            marginTop: '0.3rem',
                            display: 'block',
                          }}
                        >
                          Automatically cropped to a square headshot (JPG, PNG, WebP).
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                      }}
                    >
                      <input
                        type="text"
                        className="tw-form-input"
                        value={formData.authorAvatar}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            authorAvatar: e.target.value,
                          })
                        }
                        placeholder="https://... or /assets/authors/avatar.jpg"
                        style={{ flex: 1 }}
                      />
                      {formData.authorAvatar && (
                        <img
                          src={formData.authorAvatar}
                          alt="Author Preview"
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '2px solid #E2E8F0',
                            flexShrink: 0,
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Short Summary */}
                <div className="tw-form-group">
                  <label className="tw-form-label">
                    Short Summary *
                  </label>
                  <textarea
                    className="tw-form-textarea"
                    rows="2"
                    value={formData.summary}
                    onChange={(e) =>
                      setFormData({ ...formData, summary: e.target.value })
                    }
                    placeholder="A 1-2 sentence overview shown on blog cards and search previews..."
                    required
                  ></textarea>
                </div>

                {/* Full Article Content */}
                <div className="tw-form-group">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.4rem',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <label className="tw-form-label" style={{ marginBottom: 0 }}>
                      Full Article Content *
                    </label>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <input
                        type="file"
                        ref={bodyImageFileInputRef}
                        accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                        style={{ display: 'none' }}
                        onChange={handleBodyImageFileSelect}
                      />
                      <button
                        type="button"
                        onClick={() => bodyImageFileInputRef.current?.click()}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.25rem 0.7rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          borderRadius: '6px',
                          backgroundColor: '#EFF6FF',
                          color: '#2563EB',
                          border: '1px solid #BFDBFE',
                          cursor: 'pointer',
                        }}
                        title="Select an image from your computer to insert into the content"
                      >
                        Insert Image from Computer
                      </button>
                      <button
                        type="button"
                        onClick={handleInsertBodyImageUrl}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.25rem 0.6rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          borderRadius: '6px',
                          backgroundColor: '#F1F5F9',
                          color: '#475569',
                          border: '1px solid #CBD5E1',
                          cursor: 'pointer',
                        }}
                        title="Insert image by web link"
                      >
                        Via Link
                      </button>
                    </div>
                  </div>
                  <textarea
                    className="tw-form-textarea"
                    rows="8"
                    value={formData.body}
                    onChange={(e) =>
                      setFormData({ ...formData, body: e.target.value })
                    }
                    placeholder="Enter full article text, paragraphs, and analysis. Click 'Insert Image from Computer' above to add visuals anywhere."
                    required
                  ></textarea>
                </div>

                {/* Status & Tags */}
                <div className="tw-form-row">
                  <div className="tw-form-group">
                    <label className="tw-form-label">Publication Status</label>
                    <select
                      className="tw-form-select"
                      value={formData.status}
                      onChange={(e) =>
                        setFormData({ ...formData, status: e.target.value })
                      }
                    >
                      <option value="published">Published (Visible on public website)</option>
                      <option value="draft">Draft (Saved in admin only)</option>
                    </select>
                  </div>
                  <div className="tw-form-group">
                    <label className="tw-form-label">
                      Tags (comma separated)
                    </label>
                    <input
                      type="text"
                      className="tw-form-input"
                      value={formData.tags}
                      onChange={(e) =>
                        setFormData({ ...formData, tags: e.target.value })
                      }
                      placeholder="e.g. AI, Hiring, Strategy"
                    />
                  </div>
                </div>
              </div>

              <div className="tw-modal-footer">
                <button
                  type="button"
                  className="tw-btn-secondary"
                  onClick={() => setEditorOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="tw-btn-primary">
                  {editingArticle ? 'Save Changes' : 'Publish Article'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="tw-modal-overlay">
          <div className="tw-modal" style={{ maxWidth: '440px' }}>
            <div className="tw-modal-header">
              <h2 className="tw-modal-title">Delete Article</h2>
              <button
                className="tw-modal-close-btn"
                onClick={() => setDeleteConfirmId(null)}
              >
                <CloseIcon size={16} />
              </button>
            </div>
            <div className="tw-modal-body">
              Are you sure you want to permanently delete this blog article from the CMS?
            </div>
            <div className="tw-modal-footer">
              <button
                className="tw-btn-secondary"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </button>
              <button
                className="tw-btn-danger"
                onClick={() => handleDelete(deleteConfirmId)}
              >
                Delete Article
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlogManager;
