import { fictionChapterPrompt, fictionOutlinePrompt, type BookKind } from "./fiction";

export interface NarrativeStep {
  order: number;
  key: string;
  name: string;
  purpose: string;
  guidance: string;
}

export const SEVEN_STEPS: NarrativeStep[] = [
  {
    order: 1,
    key: "hook",
    name: "Pattern Interruption / Hook",
    purpose: "Break the reader's autopilot in the first lines.",
    guidance: "Open with a surprising fact, counterintuitive claim, or a vivid scene. No throat clearing, no definitions.",
  },
  {
    order: 2,
    key: "mirroring",
    name: "Audience Recognition (Mirroring)",
    purpose: "Make the reader feel seen.",
    guidance: "Describe the reader's situation, frustration and private thoughts in their own words so they think 'this is about me'.",
  },
  {
    order: 3,
    key: "opportunity",
    name: "Opportunity Reveal",
    purpose: "Show that a better outcome is available.",
    guidance: "Name the opening the reader has not noticed. Keep it concrete and believable, not hype.",
  },
  {
    order: 4,
    key: "gap",
    name: "Exposing the Gap / Curiosity Trigger",
    purpose: "Show why the usual approach fails and open a curiosity loop.",
    guidance: "Point at what standard advice misses. Raise a question the chapter will answer.",
  },
  {
    order: 5,
    key: "transformation",
    name: "Promised Transformation",
    purpose: "State what the reader will be able to do by the end.",
    guidance: "Specific, measurable, honest. Before and after, with no guarantees you cannot back up.",
  },
  {
    order: 6,
    key: "authority",
    name: "Establishing Authority",
    purpose: "Earn the right to teach this.",
    guidance: "Use the author's real story, results and scars from the author blueprint. Proof over credentials.",
  },
  {
    order: 7,
    key: "transition",
    name: "Seamless Transition to Chapter Core",
    purpose: "Hand the reader into the main teaching without a seam.",
    guidance: "End the opening on a line that makes the first core section feel like the obvious next sentence.",
  },
];

export const NARRATIVE_FRAMEWORK_PROMPT = SEVEN_STEPS.map(
  (s) => `${s.order}. ${s.name}: ${s.purpose} ${s.guidance}`,
).join("\n");

export const ANTI_AI_RULES_SHORT = `Style rules: plain, specific language. Avoid em dashes and hyphens used as pauses. Avoid cliches such as "delve", "unlock", "game-changer", "in today's fast-paced world", "tapestry", "journey" as a metaphor, and the "It's not X, it's Y" pattern. Do not open with "Imagine", "Picture this" or a rhetorical question. Do not use "Moreover", "Furthermore", "seamless", "robust" or "crucial". No exclamation marks.`;

