import { NextRequest, NextResponse } from "next/server";
import { requireProject, requireUser } from "@/lib/auth";
import { canSelfDrive, createJob, kickWorker, latestJob, toPublic } from "@/lib/jobs";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";

/** The most recent background job for a book (any state), or null. */
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) return apiError("projectId is required", 400);
    await requireProject(projectId);
    const job = await latestJob(projectId);
    return NextResponse.json({ job: job ? toPublic(job) : null, serverTime: Date.now(), selfDriving: canSelfDrive() });
  } catch (e) {
    return apiError(e);
  }
}

/** Starts "write the whole book" as a background job. Answers at once; the work is done in slices on the server. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { projectId?: string; words?: number; redraft?: boolean; count?: number };
    if (!body.projectId) return apiError("projectId is required", 400);
    await requireProject(body.projectId);
    const user = await requireUser();
    const job = await createJob(user.id, body.projectId, body);
    // start without waiting for a browser, where the server is set up to chain itself
    const chained = await kickWorker(job.id);
    return NextResponse.json({ job: toPublic(job), chained, serverTime: Date.now() }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
