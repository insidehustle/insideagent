import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runWebResearch } from "@/lib/research-run";
import { apiError } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 300;

// Each run costs search credits and LLM tokens (Groq free tier is rate limited), so cap projects per call.
const MAX_PER_RUN = Number(process.env.AUTO_RESEARCH_MAX_PER_RUN) || 3;

/**
 * Re-runs web research for projects with auto-research on that are due.
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`; anything else can call it the same way.
 */
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return apiError("CRON_SECRET is not set", 500);
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return apiError("Unauthorized", 401);

    const now = Date.now();
    const candidates = await prisma.project.findMany({
      where: { autoResearch: true },
      orderBy: { lastAutoResearchAt: { sort: "asc", nulls: "first" } },
    });
    // small tolerance so a daily cron is not skipped for firing a few minutes early
    const due = candidates
      .filter((p) => !p.lastAutoResearchAt || now - p.lastAutoResearchAt.getTime() >= p.autoResearchEveryDays * 86_400_000 - 30 * 60_000)
      .slice(0, MAX_PER_RUN);

    const results = [];
    for (const p of due) {
      try {
        const { score, change } = await runWebResearch(p.id, p.niche, "auto");
        results.push({ projectId: p.id, title: p.title, ok: true, score, change });
      } catch (e) {
        results.push({ projectId: p.id, title: p.title, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
      // stamp even on failure so one broken project does not block the queue on every run
      await prisma.project.update({ where: { id: p.id }, data: { lastAutoResearchAt: new Date() } });
    }
    return NextResponse.json({ checked: candidates.length, ran: results.length, results });
  } catch (e) {
    return apiError(e);
  }
}
