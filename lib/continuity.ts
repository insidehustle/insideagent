import { prisma } from "./prisma";
import { askLLMJson } from "./llm";
import { getCharactersBlock, findNewNames } from "./characters";
import { classifyError, issueSummary } from "./errors";

export type ContinuityKind = "repetition" | "opening" | "length" | "names" | "contradiction" | "dropped_thread" | "promise_gap" | "pacing" | "empty";

export interface ContinuityIssue {
  kind: ContinuityKind;
  severity: "high" | "medium" | "low";
  /** Chapter numbers (order) the issue concerns */
  chapters: number[];
  description: string;
  suggestion: string;
  /** "scan" findings are exact; "ai" findings are the model's reading of a digest and should be checked */
  source: "scan" | "ai";
}

const STOP = new Set(
  "a an the and or but if so of to in on at by for with from as is are was were be been being it its this that these those he she they we you i his her their our your my me him them us not no do does did have has had will would can could should may might there here then than when while which who whom what into out up down over under again also just very more most some any each about after before".split(" "),
);

const words = (t: string) => t.toLowerCase().match(/[a-z0-9']+/g) ?? [];
const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/** Phrases of six or more words that appear in more than one chapter. */
function repeatedPhrases(chapters: { order: number; content: string }[]): ContinuityIssue[] {
  const N = 6;
  const seen = new Map<string, Set<number>>();
  for (const c of chapters) {
    const w = words(c.content);
    for (let i = 0; i + N <= w.length; i++) {
      const gram = w.slice(i, i + N);
      if (gram.filter((x) => STOP.has(x)).length > N - 3) continue; // mostly filler words
      const key = gram.join(" ");
      let set = seen.get(key);
      if (!set) seen.set(key, (set = new Set()));
      set.add(c.order);
    }
  }
  const isRepeated = (key: string) => (seen.get(key)?.size ?? 0) >= 2;

  // A long repeated passage matches as many overlapping six-word windows. Join consecutive matching windows into one
  // maximal passage, and report each passage once.
  const found: { phrase: string; orders: number[]; length: number }[] = [];
  const reported = new Set<string>();
  for (const c of chapters) {
    const w = words(c.content);
    let i = 0;
    while (i + N <= w.length) {
      if (!isRepeated(w.slice(i, i + N).join(" "))) {
        i++;
        continue;
      }
      let j = i;
      const orders = new Set<number>();
      const keys: string[] = [];
      while (j + N <= w.length && isRepeated(w.slice(j, j + N).join(" "))) {
        const key = w.slice(j, j + N).join(" ");
        keys.push(key);
        seen.get(key)!.forEach((o) => orders.add(o));
        j++;
      }
      if (!keys.some((k) => reported.has(k))) {
        keys.forEach((k) => reported.add(k));
        found.push({ phrase: w.slice(i, j + N - 1).join(" "), orders: [...orders].sort((a, b) => a - b), length: j - i + N - 1 });
      }
      i = j;
    }
  }
  found.sort((a, b) => b.orders.length - a.orders.length || b.length - a.length);

  const shorten = (phrase: string) => {
    const w = phrase.split(" ");
    return w.length > 24 ? `${w.slice(0, 24).join(" ")}…` : phrase;
  };
  return found.slice(0, 8).map((f) => ({
    kind: "repetition" as const,
    severity: f.orders.length >= 3 || f.length >= 25 ? ("medium" as const) : ("low" as const),
    chapters: f.orders,
    description: `This wording appears in chapters ${f.orders.join(", ")}: "${shorten(f.phrase)}"`,
    suggestion: "Keep it where it matters most and reword it elsewhere, unless the echo is deliberate.",
    source: "scan" as const,
  }));
}

function openings(chapters: { order: number; content: string }[]): ContinuityIssue[] {
  const byStart = new Map<string, number[]>();
  for (const c of chapters) {
    const start = words(c.content).slice(0, 5).join(" ");
    if (start.split(" ").length < 5) continue;
    byStart.set(start, [...(byStart.get(start) ?? []), c.order]);
  }
  return [...byStart.entries()]
    .filter(([, orders]) => orders.length >= 2)
    .map(([start, orders]) => ({
      kind: "opening" as const,
      severity: "medium" as const,
      chapters: orders,
      description: `Chapters ${orders.join(" and ")} open with the same words: "${start}…".`,
      suggestion: "Give each chapter its own opening so the reader feels the book moving forward.",
      source: "scan" as const,
    }));
}

function lengths(chapters: { order: number; content: string }[]): ContinuityIssue[] {
  const counts = chapters.map((c) => ({ order: c.order, n: wordCount(c.content) })).filter((c) => c.n > 0);
  if (counts.length < 3) return [];
  const sorted = counts.map((c) => c.n).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const out: ContinuityIssue[] = [];
  for (const c of counts) {
    if (c.n < median * 0.4) {
      out.push({ kind: "length", severity: "low", chapters: [c.order], source: "scan",
        description: `Chapter ${c.order} is ${c.n} words, much shorter than the typical ${median}.`,
        suggestion: "Check whether it needs more development, or merge it with a neighbouring chapter." });
    } else if (c.n > median * 2.2) {
      out.push({ kind: "length", severity: "low", chapters: [c.order], source: "scan",
        description: `Chapter ${c.order} is ${c.n} words, much longer than the typical ${median}.`,
        suggestion: "Consider splitting it at a natural turning point." });
    }
  }
  return out;
}

/** Cuts a chapter down to its opening and closing, which is what the model reads. */
const edges = (t: string, n = 500) => (t.length <= n * 2 + 40 ? t : `${t.slice(0, n)}\n[…]\n${t.slice(-n)}`);

interface AiIssue {
  type?: string;
  severity?: string;
  chapters?: number[];
  description?: string;
  suggestion?: string;
}

const AI_KINDS = new Set<ContinuityKind>(["contradiction", "dropped_thread", "promise_gap", "pacing", "repetition"]);

/**
 * Checks a project's drafted chapters for problems that cut across chapters. Exact scans (repeated phrases, repeated openings,
 * lopsided lengths, unknown names) always run. A model reads a compact digest (brief, opening and closing of each chapter)
 * for contradictions, dropped threads and unkept promises; if the model is unavailable the scan results are still returned.
 */
export async function checkContinuity(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { chapters: { orderBy: { order: "asc" } } },
  });
  if (!project) throw new Error("Project not found");
  const drafted = project.chapters.filter((c) => c.status !== "outline" && c.content.trim());
  if (drafted.length < 2) return { checked: drafted.length, issues: [] as ContinuityIssue[], ai: "skipped" as const, aiNote: "Draft at least two chapters to run a continuity check." };

  const issues: ContinuityIssue[] = [
    ...repeatedPhrases(drafted),
    ...openings(drafted),
    ...lengths(drafted),
  ];

  for (const c of project.chapters.filter((c) => c.status !== "outline" && !c.content.trim())) {
    issues.push({ kind: "empty", severity: "medium", chapters: [c.order], source: "scan", description: `Chapter ${c.order} is marked as written but has no text.`, suggestion: "Draft it, or set it back to an outline." });
  }

  const unknown = new Map<string, number[]>();
  for (const c of drafted) {
    for (const name of await findNewNames(projectId, c.content)) unknown.set(name, [...(unknown.get(name) ?? []), c.order]);
  }
  for (const [name, orders] of unknown) {
    issues.push({ kind: "names", severity: "low", chapters: orders, source: "scan",
      description: `"${name}" appears in chapters ${orders.join(", ")} but is not in your Characters list or documents.`,
      suggestion: "Add it to Characters if it is intended, or fix the spelling." });
  }

  // model reading of the digest
  let ai: "done" | "unavailable" = "done";
  let aiNote: string | undefined;
  try {
    const characters = await getCharactersBlock(projectId, 1500);
    let digest = drafted
      .map((c) => `### Chapter ${c.order}: ${c.title}\nPlan: ${(c.brief || "").slice(0, 500) || "(none)"}\n${edges(c.content)}`)
      .join("\n\n");
    if (digest.length > 28_000) digest = digest.slice(0, 28_000);

    const out = await askLLMJson<{ issues?: AiIssue[] }>(
      `You are a careful continuity editor reading a book in progress. Below is a digest: for each drafted chapter, its plan, then its opening and closing text ("[…]" marks the cut middle).

Book brief:
${project.bookBrief.slice(0, 2000) || "(none)"}

${characters ? `Known characters and people:\n${characters}\n` : ""}
Report ONLY problems you can support from the digest:
- contradiction: facts, names, timeline or claims that conflict between chapters
- dropped_thread: something promised, set up or asked in one chapter that later chapters never pick up
- promise_gap: a chapter's plan says it will cover something its text does not appear to
- pacing: the order of chapters or the flow between them is confusing
Do not invent problems, and do not flag things you cannot see because the middle was cut. If there are none, return an empty list. At most 10 issues.

${digest}

Return {"issues":[{"type":"contradiction|dropped_thread|promise_gap|pacing","severity":"high|medium|low","chapters":[chapter numbers],"description":"what is wrong, naming the chapters","suggestion":"how to fix it"}]}`,
      { maxTokens: 3000 },
    );
    for (const it of out.issues ?? []) {
      const kind = AI_KINDS.has(it.type as ContinuityKind) ? (it.type as ContinuityKind) : "pacing";
      if (!it.description) continue;
      issues.push({
        kind,
        severity: it.severity === "high" || it.severity === "low" ? it.severity : "medium",
        chapters: (Array.isArray(it.chapters) ? it.chapters : []).map(Number).filter((n) => Number.isFinite(n)),
        description: String(it.description).slice(0, 600),
        suggestion: String(it.suggestion ?? "").slice(0, 400),
        source: "ai",
      });
    }
  } catch (e) {
    ai = "unavailable";
    const issue = classifyError(e);
    aiNote = issue ? `The AI reading was skipped. ${issueSummary(issue)}` : "The AI reading was skipped because the model did not answer.";
  }

  const rank = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.chapters[0] ?? 0) - (b.chapters[0] ?? 0));
  return { checked: drafted.length, issues, ai, aiNote };
}
