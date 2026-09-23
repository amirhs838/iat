import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Provide the Postgres (Neon) connection string.',
    )
  }
  // Standard Prisma query engine over TCP.
  //   Runtime:  DATABASE_URL — Neon POOLED endpoint + pgbouncer=true
  //             (transaction-mode pooling is serverless-safe and keeps
  //             connection counts low; pgbouncer=true disables prepared
  //             statements required by PgBouncer).
  //   Migrations: DIRECT_URL — direct non-pooled endpoint, used by
  //             `prisma db push` / `prisma migrate` (see prisma/schema.prisma).
  return new PrismaClient({
    datasources: { db: { url: connectionString } },
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  })
}

export const db =
  globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
