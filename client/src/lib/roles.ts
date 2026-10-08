// The Prisma `Role` enum, shared with the server so role values have one source of truth.
// enums.ts is standalone (no Prisma runtime), so it is safe to bundle into the client.
export { Role } from '../../../server/src/generated/prisma/enums.ts'
