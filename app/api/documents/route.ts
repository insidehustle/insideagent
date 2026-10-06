import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractText, MAX_UPLOAD_BYTES } from "@/lib/extract-text";
import { saveDocument } from "@/lib/references";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

const listSelect = { id: true, name: true, charCount: true, useForWriting: true, createdAt: true } as const;

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) return apiError("projectId is required", 400);
    const documents = await prisma.sourceDocument.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: listSelect,
    });
    return NextResponse.json({ documents });
  } catch (e) {
    return apiError(e);
  }
}

/** multipart/form-data: projectId, file (.txt, .md, .pdf). Stores the text for use when writing. */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const projectId = String(form.get("projectId") ?? "");
    const file = form.get("file");
    if (!projectId) return apiError("projectId is required", 400);
    if (!(file instanceof File)) return apiError("file is required", 400);
    if (file.size > MAX_UPLOAD_BYTES) return apiError("File exceeds the 10 MB limit", 413);
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return apiError("Project not found", 404);

    const text = (await extractText(file)).trim();
    if (!text) return apiError("No readable text found. Scanned PDFs need to be converted to text first.", 422);
    const doc = await saveDocument(projectId, file.name, text);
    return NextResponse.json({
      document: { id: doc.id, name: doc.name, charCount: doc.charCount, useForWriting: doc.useForWriting, createdAt: doc.createdAt },
    });
  } catch (e) {
    return apiError(e);
  }
}

/** Toggle whether a document is used when writing. */
export async function PATCH(req: NextRequest) {
  try {
    const { id, useForWriting } = (await req.json()) as { id?: string; useForWriting?: boolean };
    if (!id || typeof useForWriting !== "boolean") return apiError("id and useForWriting are required", 400);
    const document = await prisma.sourceDocument.update({ where: { id }, data: { useForWriting }, select: listSelect });
    return NextResponse.json({ document });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return apiError("id is required", 400);
    await prisma.sourceDocument.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
