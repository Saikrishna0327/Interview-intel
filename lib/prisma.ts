// This file makes ONE database connection and shares it everywhere.
//
// Why? In development, Next.js reloads your code many times. If we made a new
// database client on every reload, we would open too many connections and the
// database would refuse us. So we keep one client on the global object and
// reuse it.

import { PrismaClient } from "@prisma/client";

// `globalThis` is a box that survives code reloads in development.
// We store our one client inside it.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Use the client we already made, or make a new one the first time.
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// In production every server start is fresh, so we only keep the client on the
// global box during development.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
