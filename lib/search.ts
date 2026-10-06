import { tavily } from "@tavily/core";
import { requireEnv } from "./utils";

export interface SearchHit {
  title: string;
  url: string;
  content: string;
  score: number;
  query: string;
}

export function nicheQueries(niche: string) {
  return {
    discovery: [
      `best books on ${niche}`,
      `top books ${niche} review summary`,
      `${niche} book gaps standard frameworks`,
    ],
    // Negative-review mining: surface 1-3 star themes across web sources.
    negativeReviews: [
      `${niche} books 1 star 2 star 3 star reviews complaints`,
      `why ${niche} books disappoint readers too generic not practical outdated review`,
    ],
  };
}

async function runQueries(queries: string[], maxResults: number): Promise<SearchHit[]> {
  const client = tavily({ apiKey: requireEnv("TAVILY_API_KEY") });
  const settled = await Promise.allSettled(
    queries.map(async (query) => {
      const res = await client.search(query, { maxResults, searchDepth: "advanced" });
      return res.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
        query,
      }));
    }),
  );
  if (settled.every((s) => s.status === "rejected")) {
    const reason = (settled[0] as PromiseRejectedResult).reason;
    throw new Error(`Web search failed: ${reason instanceof Error ? reason.message : String(reason)}`);
  }
  const hits = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  const seen = new Set<string>();
  return hits.filter((h) => (seen.has(h.url) ? false : (seen.add(h.url), true)));
}

export async function researchNiche(niche: string) {
  const q = nicheQueries(niche);
  const [discovery, negative] = await Promise.all([runQueries(q.discovery, 6), runQueries(q.negativeReviews, 6)]);
  return { discovery, negative };
}
