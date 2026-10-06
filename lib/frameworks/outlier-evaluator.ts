export interface OutlierSubscores {
  /** 0-100: how underserved the reader's pain is by current top books */
  gapSeverity: number;
  /** 0-100: evidence of buyer demand */
  demandSignal: number;
  /** 0-100: how weak, dated or generic the top competitors are */
  competitorWeakness: number;
  /** 0-100: fit between the author's blueprint and the gaps */
  authorFit: number;
  /** 0-100: how well the niche monetizes beyond book sales */
  monetizationPotential: number;
}

export const WEIGHTS: Record<keyof OutlierSubscores, number> = {
  gapSeverity: 0.3,
  demandSignal: 0.2,
  competitorWeakness: 0.2,
  authorFit: 0.2,
  monetizationPotential: 0.1,
};

const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

/** Deterministic outlier score (1-100) from model-assessed sub-scores. */
export function computeOutlierScore(sub: OutlierSubscores): number {
  const total = (Object.keys(WEIGHTS) as (keyof OutlierSubscores)[]).reduce(
    (sum, k) => sum + clamp(Number(sub[k])) * WEIGHTS[k],
    0,
  );
  return Math.max(1, Math.min(100, Math.round(total)));
}

export function scoreLabel(score: number) {
  if (score >= 80) return "Strong outlier opportunity";
  if (score >= 60) return "Promising, with sharp positioning";
  if (score >= 40) return "Crowded or unproven";
  return "Weak opportunity";
}

export interface Competitor {
  title: string;
  author?: string | null;
  positioning: string;
  weakness: string;
  sourceUrl?: string | null;
}

export interface OutlierAnalysis {
  subscores: OutlierSubscores;
  marketGaps: string[];
  competitors: Competitor[];
  strategyMarkdown: string;
}

export function evaluatorPrompt(args: {
  niche: string;
  blueprint: string;
  evidence: string;
  mode: "web" | "manuscript";
}) {
  return `You are a book-market analyst. ${
    args.mode === "web" ? "Analyze live web research" : "Analyze the uploaded manuscript or reference material"
  } for the niche "${args.niche}".

Author blueprint:
${args.blueprint || "(none provided)"}

Evidence:
${args.evidence}

Rules:
- Base competitor titles, claims and complaints ONLY on the evidence above. If a book title is not in the evidence, do not list it. Fewer real competitors beats invented ones.
- Treat 1-3 star review themes and complaint language as the strongest signal of market gaps.
- Sub-scores are integers 0-100 and must be justified by the evidence, not optimism.

Return JSON with this exact shape:
{
  "subscores": { "gapSeverity": n, "demandSignal": n, "competitorWeakness": n, "authorFit": n, "monetizationPotential": n },
  "marketGaps": [string, ... 4 to 8 specific positioning gaps],
  "competitors": [{ "title": string, "author": string|null, "positioning": string, "weakness": string, "sourceUrl": string|null }],
  "strategyMarkdown": "Market Gap Strategy Report in Markdown with sections: Summary, Top Competitors, Gaps, Recommended Positioning, Title and Angle Ideas, Risks"
}`;
}
