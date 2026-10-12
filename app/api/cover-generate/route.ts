import { NextRequest, NextResponse } from "next/server";
import { buildCoverPrompt, COVER_TEMPLATES, generateImage, type CoverTemplate } from "@/lib/gemini";
import { requireProject, requireUser } from "@/lib/auth";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      title?: string;
      subtitle?: string;
      author?: string;
      niche?: string;
      template?: CoverTemplate;
      kind?: "cover" | "promo";
    };
    await requireUser();
    const project = body.projectId ? await requireProject(body.projectId) : null;
    const niche = body.niche?.trim() || project?.niche;
    if (!niche) return apiError("niche is required", 400);

    const template = body.template && COVER_TEMPLATES.includes(body.template) ? body.template : "minimalist";
    const kind = body.kind === "promo" ? "promo" : "cover";
    const prompt = buildCoverPrompt({ niche, template, kind });
    const image = await generateImage(prompt, kind);

    return NextResponse.json({
      image: { mimeType: image.mimeType, dataUrl: `data:${image.mimeType};base64,${image.base64}` },
      prompt,
    });
  } catch (e) {
    return apiError(e);
  }
}
