import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runWebResearch } from "@/lib/research-run";
import { scoreLabel } from "@/lib/frameworks/outlier-evaluator";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  try {
    const { projectId, niche: nicheOverride } = (await req.json()) as { projectId?: string; niche?: string };
    if (!projectId) return apiError("projectId is required", 400);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return apiError("Project not found", 404);

    const { report, score } = await runWebResearch(projectId, nicheOverride?.trim() || project.niche);
    return NextResponse.json({ report, label: scoreLabel(score) });
  } catch (e) {
    return apiError(e);
  }
}
