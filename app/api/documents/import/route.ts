import { NextRequest, NextResponse } from "next/server";
import { saveDocument } from "@/lib/references";
import { importFromUrl } from "@/lib/import-url";
import { requireProject } from "@/lib/auth";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * JSON body: { projectId, url } imports a YouTube transcript or web page;
 * { projectId, name, text } saves text directly (e.g. a competitor summary from Research).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { projectId?: string; url?: string; name?: string; text?: string };
    if (!body.projectId) return apiError("projectId is required", 400);
    await requireProject(body.projectId);

    let name: string;
    let text: string;
    if (body.url) {
      ({ name, text } = await importFromUrl(body.url.trim()));
    } else if (body.name && body.text) {
      name = body.name.slice(0, 120);
      text = body.text;
    } else {
      return apiError("Provide a url, or a name and text", 400);
    }
    const doc = await saveDocument(body.projectId, name, text.trim());
    return NextResponse.json({ document: { id: doc.id, name: doc.name, charCount: doc.charCount, useForWriting: doc.useForWriting } });
  } catch (e) {
    return apiError(e);
  }
}
