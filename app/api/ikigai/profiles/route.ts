import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { saveBlueprint } from "@/lib/markdown-store";
import { apiError, getDefaultUser } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getDefaultUser();
    const profiles = await prisma.authorProfile.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, updatedAt: true },
    });
    return NextResponse.json({ profiles });
  } catch (e) {
    return apiError(e);
  }
}

/** Save the project's current blueprint as a named profile (replaces a profile with the same name). */
export async function POST(req: NextRequest) {
  try {
    const { projectId, name } = (await req.json()) as { projectId?: string; name?: string };
    if (!projectId) return apiError("projectId is required", 400);
    const profileName = name?.trim();
    if (!profileName) return apiError("Give the profile a name", 400);
    const bp = await prisma.authorBlueprint.findUnique({ where: { projectId } });
    if (!bp) return apiError("Generate this project's blueprint first", 404);

    const user = await getDefaultUser();
    const data = {
      loves: bp.loves,
      goodAt: bp.goodAt,
      marketNeeds: bp.marketNeeds,
      monetization: bp.monetization,
      stories: bp.stories,
      reader: bp.reader,
      voiceSample: bp.voiceSample,
      avoid: bp.avoid,
      markdownContent: bp.markdownContent,
      voiceRules: bp.voiceRules,
    };
    const profile = await prisma.authorProfile.upsert({
      where: { userId_name: { userId: user.id, name: profileName } },
      update: data,
      create: { userId: user.id, name: profileName, ...data },
      select: { id: true, name: true, updatedAt: true },
    });
    return NextResponse.json({ profile });
  } catch (e) {
    return apiError(e);
  }
}

/** Copy a saved profile into a project. The project gets its own copy, so later edits do not change the profile. */
export async function PUT(req: NextRequest) {
  try {
    const { projectId, profileId } = (await req.json()) as { projectId?: string; profileId?: string };
    if (!projectId || !profileId) return apiError("projectId and profileId are required", 400);
    const user = await getDefaultUser();
    const profile = await prisma.authorProfile.findFirst({ where: { id: profileId, userId: user.id } });
    if (!profile) return apiError("Profile not found", 404);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return apiError("Project not found", 404);

    const { markdownContent, name: _name, id: _id, userId: _u, updatedAt: _t, voiceRules: _v, ...answers } = profile;
    const blueprint = await saveBlueprint(projectId, answers, markdownContent);
    return NextResponse.json({ blueprint });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return apiError("id is required", 400);
    const user = await getDefaultUser();
    const { count } = await prisma.authorProfile.deleteMany({ where: { id, userId: user.id } });
    if (count === 0) return apiError("Profile not found", 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
