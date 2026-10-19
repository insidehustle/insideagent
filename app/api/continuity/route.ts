import { NextRequest, NextResponse } from "next/server";
import { requireProject } from "@/lib/auth";
import { checkContinuity } from "@/lib/continuity";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Checks the drafted chapters for repetition, lopsided lengths, unknown names, contradictions and dropped threads. */
export async function POST(req: NextRequest) {
  try {
    const { projectId } = (await req.json()) as { projectId?: string };
    if (!projectId) return apiError("projectId is required", 400);
    await requireProject(projectId);
    return NextResponse.json(await checkContinuity(projectId));
  } catch (e) {
    return apiError(e);
  }
}
