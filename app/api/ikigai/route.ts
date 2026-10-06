import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { askLLM } from "@/lib/llm";
import { saveBlueprint, updateBlueprintMarkdown, type BlueprintInput } from "@/lib/markdown-store";
import { cleanProse } from "@/lib/anti-ai";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 120;

function blueprintPrompt(input: BlueprintInput, title: string, niche: string) {
  return `Create an author_blueprint.md for a non-fiction author using the Ikigai framework.

Book: "${title}" (niche: ${niche})

What the author loves:
${input.loves}

What the author is good at:
${input.goodAt}

What the market or world needs:
${input.marketNeeds}

What people will pay for:
${input.monetization}

Write the blueprint in Markdown with exactly these sections, in this order:
# Author Blueprint
## Ikigai Synthesis (where the four circles overlap, in 1 short paragraph)
## Positioning Statement (one sentence: who I help, to do what, how I'm different)
## Core Themes (3 to 5 bullets)
## Proof and Stories (only what the author actually said; list gaps as [AUTHOR: add ...])
## Monetization Path (book plus what it feeds into)
## Voice Rules (6 to 10 bullets, each a concrete, checkable writing rule derived from how the author expresses themselves)
## Words and Moves to Avoid (bullets)

Use only information the author provided. Do not invent credentials, numbers or stories.`;
}

/** Create or regenerate the blueprint from the four Ikigai pillars. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<BlueprintInput> & { projectId?: string };
    const { projectId, loves, goodAt, marketNeeds, monetization } = body;
    if (!projectId) return apiError("projectId is required", 400);
    if (![loves, goodAt, marketNeeds, monetization].every((v) => v?.trim()))
      return apiError("All four Ikigai pillars are required", 400);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return apiError("Project not found", 404);

    const input = {
      loves: loves!.trim(),
      goodAt: goodAt!.trim(),
      marketNeeds: marketNeeds!.trim(),
      monetization: monetization!.trim(),
    };
    const markdown = cleanProse(await askLLM(blueprintPrompt(input, project.title, project.niche)));
    const blueprint = await saveBlueprint(projectId, input, markdown);
    return NextResponse.json({ blueprint });
  } catch (e) {
    return apiError(e);
  }
}

/** Dynamic context update: persist the author's edits to author_blueprint.md. */
export async function PUT(req: NextRequest) {
  try {
    const { projectId, markdownContent } = (await req.json()) as { projectId?: string; markdownContent?: string };
    if (!projectId || typeof markdownContent !== "string") return apiError("projectId and markdownContent are required", 400);
    const existing = await prisma.authorBlueprint.findUnique({ where: { projectId } });
    if (!existing) return apiError("No blueprint exists for this project yet", 404);
    const blueprint = await updateBlueprintMarkdown(projectId, markdownContent);
    return NextResponse.json({ blueprint });
  } catch (e) {
    return apiError(e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) return apiError("projectId is required", 400);
    const blueprint = await prisma.authorBlueprint.findUnique({ where: { projectId } });
    return NextResponse.json({ blueprint });
  } catch (e) {
    return apiError(e);
  }
}
