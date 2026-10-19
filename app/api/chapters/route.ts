import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireChapter, requireProject } from "@/lib/auth";
import { createSnapshot } from "@/lib/snapshots";
import { saveChapterVersion, type VersionSource } from "@/lib/versions";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) return apiError("projectId is required", 400);
    await requireProject(projectId);
    const chapters = await prisma.chapter.findMany({ where: { projectId }, orderBy: { order: "asc" } });
    return NextResponse.json({ chapters });
  } catch (e) {
    return apiError(e);
  }
}

/** Delete every chapter of a project, so the outline can be regenerated. A snapshot is taken first. */
export async function DELETE(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) return apiError("projectId is required", 400);
    await requireProject(projectId);
    const existing = await prisma.chapter.count({ where: { projectId } });
    if (existing > 0) await createSnapshot(projectId, "delete-chapters", "Before deleting all chapters");
    const { count } = await prisma.chapter.deleteMany({ where: { projectId } });
    return NextResponse.json({ deleted: count });
  } catch (e) {
    return apiError(e);
  }
}

const FORCED_SOURCES: VersionSource[] = ["ai-edit", "listen-edit"];

/** Save manual edits and dictation notes. Changed text is versioned first. */
export async function PATCH(req: NextRequest) {
  try {
    const { id, content, title, dictationNotes, status, instructions, brief, versionSource } = (await req.json()) as {
      id?: string;
      content?: string;
      title?: string;
      dictationNotes?: string;
      instructions?: string;
      brief?: string;
      status?: string;
      /** Why the text is changing. ai-edit and listen-edit always keep the previous text; others are throttled. */
      versionSource?: VersionSource;
    };
    if (!id) return apiError("id is required", 400);
    const current = await requireChapter(id);

    if (content !== undefined && content !== current.content) {
      const source: VersionSource = versionSource ?? "manual";
      const force = FORCED_SOURCES.includes(source);
      try {
        await saveChapterVersion(id, source, { force });
      } catch (err) {
        // history is a safety net: a routine save must not fail because of it, but an edit that overwrites text must
        if (force) throw err;
        console.error("Could not save chapter version", err);
      }
    }

    const chapter = await prisma.chapter.update({
      where: { id },
      data: {
        ...(content !== undefined && { content }),
        ...(title !== undefined && { title }),
        ...(dictationNotes !== undefined && { dictationNotes }),
        ...(status !== undefined && { status }),
        ...(instructions !== undefined && { instructions }),
        ...(brief !== undefined && { brief }),
      },
    });
    return NextResponse.json({ chapter });
  } catch (e) {
    return apiError(e);
  }
}
