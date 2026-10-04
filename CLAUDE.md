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

- `client/` — React 19 + TypeScript + Vite 8 + Tailwind CSS v4 (`@tailwindcss/vite`). Dev server on :5173 proxies `/api` to the server.
- `server/` — Express 5 + TypeScript, run directly by Bun (no build step). `src/app.ts` defines the app; `src/index.ts` starts it on `PORT` (default 3000).

## Commands

Run from the repo root:

- `bun install` — install all workspace dependencies
- `bun run dev` — start client and server together
- `bun run dev:client` / `bun run dev:server` — start one app
- `bun run build` — production build of the client
- `bun run typecheck` — typecheck server, then typecheck + build client

Add dependencies from inside the workspace directory (e.g. `cd server && bun add <pkg>`).

## Conventions

- Use Bun, not npm/yarn/pnpm.
- All API routes live under `/api`.
- Express 5 forwards rejected promises from async handlers to the error middleware — no try/catch wrappers needed just to call `next(err)`.
- Server imports use explicit `.ts` extensions (`import { app } from "./app.ts"`).
- Style the client with Tailwind utility classes; no separate CSS files per component.
- Secrets go in `server/.env` (git-ignored); document new variables in `server/.env.example`.
