import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProject } from "@/lib/auth";
import { createSnapshot, restoreSnapshot, summarize, type SnapshotData } from "@/lib/snapshots";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";

/** Snapshots of a project, newest first, without their bulky data. */
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) return apiError("projectId is required", 400);
    await requireProject(projectId);
    const rows = await prisma.projectSnapshot.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 50 });
    const snapshots = rows.map((s) => ({
      id: s.id,
      label: s.label,
      source: s.source,
      createdAt: s.createdAt,
      ...summarize(s.data as unknown as SnapshotData),
    }));
    return NextResponse.json({ snapshots });
  } catch (e) {
    return apiError(e);
  }
}

/** { projectId, action: "create", label?, source? } saves a snapshot; { projectId, action: "restore", snapshotId } puts one back. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      action?: "create" | "restore";
      snapshotId?: string;
      label?: string;
      source?: "manual" | "autopilot";
    };
    if (!body.projectId) return apiError("projectId is required", 400);
    await requireProject(body.projectId);

    if (body.action === "restore") {
      if (!body.snapshotId) return apiError("snapshotId is required", 400);
      const chapters = await restoreSnapshot(body.projectId, body.snapshotId);
      if (!chapters) return apiError("Snapshot not found", 404);
      const project = await prisma.project.findUnique({ where: { id: body.projectId } });
      return NextResponse.json({ chapters, project });
    }
    const source = body.source === "autopilot" ? "autopilot" : "manual";
    const snapshot = await createSnapshot(body.projectId, source, (body.label ?? "").slice(0, 80) || (source === "manual" ? "Milestone" : ""));
    return NextResponse.json({ snapshot: { id: snapshot.id } });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    const id = req.nextUrl.searchParams.get("id");
    if (!projectId || !id) return apiError("projectId and id are required", 400);
    await requireProject(projectId);
    const { count } = await prisma.projectSnapshot.deleteMany({ where: { id, projectId } });
    return NextResponse.json({ deleted: count });
  } catch (e) {
    return apiError(e);
  }
}
