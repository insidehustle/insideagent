import { NextRequest, NextResponse } from "next/server";
import { askLLM, askLLMJson } from "@/lib/llm";
import { getBlueprintMarkdown } from "@/lib/markdown-store";
import { inlineEditPrompt } from "@/lib/frameworks/seven-step-narrative";
import { cleanProse } from "@/lib/anti-ai";
import { getCharactersBlock } from "@/lib/characters";
import { getReferences, getWritingInstructions } from "@/lib/references";
import { draftChapter, planOutline } from "@/lib/book-writer";
import { requireChapter, requireProject } from "@/lib/auth";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body =
  | { action: "outline"; projectId: string; chapterCount?: number; templateDocId?: string }
  | { action: "chapter"; chapterId: string; instruction?: string; wordTarget?: number }
  | { action: "edit"; projectId: string; selection: string; instruction: string; context?: string }
  | { action: "alternatives"; projectId: string; word: string; sentence: string };

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (body.action === "chapter") await requireChapter(body.chapterId);
    else if (body.projectId) await requireProject(body.projectId);

    if (body.action === "outline") {
      const chapters = await planOutline(body.projectId, { chapterCount: body.chapterCount, templateDocId: body.templateDocId });
      return NextResponse.json({ chapters });
    }

    if (body.action === "chapter") {
      const { chapter, sources, newNames } = await draftChapter(body.chapterId, { instruction: body.instruction, wordTarget: body.wordTarget });
      return NextResponse.json({ chapter, sources, newNames });
    }

    if (body.action === "edit") {
      if (!body.selection?.trim() || !body.instruction?.trim()) return apiError("selection and instruction are required", 400);
      const blueprint = await getBlueprintMarkdown(body.projectId);
      const instructions = await getWritingInstructions(body.projectId);
      const refs = await getReferences(body.projectId, `${body.selection} ${body.instruction}`, 3000);
      const characters = await getCharactersBlock(body.projectId, 1500);
      const text = await askLLM(
        inlineEditPrompt({
          blueprint,
          selection: body.selection,
          instruction: body.instruction,
          context: body.context,
          instructions,
          references: refs.block,
          characters,
        }),
        { maxTokens: 8000 },
      );
      return NextResponse.json({ text: cleanProse(text) });
    }

    if (body.action === "alternatives") {
      if (!body.word?.trim()) return apiError("word is required", 400);
      const { alternatives } = await askLLMJson<{ alternatives: string[] }>(
        `Suggest 6 replacements for the word "${body.word}" in this sentence. Each must fit the grammar and meaning of the sentence, and differ from the others in tone (plainer, stronger, softer, more specific). Single words or very short phrases only. Avoid cliches such as "delve", "unlock", "seamless", "robust".

Sentence: ${body.sentence}

Return JSON: {"alternatives": [string]}`,
        { maxTokens: 600 },
      );
      const cleaned = (alternatives ?? []).map((a) => String(a).trim()).filter((a) => a && a.toLowerCase() !== body.word.toLowerCase());
      return NextResponse.json({ alternatives: cleaned.slice(0, 8) });
    }

    return apiError("Unknown action", 400);
  } catch (e) {
    return apiError(e);
  }
}
