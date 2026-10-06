import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { askLLMJson, MODEL_WRITER } from "@/lib/llm";
import { getBlueprintMarkdown } from "@/lib/markdown-store";
import { getWritingInstructions } from "@/lib/references";
import { ANTI_AI_SOCIAL_RULES, findAiTells, sanitizeSocialText } from "@/lib/anti-ai";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 120;

type Platform = "linkedin" | "x";

const PLATFORM_BRIEF: Record<Platform, string> = {
  linkedin: "LinkedIn posts: 900 to 1,500 characters, short paragraphs separated by blank lines, a standalone first line hook, ends with one concrete takeaway or a genuine question.",
  x: "X posts: each under 270 characters. Make 1 single post for each idea, plus one optional thread of 5 to 7 numbered posts if the chapter supports it (kind: thread).",
};

interface Post {
  kind: "post" | "thread";
  text: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      chapterId?: string;
      text?: string;
      projectId?: string;
      platform?: Platform;
      count?: number;
    };
    const platform: Platform = body.platform === "x" ? "x" : "linkedin";
    const count = Math.min(Math.max(body.count ?? 3, 1), 6);

    let source = body.text?.trim() ?? "";
    let projectId = body.projectId;
    if (body.chapterId) {
      const chapter = await prisma.chapter.findUnique({ where: { id: body.chapterId } });
      if (!chapter) return apiError("Chapter not found", 404);
      source = chapter.content;
      projectId = chapter.projectId;
    }
    if (!source) return apiError("Provide a chapterId or text to repurpose", 400);

    const blueprint = projectId ? await getBlueprintMarkdown(projectId) : "";
    const standing = projectId ? await getWritingInstructions(projectId) : "";
    const { posts } = await askLLMJson<{ posts: Post[] }>(
      `Turn the source text into ${count} distinct, ready-to-publish social posts.

Platform: ${PLATFORM_BRIEF[platform]}

Author voice (follow its Voice Rules):
${blueprint || "(none provided; write plainly and directly)"}

${standing.trim() ? `Author's standing instructions (follow them unless they conflict with the formatting rules below):\n${standing.trim()}\n\n` : ""}${ANTI_AI_SOCIAL_RULES}

Each post must make a different point from the source. Use only ideas present in the source.

Source text:
"""
${source.slice(0, 30000)}
"""

Return a JSON object: { "posts": [{ "kind": "post" | "thread", "text": string }] }.`,
      { model: MODEL_WRITER, maxTokens: 8000 },
    );
    if (!Array.isArray(posts)) return apiError("Model returned an unexpected format", 502);

    const cleaned = posts.map((p) => {
      const text = sanitizeSocialText(String(p.text ?? ""));
      return { kind: p.kind === "thread" ? "thread" : "post", text, tells: findAiTells(text), characters: text.length };
    });
    return NextResponse.json({ platform, posts: cleaned });
  } catch (e) {
    return apiError(e);
  }
}
