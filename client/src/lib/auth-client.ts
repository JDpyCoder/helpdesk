import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'
import { Role } from './roles.ts'

// No baseURL: the client is served from the same origin and Vite proxies /api
// to the server, so the default /api/auth base path and session cookie just work
export const authClient = createAuthClient({
  // Keep in sync with user.additionalFields in server/src/auth.ts
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: [Role.ADMIN, Role.AGENT], required: false, input: false },
      },
    }),
  ],
})
