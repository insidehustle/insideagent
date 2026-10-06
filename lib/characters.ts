import { prisma } from "./prisma";
import { askLLMJson } from "./llm";

const NOT_NAMES = new Set(
  "monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december chapter part section book mr mrs ms dr sir lady lord god english american european african asian christmas easter internet aunt uncle mom dad mother father captain officer deputy detective sheriff professor doctor grandma grandpa miss".split(
    " ",
  ),
);

export interface NameCandidate {
  name: string;
  count: number;
}

/**
 * Finds likely proper names across the whole text, however long. A capitalized word is a
 * candidate when its lowercase form never appears (so "The" and "Light" are filtered out but "Maria" is kept)
 * and it occurs at least twice. Works on the full text, not a sample, so characters that appear
 * late in a long manuscript are still found.
 */
export function findNameCandidates(text: string, limit = 20): NameCandidate[] {
  const lowercaseOccurrences = new Map<string, number>();
  for (const m of text.matchAll(/(?<![A-Za-z])[a-z][a-z'-]{2,}/g)) {
    lowercaseOccurrences.set(m[0], (lowercaseOccurrences.get(m[0]) ?? 0) + 1);
  }
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/(?<![A-Za-z'])[A-Z][a-z]{2,}(?:['-][A-Za-z]+)?/g)) {
    const word = m[0];
    const key = word.toLowerCase();
    if (NOT_NAMES.has(key)) continue;
    // a word that also appears in lowercase is an ordinary word, not a name
    if ((lowercaseOccurrences.get(key) ?? 0) > 0) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

/** Up to `perName` short passages around the mentions of each candidate, within a character budget. */
function gatherSnippets(text: string, names: string[], budget: number, perName = 3): string {
  const per = Math.floor(budget / Math.max(names.length, 1));
  const out: string[] = [];
  for (const name of names) {
    const found: string[] = [];
    let used = 0;
    let from = 0;
    while (found.length < perName && used < per) {
      const idx = text.indexOf(name, from);
      if (idx === -1) break;
      const snippet = text.slice(Math.max(0, idx - 140), idx + 220).replace(/\s+/g, " ").trim();
      found.push(snippet);
      used += snippet.length;
      // jump ahead so snippets come from different parts of the text
      from = idx + Math.max(400, Math.floor(text.length / (perName + 1)));
    }
    if (found.length) out.push(`## ${name}\n${found.map((s) => `- ...${s}...`).join("\n")}`);
  }
  return out.join("\n\n");
}

interface Detected {
  name: string;
  role?: string;
  description?: string;
  aliases?: string[] | string;
}

/** Everything the project knows in text form: reference documents plus drafted chapters. */
async function projectText(projectId: string): Promise<string> {
  const [docs, chapters] = await Promise.all([
    prisma.sourceDocument.findMany({ where: { projectId, useForWriting: true }, select: { text: true } }),
    prisma.chapter.findMany({ where: { projectId, status: { not: "outline" } }, select: { content: true }, orderBy: { order: "asc" } }),
  ]);
  return [...docs.map((d) => d.text), ...chapters.map((c) => c.content)].join("\n\n");
}

/**
 * Detects characters in the project's documents and drafted chapters and saves them.
 * Existing characters you wrote or edited by hand are never overwritten.
 */
export async function detectCharacters(projectId: string) {
  const text = await projectText(projectId);
  if (!text.trim()) throw new Error("Upload a reference document or draft a chapter first, so there is text to read.");

  const candidates = findNameCandidates(text);
  if (candidates.length === 0) return { characters: await listCharacters(projectId), found: 0, added: 0 };

  const snippets = gatherSnippets(text, candidates.map((c) => c.name), 9000);
  const result = await askLLMJson<{ characters: Detected[] }>(
    `Below are capitalized names found in a manuscript, each with passages where it appears (with how often it appears).

Candidate names and mention counts: ${candidates.map((c) => `${c.name} (${c.count})`).join(", ")}

${snippets}

Decide which candidates are characters (people, or animals or entities that act as characters). Exclude places, organizations, brands, titles and ordinary words.
If two candidates are the same person (a first name and a full name, or a nickname), merge them into one entry and list the other names in "aliases".
Use only what the passages show. Do not invent facts.

Return JSON: {"characters": [{"name": string, "role": string (e.g. protagonist, antagonist, supporting, narrator, mentioned), "description": string (1 to 2 sentences: who they are, notable traits, and relationships to other characters), "aliases": [string]}]}`,
    { maxTokens: 4000 },
  );

  const existing = await prisma.character.findMany({ where: { projectId } });
  const byName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));
  let added = 0;
  for (const d of result.characters ?? []) {
    const name = String(d.name ?? "").trim();
    if (!name) continue;
    const aliases = Array.isArray(d.aliases) ? d.aliases.join(", ") : String(d.aliases ?? "");
    const current = byName.get(name.toLowerCase());
    if (!current) {
      await prisma.character.create({
        data: { projectId, name, role: String(d.role ?? ""), description: String(d.description ?? ""), aliases, source: "detected" },
      });
      added++;
    } else if (current.source === "detected") {
      await prisma.character.update({
        where: { id: current.id },
        data: { role: String(d.role ?? current.role), description: String(d.description ?? current.description), aliases },
      });
    }
  }
  return { characters: await listCharacters(projectId), found: result.characters?.length ?? 0, added };
}

