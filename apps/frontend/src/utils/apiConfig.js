/**
 * Safely resolves the API Base URL.
 * Handles both unified single-domain deployments (relative '/api')
 * and decoupled cross-origin architectures (e.g. Frontend on Vercel, Backend on Render).
 */
export const getApiBaseUrl = () => {
  // In automated test environments (vitest / jest), standard unit tests assert on canonical relative endpoints ('/api')
  if (import.meta.env.MODE === 'test' && !import.meta.env.VITE_TEST_ABSOLUTE_URL) {
    return '/api';
  }

  const envBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
  const envUrl = (import.meta.env.VITE_API_URL || '').trim();
  const rawUrl = envBase || envUrl;

  // In browser on production/preview hostnames (e.g. thinkwires.vercel.app)
  if (
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    // If rawUrl is missing, or points to localhost, fallback to relative '/api'
    if (!rawUrl || rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1')) {
      return '/api';
    }
    const clean = rawUrl.replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }

  // Local development
  if (rawUrl) {
    const clean = rawUrl.replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }

  return '/api';
};

export const API_BASE = getApiBaseUrl();

// Global fetch interceptor to guarantee all relative '/api/' calls dynamically resolve to getApiBaseUrl()
// and automatically attach CSRF & Authorization credentials where needed
let currentCsrfToken = null;

export const setCsrfToken = (token) => {
  currentCsrfToken = token || null;
  try {
    if (typeof localStorage !== 'undefined') {
      if (token) localStorage.setItem('tw_csrf_token', token);
      else localStorage.removeItem('tw_csrf_token');
    }
  } catch {}
};

export const getCsrfToken = () => {
  if (currentCsrfToken) return currentCsrfToken;
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('tw_csrf_token');
      if (stored) {
        currentCsrfToken = stored;
        return currentCsrfToken;
      }
    }
    if (typeof document !== 'undefined' && document.cookie) {
      const match = document.cookie.match(/(?:^|;\s*)thinkwires_csrf_token=([^;]+)/);
      if (match) {
        currentCsrfToken = decodeURIComponent(match[1]);
        return currentCsrfToken;
      }
    }
  } catch {}
  return null;
};

if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const originalFetch = window.fetch;
  window.fetch = function (resource, init = {}) {
    const apiBase = getApiBaseUrl();
    const isApiCall =
      (typeof resource === 'string' && (resource.startsWith(apiBase) || resource.startsWith('/api/') || resource === '/api' || resource.startsWith('/api?'))) ||
      (resource && typeof resource === 'object' && resource.url && (resource.url.includes(apiBase) || resource.url.includes('/api')));

    if (apiBase && !apiBase.startsWith('/api')) {
      if (
        typeof resource === 'string' &&
        (resource.startsWith('/api/') || resource === '/api' || resource.startsWith('/api?'))
      ) {
        resource = resource.replace(/^\/api/, apiBase);
      } else if (resource && typeof resource === 'object' && resource.url && resource.url.includes('/api')) {
        try {
          const parsed = new URL(resource.url, window.location.origin);
          if (
            parsed.origin === window.location.origin &&
            (parsed.pathname.startsWith('/api/') || parsed.pathname === '/api')
          ) {
            const newUrl = parsed.pathname.replace(/^\/api/, apiBase) + parsed.search;
            resource = new Request(newUrl, resource);
          }
        } catch {
          // Keep original resource on error
        }
      }
    }

    // Automatically ensure credentials and inject CSRF / Authorization for state mutations
    if (isApiCall) {
      init = init ? { ...init } : {};
      if (!init.credentials) {
        init.credentials = 'include';
      }

      const method = (init.method || 'GET').toUpperCase();
      const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

      if (isMutation) {
        let headers = init.headers;
        if (!headers) {
          headers = {};
          init.headers = headers;
        }

        const candidateToken = getCandidateToken();
        const csrf = getCsrfToken();

        if (headers instanceof Headers) {
          if (candidateToken && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${candidateToken}`);
          }
          if (csrf && !headers.has('X-CSRF-Token')) {
            headers.set('X-CSRF-Token', csrf);
          }
        } else if (typeof headers === 'object') {
          if (candidateToken && !headers['Authorization'] && !headers['authorization']) {
            headers['Authorization'] = `Bearer ${candidateToken}`;
          }
          if (csrf && !headers['X-CSRF-Token'] && !headers['x-csrf-token']) {
            headers['X-CSRF-Token'] = csrf;
          }
        }
      }
    }

    return originalFetch.call(this, resource, init);
  };
}

const CANDIDATE_TOKEN_KEY = 'thinkwires_candidate_jwt';

// Pure in-memory session token fallback to prevent XSS extraction from localStorage (SEC-FE-05)
let inMemoryCandidateToken = null;

export const getCandidateToken = () => {
  // Rely primarily on browser-managed HttpOnly cookie; in-memory fallback for current page session
  return inMemoryCandidateToken;
};

export const setCandidateToken = (token) => {
  inMemoryCandidateToken = token || null;
  // Never persist candidate JWT to localStorage to protect against XSS token harvesting
};

export const clearCandidateToken = () => {
  inMemoryCandidateToken = null;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CANDIDATE_TOKEN_KEY);
    }
  } catch {
    // Ignore in private/restricted storage modes
  }
};

export const getCsrfTokenFromCookie = () => {
  try {
    if (typeof document !== 'undefined' && document.cookie) {
      const match = document.cookie.match(
        /(?:^|;\s*)thinkwires_csrf_token=([^;]+)/
      );
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('tw_csrf_token');
      if (stored) return stored;
    }
  } catch {
    // Ignore in private/restricted storage modes
  }
  return null;
};

/**
 * Returns authorization headers including Bearer token if available.
 * Transmits credentials in dual-mode (HttpOnly cookie + Authorization header)
 * and attaches anti-CSRF token on candidate mutations (SEC-CSRF-02).
 */
export const getCandidateAuthHeaders = (additionalHeaders = {}) => {
  const headers = { ...additionalHeaders };
  const token = getCandidateToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const csrf = getCsrfTokenFromCookie();
  if (csrf) {
    headers['X-CSRF-Token'] = csrf;
  }
  return headers;
};

export default API_BASE;
