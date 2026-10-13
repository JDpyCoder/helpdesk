# Helpdesk

AI-powered support ticket management system. Support emails become tickets; Claude classifies them, writes summaries, and suggests replies for agents.

## Reference docs

- `project-scope.md` — features, ticket statuses/categories, user roles
- `tech-stack.md` — chosen technologies
- `implementation-plan.md` — phased task list; tick items off (`- [x]`) as they are completed

## Documentation lookups

Always use the Context7 MCP (`resolve-library-id` → `query-docs`) to fetch up-to-date documentation before writing or changing code that uses a library, framework, SDK, or CLI — e.g. Bun, Express, React, Vite, Tailwind CSS, React Router, TanStack Query, axios, Prisma, PostgreSQL, the Anthropic SDK, SendGrid/Mailgun. Do this even for well-known libraries; versions in this repo are recent (Express 5, React 19, Vite 8, Tailwind 4) and may differ from training data. Prefer Context7 over web search for library docs.

## Structure

Bun workspace monorepo with a single root `bun.lock`:

- `client/` — React 19 + TypeScript + Vite 8 + Tailwind CSS v4 (`@tailwindcss/vite`) + shadcn/ui. Dev server on :5173 proxies `/api` to the server.
  - `src/pages/` — route pages; `src/components/` — app components (`NavBar`, `ProtectedLayout`, `AdminRoute`); `src/components/ui/` — shadcn components; `src/lib/` — `auth-client.ts` (Better Auth), `query-client.ts` (TanStack Query client + `errorMessage`), `utils.ts` (`cn`).
  - `components.json` — shadcn config. `src/index.css` holds the shadcn theme (CSS variables for light/dark) and is the only CSS file.
- `core/` — code shared by client and server, published to both as the workspace package `core` (`"core": "workspace:*"`). No build step: `package.json` `exports` points at `src/index.ts`, and Vite and Bun both consume the TypeScript source. Holds zod schemas in `src/schemas/<resource>.ts`, re-exported from `src/index.ts`. Must stay runtime-agnostic (no Node/Bun/DOM APIs, no Prisma, no React); its only dependency is `zod`.
- `server/` — Express 5 + TypeScript, run directly by Bun (no build step). `src/app.ts` defines the app (middleware, auth, `/api/me`, 404/error handlers) and mounts feature routers from `src/routes/` — one `express.Router()` per resource, e.g. `routes/users.ts` mounted at `/api/users`; put new endpoints for a resource in its router, not in `app.ts`. `src/index.ts` starts it on `PORT` (default 3000).

## Commands

Run from the repo root:

- `bun install` — install all workspace dependencies
- `bun run dev` — start client and server together
- `bun run dev:client` / `bun run dev:server` — start one app
- `bun run build` — production build of the client
- `bun run typecheck` — typecheck the e2e files (root `tsconfig.json`), then `core`, then the server, then typecheck + build the client

- `bun run test` — client component tests, run once (see "Component tests" below)
- `bun run test:e2e` — Playwright end-to-end tests (`test:e2e:ui` for UI mode, `test:e2e:report` for the last HTML report)

Run from `server/`:

- `bun run db:migrate` — apply Prisma migrations (`prisma migrate dev`)
- `bun run db:generate` — regenerate the Prisma client into `src/generated/prisma` (also runs on `bun install`)
- `bun run db:seed` — create the initial admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (idempotent)
- `bun run db:studio` — open Prisma Studio

Add dependencies from inside the workspace directory (e.g. `cd server && bun add <pkg>`). Keep `zod` on the same version range in `core`, `client` and `server` so there is a single copy.

## Authentication

Better Auth with email + password and database-backed sessions (PostgreSQL via Prisma).

