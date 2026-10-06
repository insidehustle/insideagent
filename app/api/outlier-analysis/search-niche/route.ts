import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { askLLMJson } from "@/lib/llm";
import { researchNiche } from "@/lib/search";
import { getBlueprintMarkdown } from "@/lib/markdown-store";
import {
  computeOutlierScore,
  evaluatorPrompt,
  scoreLabel,
  type OutlierAnalysis,
} from "@/lib/frameworks/outlier-evaluator";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  try {
    const { projectId, niche: nicheOverride } = (await req.json()) as { projectId?: string; niche?: string };
    if (!projectId) return apiError("projectId is required", 400);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return apiError("Project not found", 404);
    const niche = nicheOverride?.trim() || project.niche;

    const { discovery, negative } = await researchNiche(niche);
    if (discovery.length + negative.length === 0) return apiError("Web search returned no results for this niche", 422);

    const fmt = (hits: typeof discovery) =>
      hits.map((h) => `[${h.title}](${h.url})\n${h.content.slice(0, 900)}`).join("\n\n---\n\n");
    const evidence = `## Discovery results (top books, summaries, frameworks)\n${fmt(discovery)}\n\n## Negative review mining (1-3 star themes)\n${fmt(negative)}`;

    const blueprint = await getBlueprintMarkdown(projectId);
    const analysis = await askLLMJson<OutlierAnalysis>(
      evaluatorPrompt({ niche, blueprint, evidence, mode: "web" }),
    );
    const score = computeOutlierScore(analysis.subscores);

    const report = await prisma.outlierReport.create({
      data: {
        projectId,
        source: "web",
        score,
        marketGaps: analysis.marketGaps ?? [],
        competitorsJson: JSON.parse(JSON.stringify({ competitors: analysis.competitors ?? [], subscores: analysis.subscores })),
        rawSearchResults: { discovery, negative } as object,
        strategyMarkdown: analysis.strategyMarkdown,
      },
    });
    await prisma.project.update({ where: { id: projectId }, data: { niche, status: "researched" } });

    return NextResponse.json({ report, label: scoreLabel(score) });
  } catch (e) {
    return apiError(e);
  }
}
