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
