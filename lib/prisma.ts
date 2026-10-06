import { PrismaClient } from "@prisma/client";

// Cache the client on globalThis so hot reloads and serverless warm starts
// reuse one connection pool instead of exhausting the database.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
