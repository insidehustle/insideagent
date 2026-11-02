/**
 * The two heavy writing steps, shared by the API route (one click) and the background job (whole book):
 * planning the outline and drafting one chapter. They throw HttpError for problems the author can fix.
 */
import { prisma } from "./prisma";
import { askLLM, askLLMJson } from "./llm";
import { getBlueprintMarkdown } from "./markdown-store";
import { chapterPrompt, guidanceBlocks, outlinePrompt } from "./frameworks/seven-step-narrative";
import { continueOutlinePrompt } from "./frameworks/outline-continue";
import type { BookKind } from "./frameworks/fiction";
import { cleanProse } from "./anti-ai";
import { getCharactersBlock, findNewNames } from "./characters";
import { getOutlineReferences, getReferences } from "./references";
import { saveChapterVersion } from "./versions";
import { HttpError } from "./utils";

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

/** The closing lines of a chapter, used so the next one continues from where it stopped. */
function endingOf(text: string, chars = 700): string {
  const t = text.trim();
  if (t.length <= chars) return t;
  const tail = t.slice(-chars);
  const firstBreak = tail.search(/\n\n|(?<=[.!?])\s/);
  return (firstBreak > 0 ? tail.slice(firstBreak) : tail).trim();
}

/** Plans the chapter list, book brief and a brief per chapter, and replaces the (undrafted) outline. */
export async function planOutline(projectId: string, opts: { chapterCount?: number; templateDocId?: string } = {}) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { outlierReports: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!project) throw new HttpError(404, "Project not found");
  const count = Math.min(Math.max(opts.chapterCount ?? 10, 3), 30);
  const blueprint = await getBlueprintMarkdown(project.id);
  // sample evenly across every uploaded document so the plan reflects all of the material
  // "Create my version": plan from one chosen source only, borrowing its structure and ideas, never its wording
  let templateNote = "";
  if (opts.templateDocId) {
    const owns = await prisma.sourceDocument.count({ where: { id: opts.templateDocId, projectId: project.id } });
    if (!owns) throw new HttpError(404, "Source document not found");
    templateNote =
      "CREATE AN ORIGINAL VERSION of the single source document shown in the reference material. Mirror its overall structure, sequence of ideas and the value it delivers to the reader, then improve on it: fill the market gaps, use the author's own voice, stories and examples, and reorder or add chapters where that serves the reader better. Do not copy its sentences, titles or examples; every chapter must be newly conceived.";
  }
  const refs = await getOutlineReferences(project.id, `${project.title} ${project.niche} ${project.writingInstructions}`, undefined, opts.templateDocId);
  const characters = await getCharactersBlock(project.id);
  const first = await askLLMJson<{ bookBrief?: string; chapters: OutlineItem[] }>(
    outlinePrompt({
      title: project.title,
      niche: project.niche,
      blueprint,
      chapterCount: count,
      marketGaps: project.outlierReports[0]?.marketGaps ?? [],
      instructions: [project.writingInstructions, templateNote].filter(Boolean).join("\n\n"),
      references: refs.block,
      characters,
      kind: project.kind as BookKind,
    }),
  );
  const bookBrief = first.bookBrief;
  let items = Array.isArray(first.chapters) ? first.chapters : [];
  if (items.length === 0) throw new HttpError(502, "Model returned an empty outline");

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
    throw new HttpError(502, `The model planned only ${items.length} of the ${count} chapters you asked for. Press the button again.`);
  }

  // Replace the outline, keeping nothing that was never drafted. Drafted chapters block this.
  const drafted = await prisma.chapter.count({ where: { projectId: project.id, status: { not: "outline" } } });
  if (drafted > 0) throw new HttpError(409, "Chapters have already been drafted. Delete them before regenerating the outline.");

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
  return prisma.chapter.findMany({ where: { projectId: project.id }, orderBy: { order: "asc" } });
}

/** Drafts one chapter from its brief, the blueprint, references and the end of the previous chapter. The replaced text is kept as a version. */
export async function draftChapter(chapterId: string, opts: { instruction?: string; wordTarget?: number } = {}) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { project: true },
  });
  if (!chapter) throw new HttpError(404, "Chapter not found");
  const prior = await prisma.chapter.findMany({
    where: { projectId: chapter.projectId, order: { lt: chapter.order } },
    orderBy: { order: "asc" },
    select: { title: true, content: true, status: true },
  });
  const lastDrafted = [...prior].reverse().find((p) => p.status !== "outline");
  const blueprint = await getBlueprintMarkdown(chapter.projectId);
  // a newly typed instruction replaces the saved one; otherwise reuse what was saved
  const instruction = (opts.instruction ?? chapter.instructions).trim();
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
      wordTarget: Math.min(Math.max(opts.wordTarget ?? 2500, 500), 8000),
    }),
    { maxTokens: 32000 },
  );
  const content = cleanProse(draft);
  // keep the text being replaced; a failure here must stop the redraft rather than lose writing
  await saveChapterVersion(chapter.id, "redraft", { force: true });
  const updated = await prisma.chapter.update({
    where: { id: chapter.id },
    data: { content, status: "drafted", instructions: instruction },
  });
  const newNames = await findNewNames(chapter.projectId, content);
  return { chapter: updated, sources: refs.sources, newNames };
}