- **Server config** — `server/src/auth.ts`. Uses the Prisma adapter, with no cookie cache, so every session check hits the `session` table and sign-out/revocation takes effect immediately. `trustedOrigins` is `CLIENT_ORIGIN`.
- **Sign-up is disabled** (`disableSignUp: true`). There is no public registration: the first admin comes from `bun run db:seed`, and admins will create agents (Phase 2). To create a user in code, use `auth.$context` → `internalAdapter.createUser` + `linkAccount` with a hashed password, as `src/seed.ts` does. `createUser` silently drops any field not registered in Better Auth's config — a new `User` column must be added to `user.additionalFields` or it falls back to its database default (this is how the first seeded admin ended up as `AGENT`).
- **Routes** — Better Auth handles everything under `/api/auth/*` (`app.all("/api/auth/*splat", toNodeHandler(auth))`). It must stay mounted **before** `express.json()`, because it reads the raw body.
- **Protecting API routes** — add the `requireAuth` middleware (`server/src/middleware/requireAuth.ts`). It returns 401 JSON when there is no session; otherwise it puts `user` and `session` on `res.locals`. Type the handler as `Response<unknown, AuthLocals>` to get them typed. `GET /api/me` is the example.
- **Schema** — `user`, `session`, `account`, `verification` tables in `server/prisma/schema.prisma` follow Better Auth's core schema. Passwords live in `account.password` (`providerId: "credential"`), not on `user`. If you change Better Auth config or plugins, update the Prisma schema to match and migrate.
- **Roles** — `User.role` is a Prisma enum `ADMIN | AGENT` (default `AGENT`). It is registered as a Better Auth `user.additionalFields` entry (`input: false`, so clients can't set it), so `session.user.role` / `res.locals.user.role` are available and typed. The client mirrors the field with `inferAdditionalFields` in `auth-client.ts` — keep the two in sync.
- **Role enum — always use `Role`, never role strings.** The database enum is the Prisma `Role` in `schema.prisma`. `core/src/schemas/users.ts` mirrors it as a zod enum: `roleSchema = z.enum([...])`, plus `Role = roleSchema.enum` (values) and `type Role` (the union). Both have the same shape, `Role.ADMIN` and `Role`. Keep the two lists in step.
  - **Import:** server — `import { Role } from "../generated/prisma/enums.ts"` (relative to the file); client — `import { Role } from 'core'`. Never import the server's generated files from client or `core` code, and never define another copy or a `'ADMIN' | 'AGENT'` union.
  - **Values:** write `Role.ADMIN` / `Role.AGENT`, never `"ADMIN"` / `'AGENT'` — in comparisons (`user.role === Role.ADMIN`), defaults, Prisma data/where clauses and API payloads. Check admin access with `role === Role.ADMIN` (as `requireAdmin.ts`, `AdminRoute.tsx`, `ProtectedLayout.tsx` do), not `role !== Role.AGENT`, so a future role isn't treated as an admin by accident.
  - **Types:** annotate with the enum's type, `role: Role` (e.g. `User` in `UsersTable.tsx`), not `string`.
  - **Lists and validation:** when every role is needed (a zod schema, a select's options, Better Auth's `additionalFields` type), derive it from the enum — `roleSchema` itself, `roleSchema.options`, `Object.values(Role)` — rather than listing values by hand. For per-role labels or styles in new code, use a `Record<Role, …>` map so adding a role becomes a type error until every map handles it.
  - **Setting roles:** pass the role explicitly when creating users (`role: Role.AGENT` in `POST /api/users` in `routes/users.ts`, `Role.ADMIN` in `seed.ts`). Role is server-owned: never accept it from a request body (it isn't a field of `createUserSchema`/`updateUserSchema`, and Better Auth's field is `input: false`).
  - **Adding or renaming a role:** change the Prisma enum, run `bun run db:migrate` then `bun run db:generate` (regenerates `enums.ts`), then update `roleSchema` in `core/src/schemas/users.ts`, the hand-written role lists in `auth.ts` (`user.additionalFields.role.type`) and `client/src/lib/auth-client.ts` (`inferAdditionalFields`), and every display label (e.g. the badge in `UsersTable.tsx`). Run `bun run typecheck` to find the rest.
  - **Tests** (component and e2e) may use string literals (`role: 'AGENT'`), since they assert on the API's JSON. `e2e/fixtures.ts` keeps its own `Role` union for that reason.
- **Admin-only pages (client)** — nest routes under `AdminRoute` (`client/src/components/AdminRoute.tsx`) inside `ProtectedLayout`; non-admins are redirected to `/`. This only hides UI — admin API routes still need a server-side role check: chain `requireAuth, requireAdmin` (`server/src/middleware/requireAdmin.ts`, returns 403 JSON for non-admins) — per route, or once with `router.use(requireAuth, requireAdmin)` for an admin-only router. `server/src/routes/users.ts` is the example.
- **Client** — `client/src/lib/auth-client.ts` exports `authClient` (`better-auth/react`) with no `baseURL`: requests are same-origin and Vite proxies `/api` to the server, so the session cookie works without CORS. Use `authClient.useSession()`, `authClient.signIn.email()`, and `authClient.signOut()`.
- **Route protection (client)** — wrap protected routes in `ProtectedLayout` (`client/src/components/ProtectedLayout.tsx`, see `App.tsx`). It shows a loading state while the session is pending, redirects to `/login` with no session, and renders the `NavBar` (user name + sign out, plus a "Users" link when `isAdmin`). `LoginPage` redirects to `/` if already signed in.
- **Soft-deleted users** — users are never hard-deleted. `DELETE /api/users/:id` (`routes/users.ts`, agents only — admins get 403) sets `User.deletedAt`, rewrites the email to `deleted+<id>+<original>` so the address can be reused, and deletes the user's sessions in one transaction. Any query for active users must filter `deletedAt: null` (the list, and the existence checks in `PATCH`/`DELETE`, which return 404 for deleted users). `databaseHooks.session.create.before` in `auth.ts` refuses a session for a deleted user. `deletedAt` is not a Better Auth `additionalFields` entry, so read and write it through Prisma, not `internalAdapter`.
- **Rate limiting** — on only when `NODE_ENV=production` (`rateLimit.enabled` in `auth.ts`), with a tighter `/sign-in/email` rule (5 per 60s). Dev and e2e run without it. Production deploys **must** set `NODE_ENV=production`, or sign-in brute-force protection is silently off.
- **Env vars** (`server/.env`) — `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`), `BETTER_AUTH_URL` (server URL), `CLIENT_ORIGIN` (Vite dev origin; the server throws on startup without it), `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, optional `SEED_ADMIN_NAME`.

## Inbound email → tickets

There is no email provider yet. Support mail enters through a provider-agnostic webhook, and whatever receives the mail (a provider's inbound route, a forwarding script, a test) normalises it to JSON and POSTs it.

- **Endpoint** — `POST /api/inbound-email` (`server/src/routes/inbound-email.ts`). It is not session-authenticated. `requireInboundSecret` (`middleware/requireInboundSecret.ts`) requires `Authorization: Bearer $INBOUND_EMAIL_SECRET` (constant-time compare → 401), and answers 503 when the variable is unset. It is mounted in `app.ts` **before** the global `express.json()`, with its own 1mb parser that runs after the secret check.
- **Payload** — `inboundEmailSchema` in `core/src/schemas/inbound-email.ts`: `from { email, name }` (both required), `subject` (a blank one becomes `"(no subject)"`), `text`, plus optional `messageId`, `inReplyTo`, `references[]` and `receivedAt` (ISO datetime). Invalid → 400 `{ error, fieldErrors }`.
- **Behaviour**:
  - A `messageId` that is already stored → 200 `{ ticketId, duplicate: true }`. Webhooks retry, and a `P2002` race is handled the same way.
  - A reply whose `inReplyTo`/`references` match a stored `TicketMessage.messageId` is appended to that ticket and sets it back to `OPEN` → 200 `{ ticketId, created: false }`.
  - Anything else creates a `Ticket` with its first `TicketMessage` → 201 `{ ticketId, created: true }`.
- **Models** — `Ticket` (auto-increment `Int` id, required `fromName`, `TicketStatus` OPEN/RESOLVED/CLOSED, optional `TicketCategory?` with no default — set later by AI classification, `assignedTo` → `User`) and `TicketMessage` (body plus email headers) in `schema.prisma`. On the server, use the generated enums (`TicketStatus.OPEN`), as with `Role`. `core/src/schemas/tickets.ts` mirrors them the same way `Role` is mirrored: `ticketStatusSchema`/`ticketCategorySchema` (`z.enum([...])`), plus `TicketStatus`/`TicketCategory` as both values and types. The client imports those from `"core"`. Keep them in step with `schema.prisma` when an enum changes. The inferred types are the same string unions Prisma uses, so a value that one side doesn't have fails the typecheck where it's passed across. It also has `listTicketsQuerySchema` (status/category filters, `sortBy`, `order`) and `updateTicketSchema` (`status`, `category`, `assignedToId`; null clears; at least one field required) for the Phase 4 ticket endpoints.
- **Ticket list** — `GET /api/tickets` (`server/src/routes/tickets.ts`, `requireAuth` — agents and admins) validates the query with `listTicketsQuerySchema` and returns `{ tickets }` with list columns only (no message bodies), sorted newest first by default with `id` as tie-breaker. The client page is `/tickets` (`TicketsPage` → `TicketsTable`, linked from the `NavBar` for every signed-in user); it shows tickets in the order the server returns them.
- **Env** — `INBOUND_EMAIL_SECRET` in `server/.env` and `server/.env.test` (generate with `openssl rand -base64 32`).

## Component tests

Vitest + React Testing Library in jsdom, for the client only. Config is the `test` block in `client/vite.config.ts`; `client/src/test/setup.ts` loads the jest-dom matchers and runs `cleanup` after each test. Reference spec: `client/src/pages/UsersPage.test.tsx`.

**Running**
- `bun run test` (root) or `bun run test` (from `client/`) — run all once. Run this after changing a component that has tests, and before finishing client work.
- From `client/`: `bun run test:watch` reruns on save; `bun run test:ui` opens the Vitest UI (open the tokenized URL it prints). Both need an interactive terminal; in a non-interactive shell Vitest runs once and exits.
- One file or test: `bunx vitest run src/pages/UsersPage.test.tsx` or add `-t "<test name>"`.
- `bun run typecheck` also typechecks the test files (`tsc -b` includes `src/`).

**What goes where — default to component tests**
- Component tests are the main test layer. Every new or changed client component gets them: rendering and states (loading, empty, error, data), conditional UI, form validation, what is sent to the API and how its responses and errors are shown. The API is mocked. They're fast, so cover cases thoroughly here.
- E2E (Playwright, `e2e/`) only when a component test can't catch the risk, because it depends on the real browser, server and database working together: sign-in/sign-out and session handling, server-side role checks and access control, critical end-to-end journeys (e.g. an email becoming a ticket an agent can see), and server behaviour such as validation, persistence or ordering that no component test can see. Keep it to a few tests per feature, not exhaustive matrices. Don't duplicate component-test coverage in E2E or vice versa.

**Writing a test**
- Put the spec next to the component as `<Component>.test.tsx`. Only `src/**/*.test.{ts,tsx}` is picked up.
- Vitest globals are off: import `describe`, `it`, `expect`, `vi`, `afterEach` from `vitest`.
- Render with `renderWithQuery(<Component />)` from `@/test/render.tsx`. It wraps the component in a fresh `QueryClient` (no shared cache, `retry: false` so error states show immediately) and the app's `TooltipProvider`, and also returns that `queryClient`. `setup.ts` stubs `ResizeObserver` (missing in jsdom) so Radix tooltips can open; focus the trigger to show one (see `DeleteUserDialog.test.tsx`).
- Mock HTTP at the axios boundary: `vi.mock('axios')`, `const mockGet = vi.mocked(axios.get)`, then per test:
  - data: `mockGet.mockResolvedValue({ data: … })`
  - loading: `mockGet.mockReturnValue(new Promise(() => {}))` (never settles)
  - errors: `mockGet.mockRejectedValue(…)` with an `Error` that has `response: { status }` for an HTTP error, or no `response` for a network error. `errorMessage()` only reads those fields.
  - Add `afterEach(() => { vi.resetAllMocks() })`.
- Query like a user: `getByRole` with an accessible name first (`heading`, `table`, `row`, `cell`, `button`, `status` for skeletons), then `getByText`. Avoid test IDs and class names. Use `findBy…` to wait for data, and `queryBy…` with `.not.toBeInTheDocument()` to assert absence.
- Assert user-visible output, including exact copy for messages ("Could not load users (HTTP 403)."). Build locale-dependent expectations (dates) the same way the component does, e.g. `toLocaleDateString()`.
- Components that use routing or the session: wrap in `<MemoryRouter>` from `react-router`, and mock `@/lib/auth-client.ts` with `vi.mock` so `authClient.useSession()` returns the user you need. If a provider is needed in many specs, add a helper next to `renderWithQuery` in `src/test/` instead of repeating it.
- Dismissing Radix dialogs: press Escape with `fireEvent.keyDown(dialog, { key: 'Escape' })`. For an outside click, first wait a tick after opening (Radix attaches its outside listener in a `setTimeout`), then fire **both** `pointerDown` and `click` on `document.body` — Radix waits for the click before closing on a left-button press, so `pointerDown` alone does nothing. See the "Create user dialog" tests in `UsersPage.test.tsx`.
- jsdom has no layout or CSS. Don't test styling, visibility from CSS, or real navigation here; that belongs in E2E.

## End-to-end tests

Playwright (Chromium) with `playwright.config.ts` at the root and specs in `e2e/`. The `e2e-tester` agent (`.claude/agents/e2e-tester.md`) owns this suite, and its instructions document how the test stack works.

- **Delegate E2E work** — write, update, run, and debug Playwright tests through the `e2e-tester` agent (Agent tool, `subagent_type: "e2e-tester"`), not in the main session. This covers new specs and helpers in `e2e/` as well as diagnosing failing tests.
- **When to use it** — sparingly. Don't add E2E tests by default after every feature; write component tests first (see "What goes where" above). Use the agent only when a change touches auth, sessions, or server-side role checks, when it adds a critical cross-stack journey the existing specs don't cover, when the user asks for E2E coverage or a test run, or to fix failing specs. When you do, ask for a small number of focused tests, not exhaustive coverage.
- **What to pass it** — the agent starts with no knowledge of this conversation. Tell it what changed or what to cover: the feature and its routes, the files involved, the expected behaviour for each role, and any edge cases. Ask it to run the affected specs and report results.
- **After it returns** — relay its summary to the user: tests added or changed, pass/fail counts, and any app bugs it found. Don't claim tests pass unless its report shows a passing run.

## Conventions

- Use Bun, not npm/yarn/pnpm.
- All API routes live under `/api`.
- Express 5 forwards rejected promises from async handlers to the error middleware — no try/catch wrappers needed just to call `next(err)`.
- Server imports use explicit `.ts` extensions (`import { app } from "./app.ts"`).
- Style the client with Tailwind utility classes; no separate CSS files per component.
- UI components come from shadcn/ui (Radix base, Nova preset, neutral). Add them from `client/` with `bunx --bun shadcn@latest add <component>`; they land in `src/components/ui/`. Use theme tokens (`bg-background`, `text-muted-foreground`, `text-destructive`, …) instead of raw palette colors. Import from `client/src` with the `@/` alias.
- `cn` comes from the `cn` npm package (shadcn's drop-in replacement for clsx + tailwind-merge), not a local clsx/twMerge helper.
- **Data fetching: always use axios + TanStack Query (React Query)** for client calls to `/api`. Never use `fetch`, and never use `useEffect` + `useState` to load server data.
  - Reads: `useQuery({ queryKey, queryFn: () => axios.get<T>(url).then((res) => res.data) })`. See `UsersTable.tsx`.
  - Writes (create/edit/delete): `useMutation` with an axios call, then `queryClient.invalidateQueries({ queryKey })` on success so lists refetch.
  - The shared `queryClient` is in `client/src/lib/query-client.ts`. It registers `AxiosError` as the default error type, retries only network/5xx errors, and exports `errorMessage(error)` for display. `NavBar` clears the cache on sign-out.
  - Exception: auth calls go through `authClient` (Better Auth), not axios.
- Build forms with react-hook-form + zod using shadcn's `Field` pattern: `<Controller>` → `<Field data-invalid>` → `FieldLabel` / `Input aria-invalid` / `FieldError`. Show server errors via `form.setError('root.serverError', …)` rendered in a destructive `Alert`. See `LoginPage.tsx`.
  - Every form uses this pattern, including dialogs. Adding a user is the example: `UserForm.tsx` renders only the form (fields, server-error `Alert`, and `children` for the action buttons) and takes the `useForm` instance as a prop; `CreateUserDialog.tsx` owns that instance (the shared zod schema + `zodResolver`), the mutation, `form.reset()` when the dialog closes, and the mutation's `onError` that puts the server's `error` message into `root.serverError`. Keep form fields in their own component like this so other containers can reuse them: `EditUserDialog.tsx` (pencil button per row in `UsersTable`) renders the same `UserForm` with `passwordOptional` and its own `idPrefix`, pre-filled from the row, and sends `PATCH /api/users/:id` (validated by `updateUserSchema`, where a blank password means "keep the current one"; a new password revokes the user's other sessions).
  - Destructive actions are confirmed in an `AlertDialog` (no outside-click dismiss), not a `Dialog`: see `DeleteUserDialog.tsx`. Its confirm button is a plain `Button` calling `mutate`, not `AlertDialogAction` (which closes immediately), so the dialog stays open to show a server error. A disabled action that needs an explanation wraps the disabled button in a focusable `<span>` inside a `Tooltip` (`TooltipProvider` is set up once in `main.tsx` and in `renderWithQuery`).
  - Validate the same input on the server with zod (`schema.safeParse(req.body)` → 400 with `{ error, fieldErrors }` via `sendValidationError` from `server/src/lib/validation.ts`), as `POST /api/users` in `routes/users.ts` does.
- **Zod schemas live in `core`, never inline in client or server.** Any schema for data that crosses the API (request bodies, query params) is defined once in `core/src/schemas/<resource>.ts`, exported along with its inferred type (`export type CreateUserInput = z.infer<typeof createUserSchema>`), and re-exported from `core/src/index.ts`. Both sides import it from `"core"`: the client form passes it to `zodResolver` and uses the type for `useForm<…>`/the mutation; the server router calls `.safeParse(req.body)`. Don't copy or re-declare a schema on either side — one definition means the rules and error messages can't drift. `createUserSchema` (used by `CreateUserDialog.tsx` and `routes/users.ts`) is the example. Server-only concerns (e.g. uniqueness checks against the database) stay in the route handler, not the schema. Transforms like `.trim()`/`.toLowerCase()` are fine — they also run in the client before submit.
- `src/components/ui/` files are ours and may be customized. `input.tsx` has an autofill reset that hides Chrome's autofill background — re-apply it if the component is regenerated with `shadcn add input --overwrite`. `dialog.tsx` and `alert-dialog.tsx` open faster than shadcn's default (`data-open:duration-50` on the overlay and content, so modals appear in 50ms instead of 100ms) — re-apply that after regenerating either.
- Secrets go in `server/.env` (git-ignored); document new variables in `server/.env.example`.
