import { NextRequest, NextResponse } from "next/server";
import { requireProject } from "@/lib/auth";
import { applyInterview, nextQuestion, type QA } from "@/lib/interview";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/** AI interview of the author. "next" returns the next question; "finish" adds the answers to the writing instructions. */
export async function POST(req: NextRequest) {
  try {
    const { projectId, action, history } = (await req.json()) as { projectId?: string; action?: string; history?: QA[] };
    if (!projectId) return apiError("projectId is required", 400);
    await requireProject(projectId);
    const qa: QA[] = (Array.isArray(history) ? history : [])
      .slice(0, 30)
      .map((h) => ({ q: String(h?.q ?? "").slice(0, 500), a: String(h?.a ?? "").slice(0, 4000) }))
      .filter((h) => h.q);
    if (action === "next") return NextResponse.json(await nextQuestion(projectId, qa));
    if (action === "finish") return NextResponse.json(await applyInterview(projectId, qa));
    return apiError("action must be next or finish", 400);
  } catch (e) {
    return apiError(e);
  }
}
