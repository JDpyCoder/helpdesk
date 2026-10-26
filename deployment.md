# Deploying to Railway

The app deploys as **one Railway service** plus a **Railway Postgres** database. The service's Docker image
(`Dockerfile`) builds the client and runs the Express server, which serves both the API (`/api/*`) and the built
React app from the same domain. That keeps the session cookie same-origin, so no CORS setup is needed.

`railway.json` configures the service:

- **Build:** the root `Dockerfile`.
- **Pre-deploy:** `bun run db:deploy` (`prisma migrate deploy`) runs before each new deployment goes live.
- **Health check:** `/api/health`, which returns 503 if the database is unreachable. Railway keeps the old
  deployment serving until the new one passes.
- **Restarts:** on failure, up to 10 times.

Background jobs (pg-boss) run inside the same service and keep their tables in the `pgboss` schema of the same
database. Nothing else needs provisioning.

## First deploy

1. Create a Railway project and add a **PostgreSQL** database to it.
2. Add a service from this GitHub repository. Railway reads `railway.json` and builds with the Dockerfile.
3. Under the service's **Settings → Networking**, generate a public domain. Do this before setting the
   variables below, so `RAILWAY_PUBLIC_DOMAIN` has a value.
4. Set the service variables (next section), then deploy.
5. Once the deployment is live, create the first admin and the AI Agent user with one-off commands. They run in
   the service container, in `/app/server`:

   ```bash
   railway ssh -- bun run db:seed            # needs SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD on the service
   railway ssh -- bun run db:seed:ai-agent   # only if you use AI auto-resolution
   ```

   Both are idempotent. Remove `SEED_ADMIN_PASSWORD` from the service afterwards, then sign in and change it.

## Service variables

| Variable | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Reference to the Postgres service (use its name if you renamed it) |
| `BETTER_AUTH_SECRET` | output of `openssl rand -base64 32` | Required, at least 32 characters. Keep it stable: changing it signs everyone out |
| `BETTER_AUTH_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | The app's public URL (or your custom domain) |
| `CLIENT_ORIGIN` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | Same URL: the server serves the client itself |
| `CLIENT_IP_HEADER` | `x-real-ip` | Railway's edge passes the client IP in `X-Real-IP`, not `X-Forwarded-For`. Without this, the sign-in rate limit counts all users as one IP |
| `INBOUND_EMAIL_SECRET` | output of `openssl rand -base64 32` | Bearer secret for `POST /api/inbound-email`. While unset, that endpoint answers 503 |
| `GOOGLE_GENERATIVE_AI_API_KEY` | your Gemini key | Optional: enables polish, summaries, classification and auto-resolution |
| `GEMINI_MODEL` | e.g. `gemini-3.8-flash` | Optional |
| `SUPPORT_EMAIL` | e.g. `support@yourdomain.com` | Optional: sender shown on AI replies |
| `AGENTMAIL_API_KEY` | AgentMail API key | Optional: with `AGENTMAIL_INBOX_ID`, agent replies to tickets that came from AgentMail are emailed to the customer. See [agentmail-setup.md](agentmail-setup.md) |
| `AGENTMAIL_INBOX_ID` | e.g. `support@agentmail.to` | The support inbox customers write to |
| `AGENTMAIL_WEBHOOK_SECRET` | `whsec_…` | Signing secret of the AgentMail webhook for `https://<host>/api/webhooks/agentmail` (events `message.received`, `.sent`, `.delivered`, `.bounced`, `.rejected`). While unset, that endpoint answers 503 |
| `SENTRY_DSN` | server project DSN | Optional |
| `SENTRY_ENVIRONMENT` | `production` | Optional (defaults to `NODE_ENV`) |
| `VITE_SENTRY_DSN` | client project DSN | Optional. **Used at build time** (declared as a Docker `ARG`), so redeploy after changing it |
| `VITE_SENTRY_ENVIRONMENT` | `production` | Optional, build time |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | first admin | Only for `db:seed`; remove the password afterwards |

You don't need to set these:

- `PORT`: Railway sets it.
- `NODE_ENV=production`: set in the Dockerfile. It turns on the sign-in rate limit and serving of the client.
- `TRUST_PROXY`: not used on Railway, since `CLIENT_IP_HEADER` replaces it.

## Notes

- **Migrations:** create them locally with `bun run db:migrate` and commit them. Deploys only apply them
  (`prisma migrate deploy`) and never generate new ones.
- **Knowledge base:** `server/knowledge-base.md` is built into the image, so editing it means a redeploy. To edit
  it without redeploying, mount a Railway volume and point `KNOWLEDGE_BASE_PATH` at a file on it.
