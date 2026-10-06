import { createAuthClient } from 'better-auth/react'

// No baseURL: the client is served from the same origin and Vite proxies /api
// to the server, so the default /api/auth base path and session cookie just work
export const authClient = createAuthClient()
