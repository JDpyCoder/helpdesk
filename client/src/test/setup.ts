import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom has no ResizeObserver; Radix tooltips/popovers use it to measure their content.
// A no-op is enough because jsdom has no layout to observe anyway.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Vitest globals are off, so Testing Library can't register its own cleanup
afterEach(() => {
  cleanup()
})
