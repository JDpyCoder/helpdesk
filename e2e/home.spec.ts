import { expect, failApiRoute, signIn, test } from './fixtures'

// Server errors (5xx) are retried 3 times by the shared QueryClient, with TanStack Query's
// default backoff of 1s + 2s + 4s, so the error message appears ~7s after the first failure.
// The error assertions wait up to 15s for that instead of faking timers, so the real retry
// policy runs. The request count then confirms exactly 1 attempt + 3 retries happened.
const RETRIES_EXHAUSTED_TIMEOUT = 15_000

test.describe('Home page', () => {
  test('shows that the server is healthy', async ({ page, admin }) => {
    await signIn(page, admin)

    // The card title is a plain div (no heading role), unlike the Users page title
    await expect(page.getByText('Home', { exact: true })).toBeVisible()
    await expect(page.getByText(/^Server is healthy — last checked at .+\.$/)).toBeVisible()
    await expect(page.getByText('Could not reach the server')).toHaveCount(0)
  })

  test('shows an HTTP 500 error after retrying the health check', async ({ page, admin }) => {
    test.slow() // waits out the ~7s retry backoff
    const health = await failApiRoute(page, '/api/health', 500)

    await signIn(page, admin)

    // While retries are pending the page keeps showing the loading state, not the error
    await expect.poll(health.calls).toBeGreaterThanOrEqual(1)
    await expect(page.getByRole('status', { name: 'Checking server health' })).toBeVisible()

    await expect(page.getByText('Could not reach the server (HTTP 500).')).toBeVisible({
      timeout: RETRIES_EXHAUSTED_TIMEOUT,
    })
    await expect(page.getByText(/Server is healthy/)).toHaveCount(0)
    expect(health.calls()).toBe(4)
  })
})
