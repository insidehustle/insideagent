import { prisma } from "./prisma";
import { askLLMJson } from "./llm";
import { getOutlineReferences } from "./references";

export interface QA {
  q: string;
  a: string;
}

export const MAX_QUESTIONS = 15;
const INSTRUCTIONS_LIMIT = 8000;
const BLOCK_LIMIT = 3000;
const START = "=== Author interview (added by the interview; re-running it replaces this section) ===";
const END = "=== End of author interview ===";

/** The instructions the author typed, without any section the interview added earlier. */
export function stripInterview(instructions: string): string {
  const s = instructions.indexOf(START);
  if (s === -1) return instructions.trim();
  const e = instructions.indexOf(END, s);
  const after = e === -1 ? "" : instructions.slice(e + END.length);
  return `${instructions.slice(0, s)}${after}`.trim();
}

async function load(projectId: string) {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { title: true, niche: true, kind: true, bookBrief: true, writingInstructions: true },
  });
  if (!p) throw new Error("Project not found");
  return p;
}

const transcript = (history: QA[]) => history.map((h, i) => `Q${i + 1}: ${h.q}\nA${i + 1}: ${h.a.trim() || "(skipped)"}`).join("\n\n");

/** The next interview question, based on the reference documents, the standing instructions and the answers so far. */
export async function nextQuestion(projectId: string, history: QA[]): Promise<{ question: string; done: boolean }> {
  if (history.length >= MAX_QUESTIONS) return { question: "", done: true };
  const p = await load(projectId);
  const refs = await getOutlineReferences(projectId, `${p.title} ${p.niche} ${p.bookBrief}`, 3500);
  const answered = history.filter((h) => h.a.trim()).length;

  const out = await askLLMJson<{ question?: string; done?: boolean }>(
    `You are a skilled ghostwriter interviewing the author of a ${p.kind === "fiction" ? "fiction" : "non-fiction"} book, so that the book sounds like them and contains what only they know.

Book: "${p.title}" (${p.niche})
${p.bookBrief ? `Book brief:\n${p.bookBrief.slice(0, 1500)}\n` : ""}
Writing instructions so far:
${stripInterview(p.writingInstructions).slice(0, 2000) || "(none yet)"}

${refs.block ? `Excerpts from the author's reference documents:\n${refs.block}\n` : "No reference documents were uploaded."}

${history.length ? `Interview so far:\n${transcript(history)}\n` : ""}
Ask the ONE next question. Rules:
- Ground it in the documents or the instructions where you can, for example name an idea from them and ask for the author's own experience, opinion or disagreement with it.
- Draw out what the documents cannot supply: the author's real stories, specific numbers and names, who the reader is, what the reader should do or feel afterwards, their voice and tone, and what to avoid.
- Build on earlier answers. If an answer was vague, ask for a concrete example. Never repeat a topic already covered.
- Plain, friendly language. One question only, no preamble, no numbering, under 40 words.
- Set "done" to true, with an empty question, only if ${answered} answers already cover audience, voice, stories and boundaries well enough.

Return {"question":"...","done":false}`,
    { maxTokens: 800 },
  );
  const question = String(out.question ?? "").trim().slice(0, 400);
  if (out.done === true || !question) return { question: "", done: history.length > 0 };
  return { question, done: false };
}

/** Distils the answers into directives and stores them in the project's writing instructions, replacing any earlier interview section. */
export async function applyInterview(projectId: string, history: QA[]): Promise<{ instructions: string; added: string }> {
  const answers = history.filter((h) => h.a.trim());
  if (answers.length === 0) throw new Error("Answer at least one question first.");
  const p = await load(projectId);
  const base = stripInterview(p.writingInstructions);

  const out = await askLLMJson<{ directives?: string }>(
    `Turn this author interview into standing writing instructions for an AI that will write the book "${p.title}" for the author.

Existing instructions (do not repeat or contradict them):
${base.slice(0, 2000) || "(none)"}

Interview:
${transcript(answers)}

Write a concise bullet list of directives, one per line starting with "- ", grouped in this order where the interview supports it: reader, voice and tone, key messages, stories and examples to use (keep the names, numbers, places and details the author gave, and say where each fits), things to avoid.
Use only what the author said. Do not invent facts. Write in the second person to the AI ("Write for...", "Use the story of..."). Under ${BLOCK_LIMIT - 200} characters in total.

Return {"directives":"- ...\\n- ..."}`,
    { maxTokens: 2500 },
  );
  const directives = String(out.directives ?? "").trim().slice(0, BLOCK_LIMIT);
  if (!directives) throw new Error("The model did not produce any instructions. Try again.");

  const block = `${START}\n${directives}\n${END}`;
  const instructions = base ? `${base}\n\n${block}` : block;
  if (instructions.length > INSTRUCTIONS_LIMIT) {
    throw new Error("Your writing instructions are too long to add the interview. Shorten them and try again.");
  }
  await prisma.project.update({ where: { id: projectId }, data: { writingInstructions: instructions } });
  return { instructions, added: directives };
}
