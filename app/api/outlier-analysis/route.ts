import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { askLLMJson } from "@/lib/llm";
import { getBlueprintMarkdown } from "@/lib/markdown-store";
import {
  computeOutlierScore,
  evaluatorPrompt,
  scoreLabel,
  type OutlierAnalysis,
} from "@/lib/frameworks/outlier-evaluator";
import { extractText, MAX_UPLOAD_BYTES } from "@/lib/extract-text";
import { saveDocument } from "@/lib/references";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 180;

// Groq's free tier allows ~8,000 tokens per minute per request, so long manuscripts are sampled.
// Override with OUTLIER_MAX_INPUT_CHARS on a plan with higher limits.
const MAX_CHARS = Number(process.env.OUTLIER_MAX_INPUT_CHARS) || 14_000;

/** Start, middle and end of the text, so a long book is represented rather than just its opening. */
function sampleText(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const part = Math.floor(budget / 3);
  const mid = Math.floor(text.length / 2 - part / 2);
  return [text.slice(0, part), text.slice(mid, mid + part), text.slice(-part)].join("\n\n[... text omitted ...]\n\n");
}

/** Option A: manuscript/reference-file analysis. multipart/form-data: file, projectId, niche? */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const projectId = String(form.get("projectId") ?? "");
    if (!projectId) return apiError("projectId is required", 400);
    if (!(file instanceof File)) return apiError("file is required", 400);
    if (file.size > MAX_UPLOAD_BYTES) return apiError("File exceeds the 10 MB limit", 413);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return apiError("Project not found", 404);
    const niche = String(form.get("niche") ?? "").trim() || project.niche;

    const text = (await extractText(file)).trim();
    if (!text) return apiError("No readable text found in the file", 422);
    // keep the full text so the writing studio can draw on it later
    await saveDocument(projectId, file.name, text);
    const truncated = text.length > MAX_CHARS;
    const excerpt = sampleText(text, MAX_CHARS);

    const blueprint = await getBlueprintMarkdown(projectId);
    const analysis = await askLLMJson<OutlierAnalysis>(
      evaluatorPrompt({
        niche,
        blueprint,
        mode: "manuscript",
        evidence: `File: ${file.name}${truncated ? ` (sampled start, middle and end: ${MAX_CHARS} of ${text.length} characters)` : ""}\n\n${excerpt}`,
      }),
    );
    const score = computeOutlierScore(analysis.subscores);

    const report = await prisma.outlierReport.create({
      data: {
        projectId,
        source: `file:${file.name}`,
        score,
        marketGaps: analysis.marketGaps ?? [],
        competitorsJson: JSON.parse(JSON.stringify({ competitors: analysis.competitors ?? [], subscores: analysis.subscores })),
        strategyMarkdown: analysis.strategyMarkdown,
      },
    });
    return NextResponse.json({ report, label: scoreLabel(score), truncated });
  } catch (e) {
    return apiError(e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) return apiError("projectId is required", 400);
    const reports = await prisma.outlierReport.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        source: true,
        score: true,
        marketGaps: true,
        competitorsJson: true,
        strategyMarkdown: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ reports });
  } catch (e) {
    return apiError(e);
  }
}
