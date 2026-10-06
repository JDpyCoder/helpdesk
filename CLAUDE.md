# Helpdesk

AI-powered support ticket management system. Support emails become tickets; Claude classifies them, writes summaries, and suggests replies for agents.

## Reference docs

- `project-scope.md` — features, ticket statuses/categories, user roles
- `tech-stack.md` — chosen technologies
- `implementation-plan.md` — phased task list; tick items off (`- [x]`) as they are completed

## Documentation lookups

Always use the Context7 MCP (`resolve-library-id` → `query-docs`) to fetch up-to-date documentation before writing or changing code that uses a library, framework, SDK, or CLI — e.g. Bun, Express, React, Vite, Tailwind CSS, React Router, Prisma, PostgreSQL, the Anthropic SDK, SendGrid/Mailgun. Do this even for well-known libraries; versions in this repo are recent (Express 5, React 19, Vite 8, Tailwind 4) and may differ from training data. Prefer Context7 over web search for library docs.

## Structure

Bun workspace monorepo with a single root `bun.lock`:

- `client/` — React 19 + TypeScript + Vite 8 + Tailwind CSS v4 (`@tailwindcss/vite`) + shadcn/ui. Dev server on :5173 proxies `/api` to the server.
  - `src/pages/` — route pages; `src/components/` — app components (`NavBar`, `ProtectedLayout`, `AdminRoute`); `src/components/ui/` — shadcn components; `src/lib/` — `auth-client.ts` (Better Auth), `utils.ts` (`cn`).
  - `components.json` — shadcn config. `src/index.css` holds the shadcn theme (CSS variables for light/dark) and is the only CSS file.
- `server/` — Express 5 + TypeScript, run directly by Bun (no build step). `src/app.ts` defines the app; `src/index.ts` starts it on `PORT` (default 3000).

## Commands

Run from the repo root:

- `bun install` — install all workspace dependencies
- `bun run dev` — start client and server together
- `bun run dev:client` / `bun run dev:server` — start one app
- `bun run build` — production build of the client
- `bun run typecheck` — typecheck server, then typecheck + build client

Run from `server/`:

- `bun run db:migrate` — apply Prisma migrations (`prisma migrate dev`)
- `bun run db:generate` — regenerate the Prisma client into `src/generated/prisma` (also runs on `bun install`)
- `bun run db:seed` — create the initial admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (idempotent)
- `bun run db:studio` — open Prisma Studio

Add dependencies from inside the workspace directory (e.g. `cd server && bun add <pkg>`).

## Authentication

Better Auth with email + password and database-backed sessions (PostgreSQL via Prisma).

- **Server config** — `server/src/auth.ts`. Uses the Prisma adapter, with no cookie cache, so every session check hits the `session` table and sign-out/revocation takes effect immediately. `trustedOrigins` is `CLIENT_ORIGIN`.
- **Sign-up is disabled** (`disableSignUp: true`). There is no public registration: the first admin comes from `bun run db:seed`, and admins will create agents (Phase 2). To create a user in code, use `auth.$context` → `internalAdapter.createUser` + `linkAccount` with a hashed password, as `src/seed.ts` does. `createUser` silently drops any field not registered in Better Auth's config — a new `User` column must be added to `user.additionalFields` or it falls back to its database default (this is how the first seeded admin ended up as `AGENT`).
- **Routes** — Better Auth handles everything under `/api/auth/*` (`app.all("/api/auth/*splat", toNodeHandler(auth))`). It must stay mounted **before** `express.json()`, because it reads the raw body.
- **Protecting API routes** — add the `requireAuth` middleware (`server/src/middleware/requireAuth.ts`). It returns 401 JSON when there is no session; otherwise it puts `user` and `session` on `res.locals`. Type the handler as `Response<unknown, AuthLocals>` to get them typed. `GET /api/me` is the example.
- **Schema** — `user`, `session`, `account`, `verification` tables in `server/prisma/schema.prisma` follow Better Auth's core schema. Passwords live in `account.password` (`providerId: "credential"`), not on `user`. If you change Better Auth config or plugins, update the Prisma schema to match and migrate.
- **Roles** — `User.role` is a Prisma enum `ADMIN | AGENT` (default `AGENT`). It is registered as a Better Auth `user.additionalFields` entry (`input: false`, so clients can't set it), so `session.user.role` / `res.locals.user.role` are available and typed. The client mirrors the field with `inferAdditionalFields` in `auth-client.ts` — keep the two in sync.
- **Admin-only pages (client)** — nest routes under `AdminRoute` (`client/src/components/AdminRoute.tsx`) inside `ProtectedLayout`; non-admins are redirected to `/`. This only hides UI — admin API routes still need a server-side role check.
- **Client** — `client/src/lib/auth-client.ts` exports `authClient` (`better-auth/react`) with no `baseURL`: requests are same-origin and Vite proxies `/api` to the server, so the session cookie works without CORS. Use `authClient.useSession()`, `authClient.signIn.email()`, and `authClient.signOut()`.
- **Route protection (client)** — wrap protected routes in `ProtectedLayout` (`client/src/components/ProtectedLayout.tsx`, see `App.tsx`). It shows a loading state while the session is pending, redirects to `/login` with no session, and renders the `NavBar` (user name + sign out, plus a "Users" link when `isAdmin`). `LoginPage` redirects to `/` if already signed in.
- **Env vars** (`server/.env`) — `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`), `BETTER_AUTH_URL` (server URL), `CLIENT_ORIGIN` (Vite dev origin; the server throws on startup without it), `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, optional `SEED_ADMIN_NAME`.

## Conventions

- Use Bun, not npm/yarn/pnpm.
- All API routes live under `/api`.
- Express 5 forwards rejected promises from async handlers to the error middleware — no try/catch wrappers needed just to call `next(err)`.
- Server imports use explicit `.ts` extensions (`import { app } from "./app.ts"`).
- Style the client with Tailwind utility classes; no separate CSS files per component.
- UI components come from shadcn/ui (Radix base, Nova preset, neutral). Add them from `client/` with `bunx --bun shadcn@latest add <component>`; they land in `src/components/ui/`. Use theme tokens (`bg-background`, `text-muted-foreground`, `text-destructive`, …) instead of raw palette colors. Import from `client/src` with the `@/` alias.
- `cn` comes from the `cn` npm package (shadcn's drop-in replacement for clsx + tailwind-merge), not a local clsx/twMerge helper.
- Build forms with react-hook-form + zod using shadcn's `Field` pattern: `<Controller>` → `<Field data-invalid>` → `FieldLabel` / `Input aria-invalid` / `FieldError`. Show server errors via `form.setError('root.serverError', …)` rendered in a destructive `Alert`. See `LoginPage.tsx`.
- `src/components/ui/` files are ours and may be customized. `input.tsx` has an autofill reset that hides Chrome's autofill background — re-apply it if the component is regenerated with `shadcn add input --overwrite`.
- Secrets go in `server/.env` (git-ignored); document new variables in `server/.env.example`.
