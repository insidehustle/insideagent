import { prisma } from "./prisma";

/** Characters of reference excerpts sent per writing request. Groq's free tier allows ~8,000 tokens per request. */
const DEFAULT_BUDGET = Number(process.env.REFERENCE_CHAR_BUDGET) || 8000;
const CHUNK_SIZE = 1200;
const MAX_STORED_CHARS = 2_000_000;
/** Length of each excerpt when sampling across a whole document for the outline. */
const COVERAGE_SNIPPET = 450;

const STOPWORDS = new Set(
  "the and for are but not you your with that this from have has had was were will would can could should about into over than then them they their there what when where which who why how all any each more most other some such only own same too very just also its our out one two new use using chapter book".split(
    " ",
  ),
);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9']{3,}/g) ?? []).filter((w) => !STOPWORDS.has(w));
}

/** Paragraph-aware chunks of roughly CHUNK_SIZE characters. */
export function chunkText(text: string, size = CHUNK_SIZE): string[] {
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const para of text.split(/\n\s*\n/)) {
    if (para.length > size) {
      flush();
      for (let i = 0; i < para.length; i += size) chunks.push(para.slice(i, i + size).trim());
    } else if (current.length + para.length > size) {
      flush();
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  flush();
  return chunks.filter(Boolean);
}

interface Chunk {
  doc: string;
  index: number;
  /** Number of chunks in the whole document. */
  total: number;
  text: string;
  terms: Map<string, number>;
}

export interface ReferenceResult {
  /** Formatted excerpts ready to drop into a prompt; empty when the project has no usable documents. */
  block: string;
  /** Names of documents that contributed an excerpt. */
  sources: string[];
}

async function loadChunks(projectId: string) {
  const docs = await prisma.sourceDocument.findMany({
    where: { projectId, useForWriting: true },
    select: { name: true, text: true },
    orderBy: { createdAt: "asc" },
  });
  const chunks: Chunk[] = docs.flatMap((d) => {
    const parts = chunkText(d.text);
    return parts.map((text, index) => {
      const terms = new Map<string, number>();
      for (const t of tokenize(text)) terms.set(t, (terms.get(t) ?? 0) + 1);
      return { doc: d.name, index, total: parts.length, text, terms };
    });
  });
  return { docs, chunks };
}

function rank(chunks: Chunk[], query: string): Chunk[] {
  const queryTerms = [...new Set(tokenize(query))];
  const docFreq = (term: string) => chunks.reduce((n, c) => n + (c.terms.has(term) ? 1 : 0), 0);
  const idf = new Map(queryTerms.map((t) => [t, Math.log(1 + chunks.length / (1 + docFreq(t)))]));
  return chunks
    .map((c) => ({
      c,
      score: queryTerms.reduce((s, t) => s + Math.log(1 + (c.terms.get(t) ?? 0)) * (idf.get(t) ?? 0), 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
}

function format(picked: Chunk[]): ReferenceResult {
  // present in document order so excerpts read coherently
  const sorted = [...picked].sort((a, b) => (a.doc === b.doc ? a.index - b.index : a.doc.localeCompare(b.doc)));
  return {
    block: sorted.map((c) => `[Source: ${c.doc}, part ${c.index + 1} of ${c.total}]\n${c.text}`).join("\n\n"),
    sources: [...new Set(sorted.map((c) => c.doc))],
  };
}

/** Adds chunks in order until the budget is spent. The first chunk is always taken so the result is never empty. */
function fill(picked: Chunk[], candidates: Chunk[], budget: number, used = { n: 0 }) {
  for (const c of candidates) {
    if (picked.some((p) => p.doc === c.doc && p.index === c.index)) continue;
    if (used.n + c.text.length > budget && picked.length > 0) continue;
    picked.push(c);
    used.n += c.text.length;
    if (used.n >= budget) break;
  }
  return used;
}

/**
 * Picks the passages from the project's reference documents most relevant to `query`
 * (TF-IDF style keyword scoring) within a character budget. Falls back to the opening of each
 * document when nothing matches, so the model always sees the author's premise material.
 */
export async function getReferences(projectId: string, query: string, budget = DEFAULT_BUDGET): Promise<ReferenceResult> {
  const { docs, chunks } = await loadChunks(projectId);
  if (docs.length === 0) return { block: "", sources: [] };

  // fallback / top-up: opening chunks of each document, round-robin
  const openers: Chunk[] = [];
  for (let i = 0; i < 3; i++) {
    for (const d of docs) {
      const c = chunks.find((x) => x.doc === d.name && x.index === i);
      if (c) openers.push(c);
    }
  }
  const picked: Chunk[] = [];
  fill(picked, [...rank(chunks, query), ...openers], budget);
  return format(picked);
}

/**
 * For planning the whole book: samples evenly across every document (beginning, middle and end), so the
 * outline reflects all of the material rather than only the passages that match a keyword query.
 * Part of the budget is then spent on the passages most relevant to `query`.
 */
export async function getOutlineReferences(projectId: string, query: string, budget = DEFAULT_BUDGET): Promise<ReferenceResult> {
  const { docs, chunks } = await loadChunks(projectId);
  if (docs.length === 0) return { block: "", sources: [] };

  const picked: Chunk[] = [];
  const used = { n: 0 };
  const coverageBudget = Math.floor(budget * 0.7);
  const perDoc = Math.floor(coverageBudget / docs.length);

  for (const d of docs) {
    const own = chunks.filter((c) => c.doc === d.name);
    // short excerpts from many evenly spaced points, so the start, middle and end are all represented
    const want = Math.min(own.length, Math.max(3, Math.floor(perDoc / (COVERAGE_SNIPPET + 40))));
    const spread: Chunk[] = [];
    for (let i = 0; i < want; i++) {
      const c = own[Math.floor((i * own.length) / want)];
      spread.push({ ...c, text: c.text.length > COVERAGE_SNIPPET ? `${c.text.slice(0, COVERAGE_SNIPPET).trim()} ...` : c.text });
    }
    fill(picked, spread, used.n + perDoc + COVERAGE_SNIPPET, used);
  }
  fill(picked, rank(chunks, query), budget, used);
  return format(picked);
}

export async function getWritingInstructions(projectId: string): Promise<string> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { writingInstructions: true } });
  return p?.writingInstructions ?? "";
}

/** Stores an uploaded document, replacing an earlier upload of the same name. */
export async function saveDocument(projectId: string, name: string, text: string) {
  const stored = text.slice(0, MAX_STORED_CHARS);
  const existing = await prisma.sourceDocument.findFirst({ where: { projectId, name } });
  if (existing) {
    return prisma.sourceDocument.update({
      where: { id: existing.id },
      data: { text: stored, charCount: stored.length },
    });
  }
  return prisma.sourceDocument.create({
    data: { projectId, name, text: stored, charCount: stored.length },
  });
}