/** Standing instructions and uploaded reference excerpts, formatted for any writing prompt. */
export function guidanceBlocks(args: { instructions?: string; references?: string; characters?: string; bookBrief?: string }) {
  return [
    args.bookBrief?.trim()
      ? `Book brief (the plan for the whole book). Keep this work consistent with it:
${args.bookBrief.trim()}`
      : "",
    args.characters?.trim()
      ? `Characters (canon). Keep every character's name, traits, relationships and way of speaking consistent with this list. Do not introduce new named characters unless the instructions ask for them.
${args.characters.trim()}`
      : "",
    args.instructions?.trim()
      ? `Standing instructions from the author. These override your defaults and must be followed in everything you write:
${args.instructions.trim()}`
      : "",
    args.references?.trim()
      ? `Reference material the author uploaded. Draw on it for ideas, facts, terminology and structure, and stay consistent with it. Paraphrase rather than copy; quote at most one sentence and attribute it to its source. Do not attribute a claim to a source unless the excerpt supports it. If the excerpts do not cover something, do not invent it.

${args.references.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** guidanceBlocks plus a trailing blank line, or nothing when there is no guidance. */
function guidanceSection(args: { instructions?: string; references?: string; characters?: string; bookBrief?: string }) {
  const g = guidanceBlocks(args);
  return g ? `${g}\n\n` : "";
}

export function stepByOrder(order: number) {
  return SEVEN_STEPS.find((s) => s.order === order);
}

export function outlinePrompt(args: {
  title: string;
  niche: string;
  blueprint: string;
  chapterCount: number;
  marketGaps: string[];
  instructions?: string;
  references?: string;
  characters?: string;
  kind?: BookKind;
}) {
  if (args.kind === "fiction") {
    return fictionOutlinePrompt({
      title: args.title,
      niche: args.niche,
      blueprint: args.blueprint,
      chapterCount: args.chapterCount,
      guidance: guidanceBlocks(args),
    });
  }
  return `Plan a non-fiction book.

Title: ${args.title}
Niche: ${args.niche}
Number of chapters: ${args.chapterCount}

Market gaps to exploit:
${args.marketGaps.length ? args.marketGaps.map((g) => `- ${g}`).join("\n") : "- (no research run yet; infer sensible positioning)"}

Author blueprint (voice, strengths, monetization):
${args.blueprint || "(none provided)"}

${guidanceSection(args)}

Every chapter opens using this 7-step narrative framework:
${NARRATIVE_FRAMEWORK_PROMPT}

Ground the plan in the reference material above. Each excerpt is labelled [Source: <document name>, part X of Y]. Build chapters around the ideas, stories, frameworks and facts those documents contain, and follow the author's own structure if the documents propose one.

Return a JSON object with two keys:
- "bookBrief": string, Markdown, 120 to 200 words: the book's premise, who it is for, the promise to the reader, how the chapters build on each other, and which documents it draws on
- "chapters": an array of ${args.chapterCount} ordered objects, each with:
  - "title": string (specific, benefit-led, not generic)
  - "frameworkStep": integer 1-7, the framework step this chapter's opening should lean on hardest
  - "summary": string, 2-3 sentences describing the chapter's core teaching and promised transformation
  - "keyPoints": array of 3 to 5 specific points, facts, stories or ideas the chapter must cover, taken from the reference material where possible
  - "characters": array of names of real people or characters involved ([] if none)
  - "sources": array of document names, exactly as they appear in the [Source: ...] labels, that this chapter draws on ([] if no document covers it). Never invent a document name.`;
}

export function chapterPrompt(args: {
  bookTitle: string;
  niche: string;
  blueprint: string;
  chapterTitle: string;
  chapterOrder: number;
  summary?: string;
  priorTitles: string[];
  /** Last lines of the previous chapter, so this one continues from it. */
  previousEnding?: string;
  dictationNotes?: string | null;
  instruction?: string;
  wordTarget: number;
  instructions?: string;
  references?: string;
  characters?: string;
  bookBrief?: string;
  kind?: BookKind;
}) {
  if (args.kind === "fiction") {
    return fictionChapterPrompt({
      bookTitle: args.bookTitle,
      niche: args.niche,
      blueprint: args.blueprint,
      chapterTitle: args.chapterTitle,
      chapterOrder: args.chapterOrder,
      summary: args.summary,
      priorTitles: args.priorTitles,
      previousEnding: args.previousEnding,
      dictationNotes: args.dictationNotes,
      instruction: args.instruction,
      guidance: guidanceBlocks(args),
      wordTarget: args.wordTarget,
      styleRules: ANTI_AI_RULES_SHORT,
    });
  }
  return `Write chapter ${args.chapterOrder} of the book "${args.bookTitle}" (niche: ${args.niche}).

Chapter title: ${args.chapterTitle}
${args.summary ? `Chapter brief: ${args.summary}\n` : ""}Chapters before this one: ${args.priorTitles.length ? args.priorTitles.join("; ") : "none"}
${args.previousEnding ? `How the previous chapter ended (continue naturally from it, do not repeat it):
"""
${args.previousEnding}
"""
` : ""}

Author blueprint. Match this voice and use only this person's real experience:
${args.blueprint || "(none provided)"}

${args.dictationNotes ? `Author's own dictated notes. Preserve their ideas, stories and phrasing wherever possible:\n${args.dictationNotes}\n\n` : ""}${args.instruction ? `Instruction for this chapter (follow it): ${args.instruction}\n\n` : ""}${guidanceSection(args)}Structure the chapter's opening with the 7-step narrative framework, in order, using each step as a short passage without labelling the steps in the text:
${NARRATIVE_FRAMEWORK_PROMPT}

Then write the core teaching: clear sections with ## subheadings, concrete examples, and a short action step at the end.
Target about ${args.wordTarget} words. Output Markdown only, starting with "# ${args.chapterTitle}".

Do not invent facts, statistics, quotes or client stories. If a story is needed and the blueprint or notes do not supply one, write a clearly marked placeholder like [AUTHOR: add your story about ...].
${ANTI_AI_RULES_SHORT}`;
}

export function inlineEditPrompt(args: {
  blueprint: string;
  selection: string;
  instruction: string;
  context?: string;
  instructions?: string;
  references?: string;
  characters?: string;
  bookBrief?: string;
}) {
  return `Edit the passage below according to the instruction. Keep the author's voice.

Author blueprint:
${args.blueprint || "(none provided)"}

${args.context ? `Surrounding context:\n${args.context}\n\n` : ""}Passage:
"""
${args.selection}
"""

${guidanceSection(args)}Instruction: ${args.instruction}

${ANTI_AI_RULES_SHORT}
Return only the rewritten passage, no preamble.`;
}
