import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/auth";
import { extractText, MAX_UPLOAD_BYTES } from "@/lib/extract-text";
import { splitIntoChapters } from "@/lib/split-chapters";
import { createSnapshot } from "@/lib/snapshots";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Imports an existing manuscript as chapters, for editing, listening and continuity checks without rewriting it.
 * multipart/form-data: projectId, then file (.txt, .md, .docx, .pdf) or text, and mode ("replace" | "append") when
 * the project already has chapters. Replacing saves a snapshot first.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const projectId = String(form.get("projectId") ?? "");
    const mode = String(form.get("mode") ?? "");
    const file = form.get("file");
    const pasted = String(form.get("text") ?? "");
    if (!projectId) return apiError("projectId is required", 400);
    await requireProject(projectId);

    let text: string;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_UPLOAD_BYTES) return apiError("File exceeds the 10 MB limit", 413);
      text = await extractText(file);
    } else {
      text = pasted;
    }
    text = text.trim();
    if (!text) return apiError("No readable text found. Scanned PDFs need to be converted to text first.", 422);

    const existing = await prisma.chapter.count({ where: { projectId } });
    if (existing > 0 && mode !== "replace" && mode !== "append") return apiError("This project already has chapters. Choose to replace them or add to them.", 409);

    const { chapters, method } = splitIntoChapters(text);
    if (chapters.length === 0) return apiError("Could not find any chapters in that text.", 422);

    if (existing > 0 && mode === "replace") await createSnapshot(projectId, "delete-chapters", "Before importing a manuscript");
    const start = mode === "append" ? ((await prisma.chapter.aggregate({ where: { projectId }, _max: { order: true } }))._max.order ?? 0) : 0;

    await prisma.$transaction([
      ...(mode === "replace" ? [prisma.chapter.deleteMany({ where: { projectId } })] : []),
      prisma.chapter.createMany({
        data: chapters.map((c, i) => ({
          projectId,
          order: start + i + 1,
          title: c.title.slice(0, 200) || `Chapter ${start + i + 1}`,
          content: c.content,
          status: c.content.trim() ? "drafted" : "outline",
        })),
      }),
    ]);

    const all = await prisma.chapter.findMany({ where: { projectId }, orderBy: { order: "asc" } });
    return NextResponse.json({ chapters: all, imported: chapters.length, method });
  } catch (e) {
    return apiError(e);
  }
}
