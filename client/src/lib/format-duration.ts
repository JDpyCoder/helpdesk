const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// A duration in seconds as its two largest units: "45s", "12m", "3h 20m", "2d 4h". null → "—".
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const total = Math.max(0, Math.round(seconds))
  if (total < MINUTE) return `${total}s`
  if (total < HOUR) return `${Math.floor(total / MINUTE)}m`
  const [big, bigUnit, small, smallUnit] =
    total < DAY
      ? [Math.floor(total / HOUR), 'h', Math.floor((total % HOUR) / MINUTE), 'm']
      : [Math.floor(total / DAY), 'd', Math.floor((total % DAY) / HOUR), 'h']
  return small > 0 ? `${big}${bigUnit} ${small}${smallUnit}` : `${big}${bigUnit}`
}
