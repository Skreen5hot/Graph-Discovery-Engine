/**
 * useDebounce — 150ms debounce for search fields
 * GDE-UI-SPEC-v2.1.md §6.3, §7.3.2, §13.7
 */

import { useState, useEffect } from "react";

export function useDebounce<T>(value: T, delay: number = 150): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
