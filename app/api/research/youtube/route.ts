import { NextRequest, NextResponse } from "next/server";
import { findYoutubeReferences } from "@/lib/youtube-search";
import { requireProject } from "@/lib/auth";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Finds YouTube videos relevant to the book, based on its brief, instructions and chapter plans. */
export async function POST(req: NextRequest) {
  try {
    const { projectId, focus } = (await req.json()) as { projectId?: string; focus?: string };
    if (!projectId) return apiError("projectId is required", 400);
    await requireProject(projectId);
    const result = await findYoutubeReferences(projectId, focus?.trim().slice(0, 300) || undefined);
    return NextResponse.json(result);
  } catch (e) {
    return apiError(e);
  }
}
