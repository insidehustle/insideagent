import { tavily } from "@tavily/core";
import { prisma } from "./prisma";
import { askLLMJson, MODEL_FAST } from "./llm";
import { youtubeId } from "./import-url";
import { requireEnv } from "./utils";

export interface YoutubeReference {
  videoId: string;
  url: string;
  title: string;
  snippet: string;
  /** Tavily relevance, 0-1 */
  score: number;
  /** The generated query that surfaced it */
  query: string;
}

/** Turns the book's brief, instructions, title and chapter plans into YouTube search queries. */
async function buildQueries(projectId: string, extra?: string): Promise<string[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { chapters: { orderBy: { order: "asc" }, take: 12, select: { title: true, brief: true } } },
  });
  if (!project) throw new Error("Project not found");

  const context = [
    `Title: ${project.title}`,
    `Niche: ${project.niche}`,
    project.bookBrief && `Book brief:\n${project.bookBrief.slice(0, 2500)}`,
    project.writingInstructions && `Writing instructions:\n${project.writingInstructions.slice(0, 1200)}`,
    project.chapters.length > 0 &&
      `Chapters:\n${project.chapters.map((c) => `- ${c.title}${c.brief ? `: ${c.brief.slice(0, 160)}` : ""}`).join("\n")}`,
    extra && `Extra focus: ${extra}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const out = await askLLMJson<{ queries?: string[] }>(
    `You find YouTube videos an author could use as research references for a book.
From the book details below, write 6 distinct YouTube search queries (3 to 8 words each) covering the book's core topic, its reader's biggest problems, and the main chapter themes. Phrase them the way a viewer would search. No quotes, no hashtags.

${context}

Return {"queries": ["...", "..."]}.`,
    { model: MODEL_FAST, maxTokens: 800 },
  );
  const queries = (out.queries ?? []).map((q) => String(q).trim()).filter(Boolean).slice(0, 6);
  if (!queries.length) throw new Error("Could not build search queries. Add a book brief or niche first.");
  return queries;
}

/** Searches YouTube (via Tavily, limited to youtube.com) for videos relevant to the book. */
export async function findYoutubeReferences(projectId: string, extra?: string) {
  const queries = await buildQueries(projectId, extra);
  const client = tavily({ apiKey: requireEnv("TAVILY_API_KEY") });

  const settled = await Promise.allSettled(
    queries.map(async (query) => {
      const res = await client.search(query, { maxResults: 8, searchDepth: "basic", includeDomains: ["youtube.com", "youtu.be"] });
      return res.results.map((r) => ({ r, query }));
    }),
  );
  if (settled.every((s) => s.status === "rejected")) {
    const reason = (settled[0] as PromiseRejectedResult).reason;
    throw new Error(`YouTube search failed: ${reason instanceof Error ? reason.message : String(reason)}`);
  }

  const byId = new Map<string, YoutubeReference>();
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    for (const { r, query } of s.value) {
      const videoId = youtubeId(r.url);
      if (!videoId) continue; // skip channel, playlist and search pages
      const prev = byId.get(videoId);
      if (prev && prev.score >= r.score) continue;
      byId.set(videoId, {
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: r.title.replace(/\s*-\s*YouTube$/i, ""),
        snippet: (r.content ?? "").slice(0, 280),
        score: r.score,
        query,
      });
    }
  }
  const videos = [...byId.values()].sort((a, b) => b.score - a.score).slice(0, 15);
  return { queries, videos };
}
