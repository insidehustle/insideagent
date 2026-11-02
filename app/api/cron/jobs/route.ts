import { NextRequest, NextResponse } from "next/server";
import { nextDueJob, runSlice } from "@/lib/jobs";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Worker entry point. Runs one slice of one job: the given ?jobId, or the next job that is due.
 * Called by the end of the previous slice (chaining) and by a scheduled ping (Vercel Cron, GitHub Actions, cron-job.org...)
 * with `Authorization: Bearer $CRON_SECRET`.
 */
async function handle(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return apiError("CRON_SECRET is not set", 500);
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return apiError("Unauthorized", 401);

    const jobId = req.nextUrl.searchParams.get("jobId") ?? (await nextDueJob())?.id;
    if (!jobId) return NextResponse.json({ ran: false, reason: "no job is due" });
    const { ran, job } = await runSlice(jobId);
    return NextResponse.json({ ran, status: job?.status ?? null, done: job?.done ?? 0, total: job?.total ?? 0 });
  } catch (e) {
    return apiError(e);
  }
}

export const GET = handle;
export const POST = handle;
