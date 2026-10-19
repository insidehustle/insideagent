import { prisma } from "./prisma";
import { createSnapshot } from "./snapshots";
import { saveChapterVersion } from "./versions";
import { HttpError } from "./utils";

/** Far above any real chapter order, used to park chapters while others move (orders are unique per project). */
const PARK = 100_000;

const chaptersOf = (projectId: string) => prisma.chapter.findMany({ where: { projectId }, orderBy: { order: "asc" } });

/**
 * Moves every chapter after `after` up or down by `delta` places without ever colliding on the unique (project, order) key:
 * park them far away first, then bring them back at their new position.
 */
function shiftAfter(projectId: string, after: number, delta: number) {
  return [
    prisma.chapter.updateMany({ where: { projectId, order: { gt: after } }, data: { order: { increment: PARK } } }),
    prisma.chapter.updateMany({ where: { projectId, order: { gt: after + PARK } }, data: { order: { decrement: PARK - delta } } }),
  ];
}

/** Puts chapters in the given order (a list of all chapter ids). Chapter text, versions and briefs are untouched. */
export async function reorderChapters(projectId: string, orderedIds: string[]) {
  const existing = await prisma.chapter.findMany({ where: { projectId }, select: { id: true } });
  const have = new Set(existing.map((c) => c.id));
  if (orderedIds.length !== have.size || new Set(orderedIds).size !== orderedIds.length || !orderedIds.every((id) => have.has(id))) {
    throw new HttpError(400, "The new order must list every chapter exactly once.");
  }
  await prisma.$transaction([
    prisma.chapter.updateMany({ where: { projectId }, data: { order: { increment: PARK } } }),
    ...orderedIds.map((id, i) => prisma.chapter.update({ where: { id }, data: { order: i + 1 } })),
  ]);
  return chaptersOf(projectId);
}

/** Moves one chapter up (-1) or down (+1) by swapping its place with its neighbour. */
export async function moveChapter(projectId: string, chapterId: string, direction: -1 | 1) {
  const all = await chaptersOf(projectId);
  const i = all.findIndex((c) => c.id === chapterId);
  if (i === -1) throw new HttpError(404, "Chapter not found");
  const j = i + direction;
  if (j < 0 || j >= all.length) return all;
  const ids = all.map((c) => c.id);
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return reorderChapters(projectId, ids);
}

/**
 * Splits a chapter at a character position. The first part stays in the chapter, the rest becomes a new chapter right after it.
 * The original text is kept as a version first.
 */
export async function splitChapter(projectId: string, chapterId: string, at: number, newTitle: string) {
  const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, projectId } });
  if (!chapter) throw new HttpError(404, "Chapter not found");
  if (!Number.isInteger(at) || at <= 0 || at >= chapter.content.length) throw new HttpError(400, "Put the cursor inside the text where the new chapter should begin.");

  const head = chapter.content.slice(0, at).trimEnd();
  const tail = chapter.content.slice(at).trimStart();
  if (!head || !tail) throw new HttpError(400, "Both parts need some text. Move the cursor further into the chapter.");

  await saveChapterVersion(chapterId, "split", { force: true, label: "Before splitting" });
  const results = await prisma.$transaction([
    ...shiftAfter(projectId, chapter.order, 1),
    prisma.chapter.update({ where: { id: chapterId }, data: { content: head } }),
    prisma.chapter.create({
      data: {
        projectId,
        order: chapter.order + 1,
        title: newTitle.trim().slice(0, 200) || `${chapter.title} (continued)`,
        frameworkStep: null,
        content: tail,
        status: chapter.status === "outline" ? "outline" : "drafted",
        brief: "",
        instructions: "",
      },
    }),
  ]);
  const created = results[results.length - 1] as { id: string };
  return { chapters: await chaptersOf(projectId), activeId: created.id };
}

/**
 * Merges a chapter with the one after it. Text and briefs are joined under the first chapter's title.
 * The second chapter is deleted along with its history, so a project snapshot is saved first.
 */
export async function mergeWithNext(projectId: string, chapterId: string) {
  const first = await prisma.chapter.findFirst({ where: { id: chapterId, projectId } });
  if (!first) throw new HttpError(404, "Chapter not found");
  const second = await prisma.chapter.findFirst({ where: { projectId, order: first.order + 1 } });
  if (!second) throw new HttpError(400, "There is no chapter after this one to merge with.");

  await createSnapshot(projectId, "structure", `Before merging chapters ${first.order} and ${second.order}`);
  await saveChapterVersion(first.id, "merge", { force: true, label: "Before merging" });

  const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join("\n\n");
  const content = join(first.content, second.content);
  await prisma.$transaction([
    prisma.chapter.delete({ where: { id: second.id } }),
    ...shiftAfter(projectId, second.order, -1),
    prisma.chapter.update({
      where: { id: first.id },
      data: {
        content,
        brief: join(first.brief, second.brief),
        instructions: join(first.instructions, second.instructions),
        status: content.trim() ? "drafted" : first.status,
      },
    }),
  ]);
  return { chapters: await chaptersOf(projectId), activeId: first.id };
}
