import { NextResponse } from "next/server";
import { prisma } from "./prisma";

export function apiError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to .env.local.`);
  return value;
}

const DEFAULT_EMAIL = "author@local.dev";

/** Single-tenant default user until real auth is added. */
export async function getDefaultUser() {
  return prisma.user.upsert({
    where: { email: DEFAULT_EMAIL },
    update: {},
    create: { email: DEFAULT_EMAIL, name: "Author" },
  });
}
