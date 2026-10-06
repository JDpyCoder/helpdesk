import { execSync } from 'node:child_process'

// Runs once before the suite (after the web servers start), with server/.env.test
// loaded into process.env by playwright.config.ts: create/migrate the test database,
// empty it, seed it. Postgres connections are per query, so the running API picks it up.
export default function globalSetup() {
  const run = (command: string) => execSync(command, { cwd: 'server', stdio: 'inherit', env: process.env })

  run('bunx prisma migrate deploy')
  run('bun src/reset-test-db.ts')
  run('bun src/seed.ts')
}
