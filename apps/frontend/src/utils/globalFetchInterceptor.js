let errorNotificationHandler = null;

export const registerErrorNotifier = (handler) => {
  errorNotificationHandler = handler;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resilient fetch wrapper with transparent exponential-backoff retry
 * for idempotent requests on low-bandwidth / unstable connections.
 */
export const secureFetch = async (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  const isIdempotent = method === 'GET' || method === 'HEAD';

  // Configurable retries: default 2 retries for GET/HEAD, 0 for mutating calls
  const maxRetries = typeof options.retries === 'number' ? options.retries : isIdempotent ? 2 : 0;
  const initialDelay = options.retryDelayMs || 300;

  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      // If caller provided an AbortSignal that already aborted, fail fast
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const response = await fetch(url, options);

      // Check for transient 5xx gateway/proxy errors that warrant retry
      const isTransientServerError =
        response.status === 502 || response.status === 503 || response.status === 504;

      if (!response.ok) {
        // Retry transient server errors on idempotent methods if attempts remain
        if (isTransientServerError && isIdempotent && attempt < maxRetries && !options.signal?.aborted) {
          attempt++;
          const jitter = Math.random() * 100;
          const delay = initialDelay * Math.pow(2, attempt - 1) + jitter;
          await wait(delay);
          continue;
        }

        let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
        let errorBody = null;

        try {
          errorBody = await response.clone().json();
          if (errorBody && errorBody.error) {
            errorMessage =
              typeof errorBody.error === 'string'
                ? errorBody.error
                : JSON.stringify(errorBody.error);
          } else if (errorBody && errorBody.message) {
            errorMessage = errorBody.message;
          }
        } catch {
          // Non-JSON response body
        }

        if (response.status === 401) {
          if (errorNotificationHandler) {
            errorNotificationHandler({
              type: 'warning',
              title: 'Session Expired',
              message: 'Your authenticated session has ended. Please log in again to continue.',
            });
          }
        } else if (response.status === 403) {
          if (errorNotificationHandler) {
            errorNotificationHandler({
              type: 'error',
              title: 'Access Denied',
              message:
                errorMessage ||
                'You do not have administrative permission for this action.',
            });
          }
        } else if (response.status === 429) {
          if (errorNotificationHandler) {
            errorNotificationHandler({
              type: 'warning',
              title: 'Rate Limit Reached',
              message:
                'Too many requests dispatched in a short window. Please wait a moment before trying again.',
            });
          }
        } else if (response.status >= 500) {
          if (errorNotificationHandler) {
            errorNotificationHandler({
              type: 'error',
              title: 'Server Error',
              message:
                'Thinkwires core services encountered an internal issue. Our engineering team has been notified.',
            });
          }
        }

        const error = new Error(errorMessage);
        error.status = response.status;
        error.response = response;
        error.data = errorBody;
        throw error;
      }

      return response;
    } catch (err) {
      // Never retry on user AbortSignal
      if (err.name === 'AbortError') {
        throw err;
      }

      // Check if it's a network-level dropout (e.g. TypeError: Failed to fetch)
      const isNetworkDrop =
        err.name === 'TypeError' &&
        (err.message?.toLowerCase().includes('fetch') ||
          err.message?.toLowerCase().includes('network'));

      if (isNetworkDrop && isIdempotent && attempt < maxRetries && !options.signal?.aborted) {
        attempt++;
        const jitter = Math.random() * 100;
        const delay = initialDelay * Math.pow(2, attempt - 1) + jitter;
        await wait(delay);
        continue;
      }

      // All retries exhausted or non-retriable error
      if (isNetworkDrop) {
        if (errorNotificationHandler) {
          errorNotificationHandler({
            type: 'error',
            title: 'Connection Offline',
            message:
              'Unable to reach Thinkwires API server. Please check your network connection.',
          });
        }
      }
      throw err;
    }
  }
};

export default secureFetch;
