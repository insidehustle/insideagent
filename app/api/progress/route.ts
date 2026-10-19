import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/auth";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";

const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/**
 * Where the book stands: words written against the goal, per-chapter lengths, and the days (in the author's own time zone)
 * on which a chapter was edited, from which the streak is worked out.
 * `tz` is the browser's Date.getTimezoneOffset() in minutes.
 */
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) return apiError("projectId is required", 400);
    const tz = Number(req.nextUrl.searchParams.get("tz") ?? 0) || 0;
    const project = await requireProject(projectId);

    const chapters = await prisma.chapter.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      select: { id: true, order: true, title: true, content: true, status: true, updatedAt: true },
    });
    const since = new Date(Date.now() - 120 * 86_400_000);
    const versions = await prisma.chapterVersion.findMany({
      where: { chapter: { projectId }, createdAt: { gte: since } },
      select: { createdAt: true },
    });

    const dayOf = (d: Date) => new Date(d.getTime() - tz * 60_000).toISOString().slice(0, 10);
    const days = new Set<string>([...versions.map((v) => dayOf(v.createdAt)), ...chapters.filter((c) => c.content.trim()).map((c) => dayOf(c.updatedAt))]);

    const perChapter = chapters.map((c) => ({ id: c.id, order: c.order, title: c.title, status: c.status, words: words(c.content) }));
    const total = perChapter.reduce((n, c) => n + c.words, 0);
    return NextResponse.json({
      goal: project.wordGoal,
      words: total,
      chapters: perChapter.length,
      drafted: perChapter.filter((c) => c.status !== "outline").length,
      perChapter,
      activeDays: [...days].sort(),
      today: dayOf(new Date()),
    });
  } catch (e) {
    return apiError(e);
  }
}
