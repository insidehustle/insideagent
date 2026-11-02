import { NextRequest, NextResponse } from "next/server";
import { requireProject } from "@/lib/auth";
import { applyReplace, previewReplace } from "@/lib/replace";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Find and replace across the whole book. "preview" lists where the text would change; "apply" makes the change. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      action?: string;
      find?: string;
      replace?: string;
      matchCase?: boolean;
      wholeWord?: boolean;
      chapterIds?: string[];
    };
    if (!body.projectId) return apiError("projectId is required", 400);
    await requireProject(body.projectId);
    const opts = { find: String(body.find ?? ""), replace: String(body.replace ?? ""), matchCase: !!body.matchCase, wholeWord: !!body.wholeWord };
    if (body.action === "preview") return NextResponse.json(await previewReplace(body.projectId, opts));
    if (body.action === "apply") {
      const ids = Array.isArray(body.chapterIds) ? body.chapterIds.map(String) : undefined;
      return NextResponse.json(await applyReplace(body.projectId, opts, ids));
    }
    return apiError("action must be preview or apply", 400);
  } catch (e) {
    // a bad search is the author's to fix, so it is reported as a plain request error
    if (e instanceof Error && /^(Enter the text|The text to find)/.test(e.message)) return apiError(e.message, 400);
    return apiError(e);
  }
}
