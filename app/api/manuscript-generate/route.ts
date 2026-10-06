import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { askLLM, askLLMJson } from "@/lib/llm";
import { getBlueprintMarkdown } from "@/lib/markdown-store";
import { chapterPrompt, guidanceBlocks, inlineEditPrompt, outlinePrompt } from "@/lib/frameworks/seven-step-narrative";
import { continueOutlinePrompt } from "@/lib/frameworks/outline-continue";
import type { BookKind } from "@/lib/frameworks/fiction";
import { cleanProse } from "@/lib/anti-ai";
import { getCharactersBlock, findNewNames } from "@/lib/characters";
import { getOutlineReferences, getReferences, getWritingInstructions } from "@/lib/references";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

interface OutlineItem {
  title: string;
  frameworkStep: number | string;
  summary: string;
  keyPoints?: string[];
  characters?: string[];
  sources?: string[];
}

/** The chapter brief shown in the editor and fed back into drafting. */
function formatBrief(it: OutlineItem, realDocs: Set<string>): string {
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
  const points = list(it.keyPoints);
  const people = list(it.characters);
  const sources = list(it.sources).filter((s) => realDocs.has(s));
  return [
    `**Summary:** ${String(it.summary ?? "").trim()}`,
    points.length ? `**Key points:**\n${points.map((p) => `- ${p}`).join("\n")}` : "",
    people.length ? `**Characters:** ${people.join(", ")}` : "",
    `**Drawn from:** ${sources.length ? sources.join(", ") : "no uploaded document covers this chapter"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

type Body =
  | { action: "outline"; projectId: string; chapterCount?: number }
  | { action: "chapter"; chapterId: string; instruction?: string; wordTarget?: number }
  | { action: "edit"; projectId: string; selection: string; instruction: string; context?: string }
  | { action: "alternatives"; projectId: string; word: string; sentence: string };

/** The closing lines of a chapter, used so the next one continues from where it stopped. */
function endingOf(text: string, chars = 700): string {
  const t = text.trim();
  if (t.length <= chars) return t;
  const tail = t.slice(-chars);
  const firstBreak = tail.search(/\n\n|(?<=[.!?])\s/);
  return (firstBreak > 0 ? tail.slice(firstBreak) : tail).trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;

    if (body.action === "outline") {
      const project = await prisma.project.findUnique({
        where: { id: body.projectId },
        include: { outlierReports: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      if (!project) return apiError("Project not found", 404);
      const count = Math.min(Math.max(body.chapterCount ?? 10, 3), 30);
      const blueprint = await getBlueprintMarkdown(project.id);
      // sample evenly across every uploaded document so the plan reflects all of the material
      const refs = await getOutlineReferences(project.id, `${project.title} ${project.niche} ${project.writingInstructions}`);
      const characters = await getCharactersBlock(project.id);
      const first = await askLLMJson<{ bookBrief?: string; chapters: OutlineItem[] }>(
        outlinePrompt({
          title: project.title,
          niche: project.niche,
          blueprint,
          chapterCount: count,
          marketGaps: project.outlierReports[0]?.marketGaps ?? [],
          instructions: project.writingInstructions,
          references: refs.block,
          characters,
          kind: project.kind as BookKind,
        }),
      );
      const bookBrief = first.bookBrief;
      let items = Array.isArray(first.chapters) ? first.chapters : [];
      if (items.length === 0) return apiError("Model returned an empty outline", 502);

      // The model does not always return the number asked for. Ask for the missing chapters, then trim any extras.
      for (let round = 0; round < 2 && items.length < count; round++) {
        const more = await askLLMJson<{ chapters: OutlineItem[] }>(
          continueOutlinePrompt({
            title: project.title,
            niche: project.niche,
            kind: project.kind as BookKind,
            existing: items.map((c) => ({ title: String(c.title), summary: String(c.summary ?? "") })),
            total: count,
            guidance: guidanceBlocks({ instructions: project.writingInstructions, characters }),
          }),
          { maxTokens: 8000 },
        );
        if (Array.isArray(more.chapters)) items = items.concat(more.chapters);
      }
      items = items.slice(0, count);
      if (items.length < count) {
        return apiError(`The model planned only ${items.length} of the ${count} chapters you asked for. Press the button again.`, 502);
      }

      // Replace the outline, keeping nothing that was never drafted. Drafted chapters block this.
      const drafted = await prisma.chapter.count({ where: { projectId: project.id, status: { not: "outline" } } });
      if (drafted > 0) return apiError("Chapters have already been drafted. Delete them before regenerating the outline.", 409);

      // only document names that really exist may be cited
      const realDocs = new Set(refs.sources);
      await prisma.$transaction([
        prisma.chapter.deleteMany({ where: { projectId: project.id } }),
        prisma.chapter.createMany({
          data: items.map((it, i) => ({
            projectId: project.id,
            order: i + 1,
            title: String(it.title),
            frameworkStep: String(it.frameworkStep ?? ""),
            brief: formatBrief(it, realDocs),
            content: "",
            status: "outline",
          })),
        }),
        prisma.project.update({
          where: { id: project.id },
          data: { status: "outlined", bookBrief: String(bookBrief ?? "").trim() },
        }),
      ]);
      const chapters = await prisma.chapter.findMany({ where: { projectId: project.id }, orderBy: { order: "asc" } });
      return NextResponse.json({ chapters });
    }

    if (body.action === "chapter") {
      const chapter = await prisma.chapter.findUnique({
        where: { id: body.chapterId },
        include: { project: true },
      });
      if (!chapter) return apiError("Chapter not found", 404);
      const prior = await prisma.chapter.findMany({
        where: { projectId: chapter.projectId, order: { lt: chapter.order } },
        orderBy: { order: "asc" },
        select: { title: true, content: true, status: true },
      });
      const lastDrafted = [...prior].reverse().find((p) => p.status !== "outline");
      const blueprint = await getBlueprintMarkdown(chapter.projectId);
      // a newly typed instruction replaces the saved one; otherwise reuse what was saved
      const instruction = (body.instruction ?? chapter.instructions).trim();
      // the brief guides every draft and redraft; chapters outlined before briefs existed kept theirs in content
      const summary = chapter.brief || (chapter.status === "outline" ? chapter.content : undefined);
      const refs = await getReferences(
        chapter.projectId,
        [chapter.title, summary, instruction, chapter.dictationNotes, chapter.project.writingInstructions].filter(Boolean).join(" "),
      );
      const characters = await getCharactersBlock(chapter.projectId);
      const draft = await askLLM(
        chapterPrompt({
          bookTitle: chapter.project.title,
          niche: chapter.project.niche,
          blueprint,
          chapterTitle: chapter.title,
          chapterOrder: chapter.order,
          summary,
          priorTitles: prior.map((p) => p.title),
          previousEnding: lastDrafted ? endingOf(lastDrafted.content) : undefined,
          dictationNotes: chapter.dictationNotes,
          instruction: instruction || undefined,
          instructions: chapter.project.writingInstructions,
          references: refs.block,
          characters,
          bookBrief: chapter.project.bookBrief,
          kind: chapter.project.kind as BookKind,
          wordTarget: Math.min(Math.max(body.wordTarget ?? 2500, 500), 8000),
        }),
        { maxTokens: 32000 },
      );
      const content = cleanProse(draft);
      const updated = await prisma.chapter.update({
        where: { id: chapter.id },
        data: { content, status: "drafted", instructions: instruction },
      });
      const newNames = await findNewNames(chapter.projectId, content);
      return NextResponse.json({ chapter: updated, sources: refs.sources, newNames });
    }

    if (body.action === "edit") {
      if (!body.selection?.trim() || !body.instruction?.trim()) return apiError("selection and instruction are required", 400);
      const blueprint = await getBlueprintMarkdown(body.projectId);
      const instructions = await getWritingInstructions(body.projectId);
      const refs = await getReferences(body.projectId, `${body.selection} ${body.instruction}`, 3000);
      const characters = await getCharactersBlock(body.projectId, 1500);
      const text = await askLLM(
        inlineEditPrompt({
          blueprint,
          selection: body.selection,
          instruction: body.instruction,
          context: body.context,
          instructions,
          references: refs.block,
          characters,
        }),
        { maxTokens: 8000 },
      );
      return NextResponse.json({ text: cleanProse(text) });
    }

    if (body.action === "alternatives") {
      if (!body.word?.trim()) return apiError("word is required", 400);
      const { alternatives } = await askLLMJson<{ alternatives: string[] }>(
        `Suggest 6 replacements for the word "${body.word}" in this sentence. Each must fit the grammar and meaning of the sentence, and differ from the others in tone (plainer, stronger, softer, more specific). Single words or very short phrases only. Avoid cliches such as "delve", "unlock", "seamless", "robust".

Sentence: ${body.sentence}

Return JSON: {"alternatives": [string]}`,
        { maxTokens: 600 },
      );
      const cleaned = (alternatives ?? []).map((a) => String(a).trim()).filter((a) => a && a.toLowerCase() !== body.word.toLowerCase());
      return NextResponse.json({ alternatives: cleaned.slice(0, 8) });
    }

    return apiError("Unknown action", 400);
  } catch (e) {
    return apiError(e);
  }
}
