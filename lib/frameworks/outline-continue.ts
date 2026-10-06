import type { BookKind } from "./fiction";

/** Asks for the chapters a first outline pass left out, so the outline reaches exactly the requested length. */
export function continueOutlinePrompt(args: {
  title: string;
  niche: string;
  kind: BookKind;
  existing: { title: string; summary: string }[];
  total: number;
  guidance: string;
}) {
  const missing = args.total - args.existing.length;
  const fiction = args.kind === "fiction";
  return `You are finishing the outline of ${fiction ? "a novel" : "a non-fiction book"}.

Title: ${args.title}
${fiction ? "Genre and premise" : "Niche"}: ${args.niche}
The outline must have exactly ${args.total} chapters in total. It currently has ${args.existing.length}:
${args.existing.map((c, i) => `${i + 1}. ${c.title}: ${c.summary}`).join("\n")}

${args.guidance ? `${args.guidance}\n\n` : ""}Write exactly ${missing} more chapter${missing === 1 ? "" : "s"}, numbered ${args.existing.length + 1} to ${args.total}, that continue the plan without repeating earlier chapters. The last chapter must bring the ${fiction ? "story" : "book"} to a proper close.

Return a JSON object {"chapters": [...]} holding exactly ${missing} objects, each with:
  - "title": string
  - "frameworkStep": ${fiction ? '"" (leave empty)' : "integer 1-7, the framework step this chapter's opening should lean on hardest"}
  - "summary": string, 2-3 sentences
  - "keyPoints": array of 3 to 5 specific points or ${fiction ? "scenes" : "ideas"}
  - "characters": array of names involved ([] if none)
  - "sources": [] (leave empty)`;
}
