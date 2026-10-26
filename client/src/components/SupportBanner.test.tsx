import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SupportBanner from './SupportBanner.tsx'
import { SUPPORT_BANNER_STORAGE_KEY, SUPPORT_EMAIL } from '@/lib/support.ts'

afterEach(() => {
  localStorage.clear()
})

describe('SupportBanner', () => {
  it('shows the support address as a mailto link', () => {
    render(<SupportBanner />)

    const notice = screen.getByRole('complementary', { name: 'Support notice' })
    expect(notice).toHaveTextContent(
      `Have a query? Email us at ${SUPPORT_EMAIL} and a ticket will be raised automatically.`,
    )
    expect(screen.getByRole('link', { name: SUPPORT_EMAIL })).toHaveAttribute('href', `mailto:${SUPPORT_EMAIL}`)
  })

  it('hides and remembers the dismissal when closed', () => {
    render(<SupportBanner />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss support notice' }))

    expect(screen.queryByRole('complementary', { name: 'Support notice' })).not.toBeInTheDocument()
    expect(localStorage.getItem(SUPPORT_BANNER_STORAGE_KEY)).toBe('true')
  })

  it('stays hidden once dismissed', () => {
    localStorage.setItem(SUPPORT_BANNER_STORAGE_KEY, 'true')
    render(<SupportBanner />)

    expect(screen.queryByRole('complementary', { name: 'Support notice' })).not.toBeInTheDocument()
  })
})