- **Content Security Policy:** the server's CSP (helmet, in `server/src/app.ts`) allows scripts, styles and fonts
  from the app's own origin, plus requests to `https://*.sentry.io`. Anything new loaded from another origin, or
  any inline `<script>`, has to be added there. That is why the theme script is a file,
  `client/public/theme-init.js`.
- **Custom domain:** after adding one, set `BETTER_AUTH_URL` and `CLIENT_ORIGIN` to it.
- **Testing the production setup locally:** run `bun run build`, then from `server/` run
  `NODE_ENV=production PORT=3100 bun src/index.ts` and open http://localhost:3100.

# Deploying to Render

`render.yaml` is a Render Blueprint for the same setup: **one Docker web service** built from the root
`Dockerfile`, plus a **Render Postgres** database. Differences from Railway:

- **Migrations** run when the container starts (`dockerCommand`: `bun run db:deploy && exec bun src/index.ts`),
  because Render's pre-deploy command needs a paid plan. A failed migration stops the new instance before it
  passes the health check, so the old deployment keeps serving.
- **Health check:** `/api/health`, as on Railway.
- **Public URL:** `BETTER_AUTH_URL` and `CLIENT_ORIGIN` fall back to `RENDER_EXTERNAL_URL` (the service's
  `onrender.com` URL, set by Render) in `server/src/auth.ts`, so you don't set them unless you add a custom domain.
- **Client IP:** `CLIENT_IP_HEADER=true-client-ip`. Render's proxy appends to `X-Forwarded-For` rather than
  replacing it, so that header can be spoofed.
- **Port:** Render sets `PORT` (10000) and the server reads it.

## First deploy

1. Push the repository (with `render.yaml`) to GitHub/GitLab.
2. In the Render Dashboard, open **Blueprints → New Blueprint Instance** and pick the repository.
3. Render lists the variables marked `sync: false`. Fill in what you use (`GOOGLE_GENERATIVE_AI_API_KEY`,
   the three `AGENTMAIL_*` variables, `SENTRY_DSN`, `VITE_SENTRY_DSN`) or leave them blank, then **Apply**. `BETTER_AUTH_SECRET` and
   `INBOUND_EMAIL_SECRET` are generated; read `INBOUND_EMAIL_SECRET` from the service's **Environment** page
   for whatever posts to `/api/inbound-email`.
4. Once the service is live, create the first admin and the AI Agent user:
   - **Paid plan:** open the service's **Shell** tab (it starts in `/app/server`) and run `bun run db:seed`
     (with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` added to the service) and `bun run db:seed:ai-agent`.
   - **Free plan** (no shell): run the seeds from your machine against the database's **External Database
     URL** (database page → Connect). From `server/`, with your local `server/.env` providing the other variables:

     ```powershell
     $env:DATABASE_URL = "<External Database URL>"
     $env:SEED_ADMIN_EMAIL = "you@yourdomain.com"
     $env:SEED_ADMIN_PASSWORD = "<a strong password>"
     bun run db:seed
     bun run db:seed:ai-agent   # only if you use AI auto-resolution
     Remove-Item Env:DATABASE_URL, Env:SEED_ADMIN_PASSWORD
     ```

   Both are idempotent. Sign in and change the password afterwards.
5. **Check the client IP:** sign in, then look at the newest row of the `session` table (Prisma Studio with the
   external URL, or `psql`). `ipAddress` should be your public IP. If it is empty or a Render address, remove
   `CLIENT_IP_HEADER` and set `TRUST_PROXY` to the hop count that yields your IP instead, or the sign-in rate
   limit treats every user as one client.

## Plans

`render.yaml` uses the free plans so a Blueprint costs nothing to try. Before real use, change them:

- **Web service:** free instances spin down after 15 idle minutes (about a minute to wake), and background jobs
  (classification, auto-resolution) pause with them. Use `starter` or above.
- **Database:** free Render Postgres databases expire 30 days after creation. Use `basic-256mb` or above.

## Other variables

The rest of the Railway table applies, except `DATABASE_URL`, `BETTER_AUTH_URL`, `CLIENT_ORIGIN` and
`CLIENT_IP_HEADER`, which `render.yaml` handles. Add optional ones (`GEMINI_MODEL`, `SUPPORT_EMAIL`,
`SENTRY_ENVIRONMENT`, `VITE_SENTRY_ENVIRONMENT`) on the service's **Environment** page. Render passes service
variables to the Docker build as build args, so `VITE_*` values reach the client bundle; redeploy after changing them.
