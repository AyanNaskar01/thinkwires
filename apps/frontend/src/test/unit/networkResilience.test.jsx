import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, act, waitFor } from '@testing-library/react';
import {
  checkLowBandwidthConnection,
  subscribeToNetworkChange,
} from '../../utils/networkCapabilities';
import { secureFetch } from '../../utils/globalFetchInterceptor';
import { useFormAutoSave } from '../../hooks/useFormAutoSave';

describe('Network Resilience & Low-Bandwidth Transport Engine', () => {
  const originalNavigator = { ...global.navigator };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkLowBandwidthConnection', () => {
    it('detects 2G cellular network as low bandwidth', () => {
      Object.defineProperty(global.navigator, 'connection', {
        value: { effectiveType: '2g', saveData: false },
        configurable: true,
      });

      expect(checkLowBandwidthConnection()).toBe(true);
    });

    it('detects Data Saver mode as low bandwidth', () => {
      Object.defineProperty(global.navigator, 'connection', {
        value: { effectiveType: '4g', saveData: true },
        configurable: true,
      });

      expect(checkLowBandwidthConnection()).toBe(true);
    });

    it('returns false for high-speed 4G connection without Data Saver', () => {
      Object.defineProperty(global.navigator, 'connection', {
        value: { effectiveType: '4g', saveData: false, downlink: 10, rtt: 50 },
        configurable: true,
      });

      expect(checkLowBandwidthConnection()).toBe(false);
    });
  });

  describe('secureFetch Exponential-Backoff Retry', () => {
    it('transparently retries transient network errors for idempotent GET requests', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new TypeError('Failed to fetch');
        }
        return new Response(JSON.stringify({ success: true, data: 'recovered' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const origFetch = global.fetch;
      global.fetch = mockFetch;

      try {
        const res = await secureFetch('/api/test-data', {
          method: 'GET',
          retries: 2,
          retryDelayMs: 20, // Fast delay in unit tests
        });

        expect(res.status).toBe(200);
        expect(callCount).toBe(2); // Failed once, recovered on 2nd attempt
      } finally {
        global.fetch = origFetch;
      }
    });

    it('does not retry mutating POST requests to prevent duplicate transactions', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        throw new TypeError('Network drop');
      });

      const origFetch = global.fetch;
      global.fetch = mockFetch;

      try {
        await expect(
          secureFetch('/api/submit', {
            method: 'POST',
            body: JSON.stringify({ role: 'Engineer' }),
          })
        ).rejects.toThrow();

        expect(callCount).toBe(1); // Never retried
      } finally {
        global.fetch = origFetch;
      }
    });

    it('respects AbortController and immediately halts retry loop on user cancel', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        secureFetch('/api/cancel-test', {
          method: 'GET',
          signal: controller.signal,
          retries: 2,
        })
      ).rejects.toThrow(/Aborted|AbortError/);
    });
  });

  describe('useFormAutoSave Hook', () => {
    const TestComponent = ({ storageKey }) => {
      const [form, setForm] = useState({ name: '', role: '' });
      const { clearSavedDraft } = useFormAutoSave(storageKey, form, setForm, 50);

      return (
        <div>
          <span data-testid="name-val">{form.name}</span>
          <span data-testid="role-val">{form.role}</span>
          <button
            data-testid="update-btn"
            onClick={() => setForm({ name: 'Alice', role: 'Architect' })}
          >
            Update
          </button>
          <button data-testid="clear-btn" onClick={clearSavedDraft}>
            Clear
          </button>
        </div>
      );
    };

    it('restores saved draft values from sessionStorage on mount', async () => {
      sessionStorage.setItem(
        'tw_test_form',
        JSON.stringify({ name: 'Pre-filled Bob', role: 'DevOps' })
      );

      const { getByTestId } = render(<TestComponent storageKey="tw_test_form" />);

      await waitFor(() => {
        expect(getByTestId('name-val').textContent).toBe('Pre-filled Bob');
        expect(getByTestId('role-val').textContent).toBe('DevOps');
      });
    });

    it('persists changes to sessionStorage and purges on clear', async () => {
      const { getByTestId } = render(<TestComponent storageKey="tw_test_form_2" />);

      act(() => {
        getByTestId('update-btn').click();
      });

      await waitFor(() => {
        const stored = sessionStorage.getItem('tw_test_form_2');
        expect(stored).toContain('Alice');
        expect(stored).toContain('Architect');
      });

      act(() => {
        getByTestId('clear-btn').click();
      });

      expect(sessionStorage.getItem('tw_test_form_2')).toBeNull();
    });
  });
});
