import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY } from '@/lib/theme.ts'
import { renderWithQuery } from '@/test/render.tsx'
import ThemeToggle from './ThemeToggle.tsx'

afterEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

function button(name: string) {
  return screen.getByRole('button', { name })
}

describe('ThemeToggle', () => {
  it('follows the system theme until one is chosen', () => {
    renderWithQuery(<ThemeToggle />)

    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument()
    expect(button('System theme')).toHaveAttribute('aria-pressed', 'true')
    expect(button('Dark theme')).toHaveAttribute('aria-pressed', 'false')
    // jsdom has no matchMedia, so the system theme counts as light
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('switches to dark and remembers the choice', () => {
    renderWithQuery(<ThemeToggle />)

    fireEvent.click(button('Dark theme'))

    expect(document.documentElement).toHaveClass('dark')
    expect(button('Dark theme')).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('switches back to light', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    renderWithQuery(<ThemeToggle />)
    expect(document.documentElement).toHaveClass('dark')

    fireEvent.click(button('Light theme'))

    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('ignores an unknown stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    renderWithQuery(<ThemeToggle />)

    expect(button('System theme')).toHaveAttribute('aria-pressed', 'true')
  })
})
