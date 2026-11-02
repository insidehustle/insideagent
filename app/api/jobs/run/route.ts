import { NextRequest, NextResponse } from "next/server";
import { requireJob } from "@/lib/auth";
import { runSlice } from "@/lib/jobs";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Runs the next slice of a job from the open tab. Harmless if the job is already being worked on, not due yet or finished.
 * The browser does not need to stay: the end of each slice, or a scheduled ping, carries the job on.
 */
export async function POST(req: NextRequest) {
  try {
    const { jobId } = (await req.json()) as { jobId?: string };
    if (!jobId) return apiError("jobId is required", 400);
    await requireJob(jobId);
    const { ran, job } = await runSlice(jobId);
    return NextResponse.json({ ran, job, serverTime: Date.now() });
  } catch (e) {
    return apiError(e);
  }
}
