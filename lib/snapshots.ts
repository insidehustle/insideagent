import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type SnapshotSource = "manual" | "autopilot" | "delete-chapters" | "restore" | "structure";

/** Most automatic snapshots kept per project. Manual ones (the author's milestones) are never pruned. */
const MAX_AUTO = 20;

interface SnapshotChapter {
  order: number;
  title: string;
  frameworkStep: string | null;
  content: string;
  status: string;
  dictationNotes: string | null;
  instructions: string;
  brief: string;
}

interface SnapshotBlueprint {
  loves: string;
  goodAt: string;
  marketNeeds: string;
  monetization: string;
  stories: string;
  reader: string;
  voiceSample: string;
  avoid: string;
  markdownContent: string;
  voiceRules: string[];
}

export interface SnapshotData {
  bookBrief: string;
  writingInstructions: string;
  kind: string;
  status: string;
  blueprint: SnapshotBlueprint | null;
  chapters: SnapshotChapter[];
}

export function summarize(data: SnapshotData) {
  const words = data.chapters.reduce((n, c) => n + (c.content.trim() ? c.content.trim().split(/\s+/).length : 0), 0);
  return {
    chapters: data.chapters.length,
    drafted: data.chapters.filter((c) => c.status !== "outline").length,
    words,
  };
}

/** Captures the project's brief, instructions, blueprint and every chapter. */
export async function createSnapshot(projectId: string, source: SnapshotSource, label = "") {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { chapters: { orderBy: { order: "asc" } }, blueprint: true },
  });
  if (!project) throw new Error("Project not found");

  const data: SnapshotData = {
    bookBrief: project.bookBrief,
    writingInstructions: project.writingInstructions,
    kind: project.kind,
    status: project.status,
    blueprint: project.blueprint && {
      loves: project.blueprint.loves,
      goodAt: project.blueprint.goodAt,
      marketNeeds: project.blueprint.marketNeeds,
      monetization: project.blueprint.monetization,
      stories: project.blueprint.stories,
      reader: project.blueprint.reader,
      voiceSample: project.blueprint.voiceSample,
      avoid: project.blueprint.avoid,
      markdownContent: project.blueprint.markdownContent,
      voiceRules: project.blueprint.voiceRules,
    },
    chapters: project.chapters.map((c) => ({
      order: c.order,
      title: c.title,
      frameworkStep: c.frameworkStep,
      content: c.content,
      status: c.status,
      dictationNotes: c.dictationNotes,
      instructions: c.instructions,
      brief: c.brief,
    })),
  };

  const snapshot = await prisma.projectSnapshot.create({
    data: { projectId, source, label, data: data as unknown as Prisma.InputJsonValue },
  });

  if (source !== "manual") {
    const old = await prisma.projectSnapshot.findMany({
      where: { projectId, source: { not: "manual" } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
      skip: MAX_AUTO,
    });
    if (old.length) await prisma.projectSnapshot.deleteMany({ where: { id: { in: old.map((s) => s.id) } } });
  }
  return snapshot;
}

/**
 * Puts the project back to a snapshot. The current state is snapshotted first, so a restore is itself reversible.
 * Chapters are matched by position and updated in place, so their version history survives;
 * chapters the snapshot did not have are removed (the pre-restore snapshot still holds them).
 */
export async function restoreSnapshot(projectId: string, snapshotId: string) {
  const snap = await prisma.projectSnapshot.findFirst({ where: { id: snapshotId, projectId } });
  if (!snap) return null;
  const data = snap.data as unknown as SnapshotData;

  await createSnapshot(projectId, "restore", "Before restoring a snapshot");

  await prisma.$transaction([
    prisma.chapter.deleteMany({ where: { projectId, order: { notIn: data.chapters.map((c) => c.order) } } }),
    ...data.chapters.map((c) =>
      prisma.chapter.upsert({
        where: { projectId_order: { projectId, order: c.order } },
        create: { ...c, projectId },
        update: c,
      }),
    ),
    prisma.project.update({
      where: { id: projectId },
      data: {
        bookBrief: data.bookBrief,
        writingInstructions: data.writingInstructions,
        kind: data.kind,
        status: data.status,
      },
    }),
    ...(data.blueprint
      ? [
          prisma.authorBlueprint.upsert({
            where: { projectId },
            create: { projectId, ...data.blueprint },
            update: data.blueprint,
          }),
        ]
      : []),
  ]);
  return prisma.chapter.findMany({ where: { projectId }, orderBy: { order: "asc" } });
}
