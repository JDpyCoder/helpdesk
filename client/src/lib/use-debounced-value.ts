import { useEffect, useState } from 'react'

// Returns `value` once it has stopped changing for `delayMs`, e.g. to search after the user pauses typing
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
