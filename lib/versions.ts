import { prisma } from "./prisma";

export type VersionSource = "manual" | "autosave" | "redraft" | "ai-edit" | "listen-edit" | "restore";

/** Most versions kept per chapter. Pinned or labelled ones are never pruned. */
const MAX_VERSIONS = 60;
/** Routine saves (typing) only create a version when the last one is older than this. */
const THROTTLE_MS = 5 * 60_000;

const countWords = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/**
 * Saves the chapter's current text as a version, before it is overwritten.
 * Skips empty text and text identical to the newest version. With `force` false, also skips
 * when the newest version is recent, so ordinary typing does not create hundreds of versions.
 */
export async function saveChapterVersion(
  chapterId: string,
  source: VersionSource,
  opts: { force?: boolean; label?: string } = {},
) {
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { title: true, content: true } });
  if (!chapter || !chapter.content.trim()) return null;

  const latest = await prisma.chapterVersion.findFirst({ where: { chapterId }, orderBy: { createdAt: "desc" } });
  if (latest && latest.content === chapter.content) return null;
  if (!opts.force && latest && Date.now() - latest.createdAt.getTime() < THROTTLE_MS) return null;

  const version = await prisma.chapterVersion.create({
    data: {
      chapterId,
      title: chapter.title,
      content: chapter.content,
      wordCount: countWords(chapter.content),
      source,
      label: opts.label ?? "",
    },
  });
  await pruneVersions(chapterId);
  return version;
}

async function pruneVersions(chapterId: string) {
  const prunable = await prisma.chapterVersion.findMany({
    where: { chapterId, pinned: false, label: "" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    skip: MAX_VERSIONS,
  });
  if (prunable.length) await prisma.chapterVersion.deleteMany({ where: { id: { in: prunable.map((v) => v.id) } } });
}

/** Replaces the chapter text with a stored version, after saving the current text so the restore can be undone. */
export async function restoreChapterVersion(chapterId: string, versionId: string) {
  const version = await prisma.chapterVersion.findFirst({ where: { id: versionId, chapterId } });
  if (!version) return null;
  await saveChapterVersion(chapterId, "restore", { force: true, label: "Before restore" });
  return prisma.chapter.update({
    where: { id: chapterId },
    data: { content: version.content, status: version.content.trim() ? "drafted" : "outline" },
  });
}
