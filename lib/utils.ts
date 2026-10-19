import { NextResponse } from "next/server";
import { classifyError, issueSummary } from "./errors";

/** An error that carries the HTTP status apiError should respond with. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const ISSUE_STATUS = { rate_limit: 429, quota: 429, timeout: 504, unavailable: 503, too_large: 413 } as const;

/**
 * JSON error response. Provider failures (rate limit, quota used up, bad key, outage…) are explained in plain words
 * in `error`, with the structured cause in `issue` so the app can show which service is affected and for how long.
 */
export function apiError(error: unknown, status = 500) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const issue = classifyError(error);
  if (issue) {
    console.error(`[${issue.provider ?? "service"}] ${issue.code}: ${issue.detail}`);
    const httpStatus = ISSUE_STATUS[issue.code as keyof typeof ISSUE_STATUS] ?? 502;
    return NextResponse.json({ error: issueSummary(issue), issue }, { status: httpStatus });
  }
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to .env.local.`);
  return value;
}
