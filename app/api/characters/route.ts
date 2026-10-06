import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { detectCharacters, listCharacters } from "@/lib/characters";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) return apiError("projectId is required", 400);
    return NextResponse.json({ characters: await listCharacters(projectId) });
  } catch (e) {
    return apiError(e);
  }
}

/** { projectId, action: "detect" } scans documents and drafts; { projectId, name, role?, description? } adds one by hand. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      action?: "detect";
      name?: string;
      role?: string;
      description?: string;
      aliases?: string;
    };
    if (!body.projectId) return apiError("projectId is required", 400);

    if (body.action === "detect") {
      const result = await detectCharacters(body.projectId);
      return NextResponse.json(result);
    }

    const name = body.name?.trim();
    if (!name) return apiError("name is required", 400);
    const character = await prisma.character.upsert({
      where: { projectId_name: { projectId: body.projectId, name } },
      update: { role: body.role ?? "", description: body.description ?? "", aliases: body.aliases ?? "", source: "manual" },
      create: {
        projectId: body.projectId,
        name,
        role: body.role ?? "",
        description: body.description ?? "",
        aliases: body.aliases ?? "",
        source: "manual",
      },
    });
    return NextResponse.json({ character }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}

/** Editing a detected character marks it as yours so re-detection will not overwrite it. */
export async function PATCH(req: NextRequest) {
  try {
    const { id, name, role, description, aliases } = (await req.json()) as {
      id?: string;
      name?: string;
      role?: string;
      description?: string;
      aliases?: string;
    };
    if (!id) return apiError("id is required", 400);
    const character = await prisma.character.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(role !== undefined && { role }),
        ...(description !== undefined && { description }),
        ...(aliases !== undefined && { aliases }),
        source: "manual",
      },
    });
    return NextResponse.json({ character });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return apiError("id is required", 400);
    await prisma.character.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
