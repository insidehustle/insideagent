import { NextRequest, NextResponse } from "next/server";
import { requireJob } from "@/lib/auth";
import { cancelJob, kickWorker, resumeJob, toPublic } from "@/lib/jobs";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";

/** { jobId, action: "cancel" | "resume" }. Cancel stops after the chapter being written; resume retries a paused, waiting or failed job now. */
export async function POST(req: NextRequest) {
  try {
    const { jobId, action } = (await req.json()) as { jobId?: string; action?: "cancel" | "resume" };
    if (!jobId) return apiError("jobId is required", 400);
    const existing = await requireJob(jobId);
    if (action === "cancel") {
      const job = await cancelJob(existing.projectId, jobId);
      return NextResponse.json({ job: job ? toPublic(job) : null, serverTime: Date.now() });
    }
    if (action === "resume") {
      const job = await resumeJob(existing.projectId, jobId);
      if (job && job.status === "queued") await kickWorker(jobId);
      return NextResponse.json({ job: job ? toPublic(job) : null, serverTime: Date.now() });
    }
    return apiError("Unknown action", 400);
  } catch (e) {
    return apiError(e);
  }
}
