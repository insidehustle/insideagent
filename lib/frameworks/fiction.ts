/** Prompts for story-driven books. The non-fiction 7-step framework does not apply to these. */

export type BookKind = "nonfiction" | "fiction";

export function fictionOutlinePrompt(args: {
  title: string;
  niche: string;
  blueprint: string;
  chapterCount: number;
  guidance: string;
}) {
  return `Plan a novel.

Title: ${args.title}
Genre and premise: ${args.niche}
Number of chapters: ${args.chapterCount}

Author blueprint (voice and sensibility):
${args.blueprint || "(none provided)"}

${args.guidance ? `${args.guidance}\n\n` : ""}Build a plot with a clear arc across the chapters: setup, rising complications, a midpoint turn, a crisis, a climax and a resolution. Follow any events, characters and facts given in the reference material and instructions. Every chapter must move the story forward through concrete scenes, not lessons.

Ground the plan in the reference material above. Each excerpt is labelled [Source: <document name>, part X of Y]. Use the events, characters, settings and facts those documents establish, and do not contradict them.

Return a JSON object with two keys:
- "bookBrief": string, Markdown, 120 to 200 words: the premise, the central conflict, the main characters and what each wants, the shape of the plot across the chapters, and which documents it draws on
- "chapters": an array of ${args.chapterCount} ordered objects, each with:
  - "title": string (evocative, specific to the story, never a how-to or self-help title)
  - "frameworkStep": "" (leave empty)
  - "summary": string, 2-3 sentences: where it happens, what goes wrong or changes, and the hook into the next chapter
  - "keyPoints": array of 3 to 5 concrete beats or scenes in this chapter, taken from the reference material where possible
  - "characters": array of the characters who appear in the chapter
  - "sources": array of document names, exactly as they appear in the [Source: ...] labels, that this chapter draws on ([] if no document covers it). Never invent a document name.`;
}

export function fictionChapterPrompt(args: {
  bookTitle: string;
  niche: string;
  blueprint: string;
  chapterTitle: string;
  chapterOrder: number;
  chapterCount?: number;
  summary?: string;
  priorTitles: string[];
  previousEnding?: string;
  dictationNotes?: string | null;
  instruction?: string;
  guidance: string;
  wordTarget: number;
  styleRules: string;
}) {
  return `Write chapter ${args.chapterOrder} of the novel "${args.bookTitle}" (${args.niche}).

Chapter title: ${args.chapterTitle}
${args.summary ? `Chapter brief: ${args.summary}\n` : ""}Chapters before this one: ${args.priorTitles.length ? args.priorTitles.join("; ") : "none"}
${args.previousEnding ? `How the previous chapter ended (continue naturally from it, do not repeat it):\n"""\n${args.previousEnding}\n"""\n` : ""}
Author blueprint (voice and sensibility):
${args.blueprint || "(none provided)"}

${args.dictationNotes ? `Author's own dictated notes. Preserve their ideas and phrasing wherever possible:\n${args.dictationNotes}\n\n` : ""}${args.instruction ? `Instruction for this chapter (follow it): ${args.instruction}\n\n` : ""}${args.guidance ? `${args.guidance}\n\n` : ""}Write this chapter as story: a concrete setting, characters acting and speaking in ways that fit who they are, a conflict or question, a turn, and an ending that pulls the reader into the next chapter. Show through action, dialogue and detail. Never address the reader directly. Include no lessons, exercises, summaries of the moral, or "action steps". Use only the characters listed, plus minor unnamed ones if the scene needs them.
Target about ${args.wordTarget} words. Output Markdown only, starting with "# ${args.chapterTitle}". Use a blank line between paragraphs.

Do not contradict facts in the reference material. Where the material is silent, invent only what the scene needs and keep it consistent with what is established.
${args.styleRules}`;
}
