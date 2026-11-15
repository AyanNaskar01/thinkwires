import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test-utils';
import BlogCard from '../../components/BlogComponents/BlogCard';
import FeaturedArticle from '../../components/BlogComponents/FeaturedArticle';

const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

describe('Blog Pipeline - Frontend Components & Display', () => {
  const sampleArticle = {
    id: 'test-art-1',
    slug: 'ai-in-global-delivery',
    title: 'AI in Global Delivery Centers: 2026 Benchmarks',
    summary: 'A comprehensive study on automation across tier-1 delivery centers.',
    excerpt: 'A comprehensive study on automation across tier-1 delivery centers.',
    category: 'Tech & AI',
    badge: 'Tech & AI',
    subCategory: 'Automation',
    readTime: '6 min read',
    publishedAt: '2026-09-15T10:00:00.000Z',
    featuredImageUrl: 'https://images.unsplash.com/photo-test-123.jpg',
    author: {
      name: 'Biswarupa Swain',
      role: 'Chief Technology Advisor',
      avatar: '',
      initials: 'BS',
    },
  };

  it('renders BlogCard with 16:9 cover banner and clean date formatting', () => {
    const { container } = renderWithProviders(
      <BlogCard article={sampleArticle} onReadClick={() => {}} />
    );

    // Title & Excerpt
    expect(screen.getByText('AI in Global Delivery Centers: 2026 Benchmarks')).toBeInTheDocument();
    expect(screen.getByText('A comprehensive study on automation across tier-1 delivery centers.')).toBeInTheDocument();

    // 16:9 Aspect Ratio Container for Cover Image
    const img = container.querySelector('img[alt="AI in Global Delivery Centers: 2026 Benchmarks"]');
    expect(img).toBeInTheDocument();
    const imgWrapper = img.parentElement;
    expect(imgWrapper.style.aspectRatio.replace(/\s+/g, '')).toBe('16/9');

    // Date formatted as 'Sep 15, 2026' rather than raw ISO
    expect(screen.getByText(/Sep 15, 2026/)).toBeInTheDocument();

    // Verify Read Time has NO emoji (⏱)
    expect(container.textContent).not.toContain('⏱');
    expect(emojiRegex.test(container.textContent)).toBe(false);
  });

  it('renders FeaturedArticle banner with dynamic fields and zero emojis', () => {
    const { container } = renderWithProviders(
      <FeaturedArticle article={sampleArticle} isBookmarked={false} onBookmarkToggle={() => {}} onReadClick={() => {}} />
    );

    // Title
    expect(screen.getByText('AI in Global Delivery Centers: 2026 Benchmarks')).toBeInTheDocument();

    // Author
    expect(screen.getByText('Biswarupa Swain')).toBeInTheDocument();
    expect(screen.getByText('Chief Technology Advisor')).toBeInTheDocument();

    // Primary finding / summary fallback
    const summaries = screen.getAllByText(/A comprehensive study on automation/);
    expect(summaries.length).toBeGreaterThan(0);

    // Formatted date
    expect(screen.getByText(/Sep 15, 2026/)).toBeInTheDocument();

    // Verify ZERO emojis in rendered text
    expect(emojiRegex.test(container.textContent)).toBe(false);
  });

  it('renders FeaturedArticle with default fallback when article is null or empty', () => {
    const { container } = renderWithProviders(
      <FeaturedArticle article={null} isBookmarked={false} onBookmarkToggle={() => {}} onReadClick={() => {}} />
    );

    // Default title should be present
    expect(screen.getByText(/Beyond the Code/i)).toBeInTheDocument();

    // Read Full Report button should be present
    expect(screen.getByText(/Read Full Report/i)).toBeInTheDocument();

    // Zero emojis
    expect(emojiRegex.test(container.textContent)).toBe(false);
  });
});
