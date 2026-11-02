export interface SplitChapter {
  title: string;
  content: string;
}

export interface SplitResult {
  chapters: SplitChapter[];
  /** How the split was found, so the author can judge whether to trust it. */
  method: "headings" | "markdown" | "numbered" | "length";
}

const MAX_CHAPTERS = 300;
const FALLBACK_WORDS = 2500;
const NUMBER_WORDS = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty";
const CHAPTER_LINE = new RegExp(`^(chapter|ch\\.)\\s+(\\d{1,3}|[ivxlc]{1,7}|(?:${NUMBER_WORDS})(?:[\\s-]\\w+)?)\\b[\\s\\-–—:.]*(.*)$`, "i");
const MATTER_LINE = /^(prologue|epilogue|preface|foreword|introduction|afterword|conclusion|acknowledg(?:e)?ments|about the author|appendix(?:\s+[a-z0-9]+)?)\b[\s\-–—:.]*(.*)$/i;
const PART_LINE = /^(part|section|book)\s+(\d{1,3}|[ivxlc]{1,7}|(?:one|two|three|four|five|six|seven|eight|nine|ten))\b[\s\-–—:.]*(.*)$/i;
const NUMBERED_LINE = /^(\d{1,3}|[IVXL]{1,7})[.)]\s+(\S.{0,70})$/;
const MARKDOWN_LINE = /^(#{1,3})\s+(\S.*)$/;

const wordCount = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
const normalize = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const titleCase = (s: string) => s.replace(/\s+/g, " ").trim();

interface Heading {
  line: number;
  title: string;
  /** Lines the heading occupies (a lone "Chapter 3" also takes the subtitle line under it) */
  span: number;
}

/** A short line that can stand as a subtitle under a bare "Chapter 3". */
function subtitleAt(lines: string[], i: number): string | null {
  let j = i + 1;
  while (j < lines.length && !lines[j].trim()) j++;
  if (j - i > 3 || j >= lines.length) return null;
  const s = lines[j].trim();
  if (s.length > 70 || /[.!?,;]$/.test(s) || wordCount(s) > 10) return null;
  if (CHAPTER_LINE.test(s) || MATTER_LINE.test(s) || PART_LINE.test(s)) return null;
  return s;
}

/** A heading must stand alone: short, and set apart from the text around it. */
const isStandalone = (lines: string[], i: number) => lines[i].trim().length <= 90 && (i === 0 || !lines[i - 1].trim() || !lines[i + 1]?.trim());

function findHeadings(lines: string[], test: (line: string) => RegExpMatchArray | null, build: (m: RegExpMatchArray, sub: string | null) => string, wantSub: boolean): Heading[] {
  const out: Heading[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const m = test(line);
    if (!m || !isStandalone(lines, i)) continue;
    const bare = wantSub && !m[m.length - 1]?.trim();
    const sub = bare ? subtitleAt(lines, i) : null;
    out.push({ line: i, title: titleCase(build(m, sub)), span: sub ? lines.findIndex((l, k) => k > i && l.trim() === sub) - i + 1 : 1 });
  }
  return out;
}

function sectionsFrom(lines: string[], headings: Heading[]): SplitChapter[] {
  const sections: SplitChapter[] = [];
  const front = lines.slice(0, headings[0].line).join("\n").trim();
  if (wordCount(front) >= 40) sections.push({ title: "Front matter", content: front });
  headings.forEach((h, k) => {
    const end = k + 1 < headings.length ? headings[k + 1].line : lines.length;
    sections.push({ title: h.title, content: lines.slice(h.line + h.span, end).join("\n").trim() });
  });
  // a table of contents repeats the headings with nothing under them: drop those entries
  const later = (i: number, t: string) => sections.slice(i + 1).some((s) => `${normalize(s.title)} `.startsWith(`${normalize(t)} `));
  return sections.filter((s, i) => !(wordCount(s.content) < 8 && later(i, s.title)));
}

/** Last resort: cut at paragraph breaks into sections of roughly the same length. */
function byLength(text: string): SplitChapter[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const total = paras.reduce((n, p) => n + wordCount(p), 0);
  const count = Math.max(1, Math.round(total / FALLBACK_WORDS));
  const target = total / count;
  const chunks: string[] = [];
  let cur: string[] = [];
  let n = 0;
  for (const p of paras) {
    cur.push(p);
    n += wordCount(p);
    if (n >= target && chunks.length < count - 1) {
      chunks.push(cur.join("\n\n"));
      cur = [];
      n = 0;
    }
  }
  if (cur.length) chunks.push(cur.join("\n\n"));
  return chunks.map((content, i) => ({ title: `Part ${i + 1}`, content }));
}

/**
 * Splits a manuscript into chapters. Looks for headings in this order: markdown headings, "Chapter N" and
 * named front or back matter, "Part/Section N", then numbered titles. If none is found the text is cut into
 * even sections at paragraph breaks, which the author can then rename, split or merge.
 */
export function splitIntoChapters(raw: string): SplitResult {
  const text = raw.replace(/\r\n?/g, "\n").replace(/ /g, " ").trim();
  const lines = text.split("\n");

  const attempts: { method: SplitResult["method"]; find: () => Heading[] }[] = [
    {
      method: "markdown",
      find: () => {
        const all = findHeadings(lines, (l) => l.match(MARKDOWN_LINE), (m) => m[2].replace(/#+$/, ""), false);
        const levelOf = (h: Heading) => lines[h.line].trim().match(/^#+/)![0].length;
        const top = Math.min(...all.map(levelOf));
        return all.filter((h) => levelOf(h) === top);
      },
    },
    {
      method: "headings",
      find: () =>
        findHeadings(
          lines,
          (l) => l.match(CHAPTER_LINE) ?? l.match(MATTER_LINE),
          (m, sub) => {
            const isChapter = /^(chapter|ch\.)$/i.test(m[1]);
            const label = isChapter ? `Chapter ${m[2]}` : titleCase(m[1]).replace(/^./, (c) => c.toUpperCase());
            const rest = (isChapter ? m[3] : m[2])?.trim() || sub || "";
            return rest ? `${label}: ${rest}` : label;
          },
          true,
        ),
    },
    {
      method: "headings",
      find: () => findHeadings(lines, (l) => l.match(PART_LINE), (m, sub) => `${titleCase(m[1])} ${m[2]}${m[3]?.trim() || sub ? `: ${m[3]?.trim() || sub}` : ""}`, true),
    },
    {
      method: "numbered",
      find: () => findHeadings(lines, (l) => l.match(NUMBERED_LINE), (m) => `${m[1]}. ${m[2]}`, false),
    },
  ];

  for (const { method, find } of attempts) {
    const headings = find();
    // one heading is more likely a stray line than a structure
    // numbered lines are often just a list, so they need three
    if (headings.length < (method === "numbered" ? 3 : 2)) continue;
    const chapters = sectionsFrom(lines, headings).filter((c) => c.content || c.title);
    if (chapters.length >= 2) return { chapters: chapters.slice(0, MAX_CHAPTERS), method };
  }
  return { chapters: byLength(text).slice(0, MAX_CHAPTERS), method: "length" };
}
