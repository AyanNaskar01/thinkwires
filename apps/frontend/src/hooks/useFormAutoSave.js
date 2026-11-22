import { useEffect, useRef, useCallback } from 'react';

/**
 * useFormAutoSave
 *
 * Silently preserves in-progress form state in sessionStorage to protect users
 * against dropped network connections, accidental browser refreshes, or page crashes.
 *
 * @param {string} storageKey Unique identifier in sessionStorage
 * @param {Object} formState Current form data state
 * @param {Function} setFormState State dispatcher
 * @param {number} debounceMs Write debounce window (default 400ms)
 * @returns {{ clearSavedDraft: () => void }} Helper to purge saved draft on successful submit
 */
export const useFormAutoSave = (
  storageKey,
  formState,
  setFormState,
  debounceMs = 400
) => {
  const isHydratedRef = useRef(false);
  const debounceTimerRef = useRef(null);

  // 1. Restore saved draft on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isHydratedRef.current) return;

    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          setFormState((prev) => ({
            ...prev,
            ...parsed,
          }));
        }
      }
    } catch {
      // Ignore corrupted sessionStorage parse
    } finally {
      isHydratedRef.current = true;
    }
  }, [storageKey, setFormState]);

  // 2. Debounce persisting current state to sessionStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isHydratedRef.current) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      try {
        if (formState && Object.keys(formState).length > 0) {
          window.sessionStorage.setItem(storageKey, JSON.stringify(formState));
        }
      } catch {
        // Storage quota exceeded or disabled
      }
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [storageKey, formState, debounceMs]);

  // 3. Callback to clear draft upon verified submission
  const clearSavedDraft = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Storage unavailable
    }
  }, [storageKey]);

  return { clearSavedDraft };
};

export default useFormAutoSave;
