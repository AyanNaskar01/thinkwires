import React from 'react';

const formatDisplayDate = (dateString) => {
  if (!dateString) return 'Recent';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
};

const BlogCard = ({ article, onReadClick }) => {
  if (!article) return null;

  const telemetry = article.telemetry || {
    type: 'box-split',
    label1: 'CONVERSION GAP',
    value1: '1:47 Ratio',
    badgeLabel: 'Selective Bias',
    badgeValue: 'Specialized vs General',
    boxBg: '#f1f5f9',
  };

  const coverImage = article.featuredImageUrl || article.imageUrl;

  return (
    <article className="FigmaBlogCard-container">
      {/* 16:9 Cover Image Banner */}
      {coverImage && (
        <div
          style={{
            width: '100%',
            aspectRatio: '16/9',
            borderRadius: '12px',
            overflow: 'hidden',
            marginBottom: '1rem',
            backgroundColor: '#f1f5f9',
            cursor: 'pointer',
          }}
          onClick={() => onReadClick && onReadClick(article)}
        >
          <img
            src={coverImage}
            alt={article.title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Top Badge & Read Time Header */}
      <div className="FigmaBlogCard-topRow">
        <span
          className="FigmaBlogCard-categoryPill"
          style={{
            backgroundColor: article.badgeBg || '#dbeafe',
            color: article.badgeColor || '#1e40af',
          }}
        >
          {article.badge || article.category}
        </span>
        <span className="FigmaBlogCard-readTime" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {article.readTime || '8 min read'}
        </span>
      </div>

      {/* Date & Sub-Category Row */}
      <div className="FigmaBlogCard-dateSubRow">
        <span>{formatDisplayDate(article.publishedAt)}</span>
        <span className="FigmaBlogCard-dot">•</span>
        <span className="FigmaBlogCard-subCategory">
          {article.subCategory || 'Talent Benchmarks'}
        </span>
      </div>

      {/* Title */}
      <h3
        className="FigmaBlogCard-title"
        onClick={() => onReadClick && onReadClick(article)}
      >
        {article.title}
      </h3>

      {/* Excerpt */}
      <p className="FigmaBlogCard-excerpt">
        {article.excerpt || article.summary}
      </p>

      {/* Dynamic Telemetry Box inside Card */}
      <div
        className="FigmaBlogCard-telemetryBox"
        style={{ backgroundColor: telemetry.boxBg || '#f8fafc' }}
      >
        {telemetry.type === 'progress-bar' ? (
          <div className="FigmaBlogCard-progressWrapper">
            <div className="FigmaBlogCard-progressHeader">
              <span className="FigmaBlogCard-telemetryLabel">
                {telemetry.label1}
              </span>
              <span className="FigmaBlogCard-telemetryValue">
                {telemetry.value1}
              </span>
            </div>
            <div className="FigmaBlogCard-progressBarBg">
              <div
                className="FigmaBlogCard-progressBarFill"
                style={{ width: telemetry.value1 || '72%' }}
              />
            </div>
          </div>
        ) : telemetry.type === 'chart-trend' ? (
          <div className="FigmaBlogCard-chartWrapper">
            <div>
              <div className="FigmaBlogCard-telemetryLabel">
                {telemetry.label1}
              </div>
              <div
                className="FigmaBlogCard-telemetryValue"
                style={{ color: '#ef4444' }}
              >
                {telemetry.value1}
              </div>
            </div>
            <svg width="70" height="24" viewBox="0 0 70 24" fill="none">
              <path
                d="M2 22 L20 16 L40 10 L68 2"
                stroke="#2563eb"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        ) : (
          <div className="FigmaBlogCard-splitWrapper">
            <div>
              <div className="FigmaBlogCard-telemetryLabel">
                {telemetry.label1}
              </div>
              <div className="FigmaBlogCard-telemetryValue">
                {telemetry.value1}
              </div>
            </div>
            {telemetry.badgeLabel && (
              <div className="FigmaBlogCard-rightPillBadge">
                <span className="FigmaBlogCard-rightPillTitle">
                  {telemetry.badgeLabel}
                </span>
                <span className="FigmaBlogCard-rightPillSub">
                  {telemetry.badgeValue}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Author Footer */}
      <div className="FigmaBlogCard-footer">
        <div className="FigmaBlogCard-authorGroup">
          {article.author?.avatar ? (
            <img
              src={article.author.avatar}
              alt={article.author.name}
              className="FigmaBlogCard-avatar"
            />
          ) : (
            <span className="FigmaBlogCard-initialsBubble">
              {article.author?.initials || 'TW'}
            </span>
          )}
          <span className="FigmaBlogCard-authorName">
            {article.author?.name}
          </span>
        </div>

        <button
          onClick={() => onReadClick && onReadClick(article)}
          className="FigmaBlogCard-readLink"
        >
          Read Analysis ›
        </button>
      </div>
    </article>
  );
};

export default BlogCard;
