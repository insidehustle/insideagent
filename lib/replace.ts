import { prisma } from "./prisma";
import { createSnapshot } from "./snapshots";
import { saveChapterVersion } from "./versions";

export interface ReplaceOptions {
  find: string;
  replace: string;
  matchCase?: boolean;
  wholeWord?: boolean;
}

export interface ReplaceSample {
  before: string;
  match: string;
  after: string;
}

export interface ChapterMatches {
  id: string;
  order: number;
  title: string;
  /** Matches in the chapter text */
  count: number;
  /** Matches in the chapter title */
  titleCount: number;
  samples: ReplaceSample[];
}

const MAX_FIND = 200;
const CONTEXT = 45;

function buildRegex({ find, matchCase, wholeWord }: ReplaceOptions): RegExp {
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // \b misses letters such as é, so word edges are checked with Unicode lookarounds
  const body = wholeWord ? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])` : escaped;
  return new RegExp(body, matchCase ? "gu" : "giu");
}

function validate(opts: ReplaceOptions) {
  if (!opts.find?.trim()) throw new Error("Enter the text to find.");
  if (opts.find.length > MAX_FIND || (opts.replace ?? "").length > 2000) throw new Error("The text to find or replace is too long.");
}

/** Chapters with text in them: outline-only chapters keep their plan in the text field, so they are left alone. */
async function writtenChapters(projectId: string) {
  const all = await prisma.chapter.findMany({ where: { projectId }, orderBy: { order: "asc" } });
  return all.filter((c) => c.status !== "outline" && c.content.trim());
}

/** Where the text would change, without changing anything. */
export async function previewReplace(projectId: string, opts: ReplaceOptions) {
  validate(opts);
  const re = buildRegex(opts);
  const chapters: ChapterMatches[] = [];
  for (const c of await writtenChapters(projectId)) {
    const matches = [...c.content.matchAll(re)];
    const titleCount = [...c.title.matchAll(re)].length;
    if (matches.length === 0 && titleCount === 0) continue;
    chapters.push({
      id: c.id,
      order: c.order,
      title: c.title,
      count: matches.length,
      titleCount,
      samples: matches.slice(0, 2).map((m) => {
        const at = m.index ?? 0;
        return {
          before: c.content.slice(Math.max(0, at - CONTEXT), at).replace(/\s+/g, " "),
          match: m[0],
          after: c.content.slice(at + m[0].length, at + m[0].length + CONTEXT).replace(/\s+/g, " "),
        };
      }),
    });
  }
  return { chapters, total: chapters.reduce((n, c) => n + c.count + c.titleCount, 0) };
}

/**
 * Replaces the text in the chosen chapters (all written chapters when `chapterIds` is omitted). A project snapshot is saved
 * first and each changed chapter keeps its earlier text in History, so the change can be undone.
 */
export async function applyReplace(projectId: string, opts: ReplaceOptions, chapterIds?: string[]) {
  validate(opts);
  const re = buildRegex(opts);
  const replacement = opts.replace ?? "";
  const targets = (await writtenChapters(projectId)).filter((c) => !chapterIds || chapterIds.includes(c.id));
  const changes = targets
    .map((c) => ({ c, content: c.content.replace(re, () => replacement), title: c.title.replace(re, () => replacement) }))
    .filter((x) => x.content !== x.c.content || x.title !== x.c.title);
  if (changes.length === 0) return { changed: 0, chapters: [] };

  await createSnapshot(projectId, "structure", `Before replacing "${opts.find.slice(0, 40)}"`);
  for (const { c, content, title } of changes) {
    await saveChapterVersion(c.id, "global-edit", { force: true, label: `Before replacing "${opts.find.slice(0, 40)}"` });
    await prisma.chapter.update({ where: { id: c.id }, data: { content, title: title.slice(0, 200) } });
  }
  const chapters = await prisma.chapter.findMany({ where: { projectId }, orderBy: { order: "asc" } });
  return { changed: changes.length, chapters };
}
