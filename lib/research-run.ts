import { prisma } from "./prisma";
import { askLLMJson } from "./llm";
import { researchNiche } from "./search";
import { getBlueprintMarkdown } from "./markdown-store";
import { computeOutlierScore, evaluatorPrompt, type OutlierAnalysis } from "./frameworks/outlier-evaluator";

export interface ResearchChange {
  previousScore: number;
  delta: number;
  newCompetitors: string[];
}

/** Runs web research for a project, stores an OutlierReport and compares it with the previous web/auto report. */
export async function runWebResearch(projectId: string, niche: string, source: "web" | "auto" = "web") {
  const { discovery, negative } = await researchNiche(niche);
  if (discovery.length + negative.length === 0) throw new Error("Web search returned no results for this niche");

  const fmt = (hits: typeof discovery) =>
    hits.map((h) => `[${h.title}](${h.url})\n${h.content.slice(0, 900)}`).join("\n\n---\n\n");
  const evidence = `## Discovery results (top books, summaries, frameworks)\n${fmt(discovery)}\n\n## Negative review mining (1-3 star themes)\n${fmt(negative)}`;

  const blueprint = await getBlueprintMarkdown(projectId);
  const analysis = await askLLMJson<OutlierAnalysis>(evaluatorPrompt({ niche, blueprint, evidence, mode: "web" }));
  const score = computeOutlierScore(analysis.subscores);

  const previous = await prisma.outlierReport.findFirst({
    where: { projectId, source: { in: ["web", "auto"] } },
    orderBy: { createdAt: "desc" },
  });
  let change: ResearchChange | null = null;
  if (previous) {
    const before = (previous.competitorsJson as { competitors?: { title: string }[] } | null)?.competitors ?? [];
    const seen = new Set(before.map((c) => c.title.trim().toLowerCase()));
    change = {
      previousScore: previous.score,
      delta: score - previous.score,
      newCompetitors: (analysis.competitors ?? []).map((c) => c.title).filter((t) => !seen.has(t.trim().toLowerCase())),
    };
  }

  const report = await prisma.outlierReport.create({
    data: {
      projectId,
      source,
      score,
      marketGaps: analysis.marketGaps ?? [],
      competitorsJson: JSON.parse(JSON.stringify({ competitors: analysis.competitors ?? [], subscores: analysis.subscores, change })),
      rawSearchResults: { discovery, negative } as object,
      strategyMarkdown: analysis.strategyMarkdown,
    },
  });
  await prisma.project.update({ where: { id: projectId }, data: { niche, status: "researched" } });
  return { report, score, change };
}
