import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import HelpButton from './HelpButton.tsx'
import { SUPPORT_EMAIL } from '@/lib/support.ts'

describe('HelpButton', () => {
  it('opens a support email with a subject', () => {
    render(<HelpButton />)

    expect(screen.getByRole('link', { name: 'Need help? Email support' })).toHaveAttribute(
      'href',
      `mailto:${SUPPORT_EMAIL}?subject=Support%20Request`,
    )
  })
})
