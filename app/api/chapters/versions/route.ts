import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireChapter } from "@/lib/auth";
import { restoreChapterVersion, saveChapterVersion } from "@/lib/versions";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";

/** Version history of one chapter, newest first. */
export async function GET(req: NextRequest) {
  try {
    const chapterId = req.nextUrl.searchParams.get("chapterId");
    if (!chapterId) return apiError("chapterId is required", 400);
    await requireChapter(chapterId);
    const versions = await prisma.chapterVersion.findMany({ where: { chapterId }, orderBy: { createdAt: "desc" }, take: 100 });
    return NextResponse.json({ versions });
  } catch (e) {
    return apiError(e);
  }
}

/** { chapterId, action: "save", label? } keeps the current text as a named version; { action: "restore", versionId } brings one back. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { chapterId?: string; action?: "save" | "restore"; versionId?: string; label?: string };
    if (!body.chapterId) return apiError("chapterId is required", 400);
    await requireChapter(body.chapterId);

    if (body.action === "restore") {
      if (!body.versionId) return apiError("versionId is required", 400);
      const chapter = await restoreChapterVersion(body.chapterId, body.versionId);
      if (!chapter) return apiError("Version not found", 404);
      return NextResponse.json({ chapter });
    }
    const version = await saveChapterVersion(body.chapterId, "manual", { force: true, label: (body.label ?? "").slice(0, 80) || "Saved version" });
    return NextResponse.json({ version });
  } catch (e) {
    return apiError(e);
  }
}

/** { chapterId, versionId, label?, pinned? } renames or pins a version (labelled and pinned versions are never pruned). */
export async function PATCH(req: NextRequest) {
  try {
    const { chapterId, versionId, label, pinned } = (await req.json()) as { chapterId?: string; versionId?: string; label?: string; pinned?: boolean };
    if (!chapterId || !versionId) return apiError("chapterId and versionId are required", 400);
    await requireChapter(chapterId);
    const owned = await prisma.chapterVersion.count({ where: { id: versionId, chapterId } });
    if (!owned) return apiError("Version not found", 404);
    const version = await prisma.chapterVersion.update({
      where: { id: versionId },
      data: { ...(label !== undefined && { label: label.slice(0, 80) }), ...(pinned !== undefined && { pinned }) },
    });
    return NextResponse.json({ version });
  } catch (e) {
    return apiError(e);
  }
}