export function listCharacters(projectId: string) {
  return prisma.character.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } });
}

/** Canon block for writing prompts. Empty when the project has no characters. */
export async function getCharactersBlock(projectId: string, budget = 3000): Promise<string> {
  const chars = await listCharacters(projectId);
  const lines: string[] = [];
  let used = 0;
  for (const c of chars) {
    const line = `- ${c.name}${c.role ? ` (${c.role})` : ""}${c.aliases ? `, also called ${c.aliases}` : ""}: ${c.description}`.trim();
    if (used + line.length > budget) break;
    lines.push(line);
    used += line.length;
  }
  return lines.join("\n");
}

/**
 * Names in a fresh draft that are neither known characters nor present in the reference material.
 * A cheap continuity check: these may be invented characters the author did not ask for.
 * Only plain prose is scanned (headings, lists and bold text are skipped, since Title Case words
 * there are not names), and a name must appear at least twice to be reported.
 */
export async function findNewNames(projectId: string, draft: string): Promise<string[]> {
  const [chars, docs] = await Promise.all([
    listCharacters(projectId),
    prisma.sourceDocument.findMany({ where: { projectId, useForWriting: true }, select: { text: true } }),
  ]);
  const known = new Set<string>();
  for (const c of chars) {
    for (const part of `${c.name} ${c.aliases}`.split(/[\s,]+/)) if (part) known.add(part.toLowerCase());
  }
  const reference = docs.map((d) => d.text).join("\n").toLowerCase();
  const prose = draft
    .split("\n")
    .filter((l) => !/^\s*(#|[-*>]|\d+\.)/.test(l) && !l.includes("**"))
    .join("\n");

  const counts = new Map<string, number>();
  for (const m of prose.matchAll(/(?<![A-Za-z'])[A-Z][a-z]{2,}\b/g)) counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
  // names are capitalized mid-sentence at least once; words like "Maybe" only ever open a sentence or a quote
  const midSentence = new Set<string>();
  for (const m of prose.matchAll(/(?<=[a-z,;]\s)[A-Z][a-z]{2,}\b/g)) midSentence.add(m[0]);

  const found: string[] = [];
  for (const [word, count] of counts) {
    const key = word.toLowerCase();
    if (count < 2 || !midSentence.has(word) || NOT_NAMES.has(key) || known.has(key) || reference.includes(key)) continue;
    if (new RegExp(`(?<![A-Za-z])${key}(?![A-Za-z])`).test(prose)) continue; // also written in lowercase: an ordinary word
    found.push(word);
  }
  return found.slice(0, 8);
}
