import { useState, useEffect } from 'react';

/**
 * useDebounce hook (SEC-FE-03)
 * Delays updating the debounced value until after delayMs has elapsed
 * since the last time the value changed. Eliminates network query spamming.
 *
 * @param {*} value The value to debounce
 * @param {number} delayMs Delay in milliseconds (default: 350ms)
 * @returns {*} The debounced value
 */
export function useDebounce(value, delayMs = 350) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

export default useDebounce;
