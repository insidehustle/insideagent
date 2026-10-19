import { NextRequest, NextResponse } from "next/server";
import { requireProject } from "@/lib/auth";
import { mergeWithNext, moveChapter, reorderChapters, splitChapter } from "@/lib/structure";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";

type Body =
  | { projectId: string; action: "move"; chapterId: string; direction: "up" | "down" }
  | { projectId: string; action: "reorder"; orderedIds: string[] }
  | { projectId: string; action: "split"; chapterId: string; at: number; title?: string }
  | { projectId: string; action: "merge"; chapterId: string };

/** Change the shape of the book: move, reorder, split or merge chapters. Always answers with the full, renumbered chapter list. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body.projectId) return apiError("projectId is required", 400);
    await requireProject(body.projectId);

    switch (body.action) {
      case "move":
        return NextResponse.json({ chapters: await moveChapter(body.projectId, body.chapterId, body.direction === "up" ? -1 : 1), activeId: body.chapterId });
      case "reorder":
        return NextResponse.json({ chapters: await reorderChapters(body.projectId, body.orderedIds ?? []) });
      case "split":
        return NextResponse.json(await splitChapter(body.projectId, body.chapterId, Number(body.at), body.title ?? ""));
      case "merge":
        return NextResponse.json(await mergeWithNext(body.projectId, body.chapterId));
      default:
        return apiError("Unknown action", 400);
    }
  } catch (e) {
    return apiError(e);
  }
}
