import { describe, expect, it } from 'vitest'
import { formatDuration } from './format-duration.ts'

describe('formatDuration', () => {
  it.each([
    [null, '—'],
    [0, '0s'],
    [45.4, '45s'],
    [60, '1m'],
    [12 * 60 + 59, '12m'],
    [3600, '1h'],
    [3 * 3600 + 20 * 60, '3h 20m'],
    [86400, '1d'],
    [2 * 86400 + 4 * 3600 + 59 * 60, '2d 4h'],
  ])('formats %s as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })
})
