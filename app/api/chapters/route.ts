import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) return apiError("projectId is required", 400);
    const chapters = await prisma.chapter.findMany({ where: { projectId }, orderBy: { order: "asc" } });
    return NextResponse.json({ chapters });
  } catch (e) {
    return apiError(e);
  }
}

/** Delete every chapter of a project, so the outline can be regenerated. */
export async function DELETE(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) return apiError("projectId is required", 400);
    const { count } = await prisma.chapter.deleteMany({ where: { projectId } });
    return NextResponse.json({ deleted: count });
  } catch (e) {
    return apiError(e);
  }
}

/** Save manual edits and dictation notes. */
export async function PATCH(req: NextRequest) {
  try {
    const { id, content, title, dictationNotes, status, instructions, brief } = (await req.json()) as {
      id?: string;
      content?: string;
      title?: string;
      dictationNotes?: string;
      instructions?: string;
      brief?: string;
      status?: string;
    };
    if (!id) return apiError("id is required", 400);
    const chapter = await prisma.chapter.update({
      where: { id },
      data: {
        ...(content !== undefined && { content }),
        ...(title !== undefined && { title }),
        ...(dictationNotes !== undefined && { dictationNotes }),
        ...(status !== undefined && { status }),
        ...(instructions !== undefined && { instructions }),
        ...(brief !== undefined && { brief }),
      },
    });
    return NextResponse.json({ chapter });
  } catch (e) {
    return apiError(e);
  }
}
