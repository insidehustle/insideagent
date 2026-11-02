import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/auth";
import { askLLMJson } from "@/lib/llm";
import { getCharactersBlock } from "@/lib/characters";
import { saveChapterVersion } from "@/lib/versions";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Edit {
  find: string;
  replace: string;
}

interface Issue {
  description: string;
  suggestion?: string;
  chapters: number[];
}

type Body =
  | { mode: "propose"; projectId: string; instruction: string; issue: Issue }
  | { mode: "apply"; projectId: string; changes: { chapterId: string; edits: Edit[] }[] };

/** Chapters sent to the model in one fix, and the longest chapter text it reads. */
const MAX_CHAPTERS = 6;
const MAX_CHARS = 30_000;

/** Replaces the first exact occurrence of each edit's `find`; returns the new text and how many edits applied. */
function applyEdits(content: string, edits: Edit[]) {
  let text = content;
  let applied = 0;
  for (const e of edits) {
    const at = text.indexOf(e.find);
    if (!e.find || at === -1) continue;
    text = text.slice(0, at) + e.replace + text.slice(at + e.find.length);
    applied++;
  }
  return { text, applied };
}

/**
 * Fixes one continuity issue from the user's instruction without opening the chapters. "propose" asks the model for small
 * find-and-replace edits in each chapter the issue names and returns them for review; "apply" writes the approved edits,
 * keeping the previous text of every chapter as a version so the change can be undone from History.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body.projectId) return apiError("projectId is required", 400);
    await requireProject(body.projectId);

    if (body.mode === "propose") {
      if (!body.instruction?.trim()) return apiError("Tell the writer what to change.", 400);
      const orders = [...new Set(body.issue?.chapters ?? [])].slice(0, MAX_CHAPTERS);
      if (!orders.length) return apiError("This issue does not name a chapter to change.", 400);

      const [project, characters] = await Promise.all([
        prisma.project.findUnique({ where: { id: body.projectId }, select: { bookBrief: true } }),
        getCharactersBlock(body.projectId, 1500),
      ]);
      const chapters = await prisma.chapter.findMany({ where: { projectId: body.projectId, order: { in: orders } }, orderBy: { order: "asc" } });

      const proposals = [];
      for (const c of chapters) {
        if (!c.content.trim()) continue;
        const out = await askLLMJson<{ edits?: Edit[] }>(
          `You are fixing a continuity problem in one chapter of a book by making the smallest possible edits.

Problem found across the book: ${body.issue.description}
${body.issue.suggestion ? `Suggested direction: ${body.issue.suggestion}\n` : ""}Author's instruction: ${body.instruction}

Book brief:
${(project?.bookBrief ?? "").slice(0, 1500) || "(none)"}
${characters ? `\nKnown characters and people:\n${characters}\n` : ""}
This is Chapter ${c.order}: ${c.title}. Return edits for this chapter only, and only if this chapter needs to change to follow the author's instruction. Each edit is an exact passage copied character for character from the chapter (a sentence or short paragraph, long enough to be unique), and the replacement for it. Keep the author's voice, tense and style; do not rewrite more than needed. If this chapter needs no change, return an empty list.

Chapter text:
${c.content.slice(0, MAX_CHARS)}

Return {"edits":[{"find":"exact passage from the chapter","replace":"the corrected passage"}]}`,
          { maxTokens: 6000 },
        );
        const edits = (out.edits ?? [])
          .map((e) => ({ find: String(e.find ?? ""), replace: String(e.replace ?? "") }))
          // keep only passages that really are in the chapter, so nothing is applied to the wrong place
          .filter((e) => e.find && e.find !== e.replace && c.content.includes(e.find));
        proposals.push({ chapterId: c.id, order: c.order, title: c.title, edits });
      }
      return NextResponse.json({ proposals });
    }

    if (body.mode === "apply") {
      const updated = [];
      for (const change of body.changes ?? []) {
        const chapter = await prisma.chapter.findFirst({ where: { id: change.chapterId, projectId: body.projectId } });
        if (!chapter) continue;
        const { text, applied } = applyEdits(chapter.content, change.edits ?? []);
        if (!applied || text === chapter.content) continue;
        await saveChapterVersion(chapter.id, "ai-edit", { force: true, label: "Before continuity fix" });
        updated.push(await prisma.chapter.update({ where: { id: chapter.id }, data: { content: text } }));
      }
      return NextResponse.json({ chapters: updated });
    }

    return apiError("Unknown mode", 400);
  } catch (e) {
    return apiError(e);
  }
}
