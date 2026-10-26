# One image runs the API and serves the built client from the same origin (see server/src/app.ts).
# Railway builds it from railway.json and Render from render.yaml. Migrations run as Railway's pre-deploy
# command or in Render's dockerCommand, not here.
FROM oven/bun:1.4.2

WORKDIR /app

# Dependencies first, so this layer is reused while only source files change. The server's postinstall
# runs `prisma generate`, which needs the schema and prisma.config.ts.
COPY package.json bun.lock ./
COPY client/package.json client/
COPY core/package.json core/
COPY server/package.json server/prisma.config.ts server/
COPY server/prisma server/prisma
RUN bun install --frozen-lockfile

COPY . .

# Dockerfile builds only see the Railway/Render variables declared here. The client's Sentry DSN is baked into
# the bundle, so it has to be present at build time.
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT
ARG VITE_SUPPORT_EMAIL
RUN bun run build

ENV NODE_ENV=production
WORKDIR /app/server
USER bun
EXPOSE 3000

# Bun itself is PID 1, so the platform's SIGTERM reaches the server's graceful shutdown (src/index.ts)
CMD ["bun", "src/index.ts"]
