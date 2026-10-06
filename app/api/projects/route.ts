import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, getDefaultUser } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getDefaultUser();
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      include: {
        blueprint: { select: { id: true } },
        _count: { select: { chapters: true, outlierReports: true } },
      },
    });
    return NextResponse.json({ projects });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, niche } = (await req.json()) as { title?: string; niche?: string };
    if (!title?.trim() || !niche?.trim()) return apiError("title and niche are required", 400);
    const user = await getDefaultUser();
    const project = await prisma.project.create({
      data: { userId: user.id, title: title.trim(), niche: niche.trim() },
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}

/** Save the project's standing writing instructions. */
export async function PATCH(req: NextRequest) {
  try {
    const { id, writingInstructions, kind, bookBrief } = (await req.json()) as {
      id?: string;
      writingInstructions?: string;
      kind?: string;
      bookBrief?: string;
    };
    if (!id) return apiError("id is required", 400);
    if (writingInstructions === undefined && kind === undefined && bookBrief === undefined) return apiError("Nothing to update", 400);
    if (kind !== undefined && kind !== "fiction" && kind !== "nonfiction") return apiError("kind must be fiction or nonfiction", 400);
    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(writingInstructions !== undefined && { writingInstructions: writingInstructions.slice(0, 8000) }),
        ...(kind !== undefined && { kind }),
        ...(bookBrief !== undefined && { bookBrief: bookBrief.slice(0, 8000) }),
      },
    });
    return NextResponse.json({ project });
  } catch (e) {
    return apiError(e);
  }
}
