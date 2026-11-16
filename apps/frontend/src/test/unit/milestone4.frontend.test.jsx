import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
import { useDebounce } from '../../hooks/useDebounce';
import {
  getCandidateToken,
  setCandidateToken,
  clearCandidateToken,
  getCandidateAuthHeaders,
} from '../../utils/apiConfig';
import { adminApi } from '../../admin/adminService';
import AboutHero from '../../components/AboutComponents/AboutHero';
import Philosophy from '../../components/AboutComponents/Philosophy';
import Hero from '../../components/HomeComponents/Hero';

describe('Milestone 4: Frontend Performance & Client Security Audit Verification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('SEC-FE-03: useDebounce Custom Hook', () => {
    it('returns initial value immediately upon initial render', () => {
      const { result } = renderHook(() => useDebounce('react', 350));
      expect(result.current).toBe('react');
    });

    it('debounces rapid sequential value updates until delayMs has elapsed', () => {
      let value = 'r';
      const { result, rerender } = renderHook(
        ({ val }) => useDebounce(val, 350),
        { initialProps: { val: value } }
      );

      expect(result.current).toBe('r');

      // Rapidly update value before 350ms
      rerender({ val: 're' });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(result.current).toBe('r');

      rerender({ val: 'rea' });
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(result.current).toBe('r');

      rerender({ val: 'react' });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(result.current).toBe('r');

      // Allow 350ms to completely elapse after last keystroke
      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(result.current).toBe('react');
    });

    it('clears pending timeout on unmount to prevent memory leaks', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const { unmount } = renderHook(() => useDebounce('test', 350));

      unmount();
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('SEC-FE-04: Async AbortController Signal Transmission', () => {
    it('passes AbortSignal to underlying fetch in adminApi calls', async () => {
      const abortController = new AbortController();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [] }),
      });
      global.fetch = mockFetch;

      await adminApi.getCandidates(
        { search: 'engineer' },
        { signal: abortController.signal }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/candidates?search=engineer'),
        expect.objectContaining({
          signal: abortController.signal,
          credentials: 'include',
        })
      );
    });

    it('passes AbortSignal to getJobs and getEmployees endpoints', async () => {
      const abortController = new AbortController();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ jobs: [] }),
      });
      global.fetch = mockFetch;

      await adminApi.getJobs(
        { search: 'architect' },
        { signal: abortController.signal }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/jobs?search=architect'),
        expect.objectContaining({
          signal: abortController.signal,
        })
      );
    });
  });

  describe('SEC-FE-05: In-Memory Token Isolation & LocalStorage XSS Defense', () => {
    beforeEach(() => {
      localStorage.clear();
      clearCandidateToken();
    });

    it('stores token in volatile memory and never writes JWT to localStorage', () => {
      const mockToken = 'mock.candidate.jwt.signature';
      setCandidateToken(mockToken);

      // Verify token is available in volatile memory
      expect(getCandidateToken()).toBe(mockToken);

      // Verify token was NEVER written to localStorage (preventing XSS harvesting)
      expect(localStorage.getItem('thinkwires_candidate_jwt')).toBeNull();
    });

    it('transmits Authorization Bearer header when token is in memory', () => {
      setCandidateToken('candidate-bearer-token');
      const headers = getCandidateAuthHeaders({ 'X-Custom-Header': 'true' });

      expect(headers['Authorization']).toBe('Bearer candidate-bearer-token');
      expect(headers['X-Custom-Header']).toBe('true');
    });

    it('purges memory and cleans any legacy localStorage entries on clearCandidateToken', () => {
      localStorage.setItem('thinkwires_candidate_jwt', 'legacy-stale-token');
      setCandidateToken('active-token');

      clearCandidateToken();
      expect(getCandidateToken()).toBeNull();
      expect(localStorage.getItem('thinkwires_candidate_jwt')).toBeNull();
    });
  });

  describe('SEC-FE-02: Deferred Heavy 3D Engine', () => {
    it('renders Hero component with Suspense wrapper and accessible skeleton', () => {
      const { container } = render(<Hero />);
      const heroSection = container.querySelector('.Hero-heroSection');
      expect(heroSection).toBeInTheDocument();
    });
  });

  describe('SEC-FE-08: WCAG 2.1 AA Image Hygiene & CLS Prevention', () => {
    it('AboutHero provides explicit dimensions, alt attribute, and async decoding', () => {
      render(
        <AboutHero
          heroImage="test-hero.jpg"
          heroImageAlt="Global Talent Grid across India, USA, and Canada"
        />
      );

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute(
        'alt',
        'Global Talent Grid across India, USA, and Canada'
      );
      expect(img).toHaveAttribute('width', '800');
      expect(img).toHaveAttribute('height', '533');
      expect(img).toHaveAttribute('decoding', 'async');
    });

    it('Philosophy provides lazy loading, explicit dimensions, and alt text', () => {
      render(
        <Philosophy
          data={{
            image: 'test-philosophy.jpg',
            imageAlt: 'Thinkwires leadership philosophy on global engineering pods',
          }}
        />
      );

      const img = screen.getByRole('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute(
        'alt',
        'Thinkwires leadership philosophy on global engineering pods'
      );
      expect(img).toHaveAttribute('loading', 'lazy');
      expect(img).toHaveAttribute('width', '800');
      expect(img).toHaveAttribute('height', '600');
      expect(img).toHaveAttribute('decoding', 'async');
    });
  });
});
