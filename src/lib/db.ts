import { PrismaClient } from '@prisma/client'
import { PrismaNeonHTTP } from '@prisma/adapter-neon'

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
  // Neon serverless HTTP adapter: queries travel over HTTPS (port 443) instead of
  // a raw TCP 5432 connection. Works identically on local dev, the sandbox
  // preview, and Vercel serverless functions.
  const adapter = new PrismaNeonHTTP(connectionString)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  })
}

export const db =
  globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
