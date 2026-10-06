/**
 * Anti-AI formatting rules: a prompt block for social copy plus deterministic cleaners
 * so output is clean even when the model slips.
 */

export const ANTI_AI_SOCIAL_RULES = `ANTI-AI FORMATTING RULES (strict):
- No em dashes or en dashes. Use a period or a comma instead. No hyphens used as pauses (" - ").
- Never use these words or phrases: delve, unlock, unleash, game-changer, game changing, revolutionize, supercharge, elevate, leverage, tapestry, landscape, realm, testament, seamless, robust, embark, foster, navigate the, in today's fast-paced world, in the ever-evolving, buckle up, let's dive in, here's the thing, the truth is, harness the power, take it to the next level, moreover, furthermore.
- No "It's not X, it's Y" or "Not just X, but Y" constructions.
- No rhetorical question openers and no "Imagine..." openers. No emoji strings. At most one exclamation mark in the whole post, preferably none.
- No hashtag stacks. Max 2 hashtags, only if natural, at the end.
- No "Here are N lessons" listicle framing unless the chapter is truly a list.
- Short, plain sentences in the author's own voice. Concrete nouns, real numbers only if they appear in the source text. Do not invent stats, quotes or stories.
- Vary sentence length. First line must stand alone as a hook without hype words.`;

type Replacement = string | ((match: string) => string);

/** Matches a verb in every form and swaps in the same form of a plainer verb ("unlocked" becomes "opened"). */
function verb(forms: [string, string][]): [RegExp, Replacement] {
  const map = new Map(forms.map(([from, to]) => [from, to]));
  return [new RegExp(`\\b(?:${forms.map(([f]) => f).join("|")})\\b`, "gi"), (m) => map.get(m.toLowerCase()) ?? m];
}

const REPLACEMENTS: [RegExp, Replacement][] = [
  // dashes used as pauses (horizontal whitespace only, so markdown "- item" bullets survive)
  [/[ \t]*[—–][ \t]*/g, ", "],
  [/[ \t]+-[ \t]+/g, ", "],
  // filler openers
  // (horizontal whitespace only, so paragraph breaks are never swallowed)
  [/\b(?:moreover|furthermore|additionally|in conclusion|in summary),?[ \t]+/gi, ""],
  [/\bit(?:'s| is) (?:important|worth) (?:to note|noting)(?: that)?,?[ \t]*/gi, ""],
  [/\bat the end of the day,?[ \t]*/gi, ""],
  [/\bin today's (?:fast-paced|digital|modern) world,?[ \t]*/gi, ""],
  [/\bin the ever-evolving [a-z ]+?(?:,|\b)[ \t]*/gi, ""],
  [/\blet's dive (?:in|deep)[.!]?[ \t]*/gi, ""],
  [/\bbuckle up[.!]?[ \t]*/gi, ""],
  [/\bhere's the thing:?,?[ \t]*/gi, ""],
  // cliche vocabulary
  [/\bgame[- ]changer\b/gi, "big change"],
  [/\bgame[- ]changing\b/gi, "major"],
  [/\bdelve(?:s|d)? (?:into|deeper into)\b/gi, "look at"],
  verb([["delve", "look"], ["delves", "looks"], ["delved", "looked"], ["delving", "looking"]]),
  verb([["unlock", "open"], ["unlocks", "opens"], ["unlocked", "opened"], ["unlocking", "opening"]]),
  verb([["unleash", "release"], ["unleashes", "releases"], ["unleashed", "released"], ["unleashing", "releasing"]]),
  verb([["revolutionize", "change"], ["revolutionizes", "changes"], ["revolutionized", "changed"], ["revolutionizing", "changing"], ["revolutionise", "change"], ["revolutionises", "changes"], ["revolutionised", "changed"], ["revolutionising", "changing"]]),
  verb([["supercharge", "improve"], ["supercharges", "improves"], ["supercharged", "improved"], ["supercharging", "improving"]]),
  verb([["leverage", "use"], ["leverages", "uses"], ["leveraged", "used"], ["leveraging", "using"]]),
  verb([["foster", "build"], ["fosters", "builds"], ["fostered", "built"], ["fostering", "building"]]),
  [/\bharness(?:es|ed|ing)? the power of\b/gi, "use"],
  [/\btake (?:it|this|things) to the next level\b/gi, "improve it"],
  [/\btapestry\b/gi, "mix"],
  [/\bseamless(?:ly)?\b/gi, "smooth"],
  [/\brobust\b/gi, "strong"],
  [/\b(?:crucial|pivotal|paramount)\b/gi, "key"],
  [/\bembarks on\b/gi, "starts"],
  [/\bembarked on\b/gi, "started"],
  [/\bembarking on\b/gi, "starting"],
  [/\bembark on\b/gi, "start"],
  [/\bintricate\b/gi, "detailed"],
  [/\bmeticulous(?:ly)?\b/gi, "careful"],
  [/\bnavigat(?:e|es|ed|ing) the (?:complexities|challenges|landscape) of\b/gi, "deal with"],
  [/\ba testament to\b/gi, "proof of"],
];

/** Typographic characters that mark text as machine-written or break copy-paste. */
function normalizeTypography(text: string): string {
  return text
    .replace(/[‐‑‒⁃−]/g, "-") // non-breaking and odd hyphens
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/…/g, "...")
    .replace(/[    ]/g, " ")
    .replace(/[​‌‍﻿]/g, "");
}

function clean(text: string, maxExclamations: number): string {
  let out = normalizeTypography(text);
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement as string);
  }
  let seen = 0;
  out = out.replace(/!/g, () => (++seen > maxExclamations ? "." : "!"));
  out = out
    .replace(/,\s*,/g, ",")
    .replace(/,[ \t]*([.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "");
  // replacements can leave a lowercase letter at the start of a sentence or line
  out = out.replace(/(^|[.!?]\s+|\n)([a-z])/g, (_, lead: string, ch: string) => lead + ch.toUpperCase());
  return out.trim();
}

/** Social copy: at most one exclamation mark. */
export function sanitizeSocialText(text: string): string {
  return clean(text, 1);
}

/** Long-form prose and markdown (chapters, blueprint, edits): markdown structure is preserved. */
export function cleanProse(text: string): string {
  return clean(text, 2);
}

const BANNED_CHECKS: [string, RegExp][] = [
  ["dash", /[‐-―−]|[ \t]-[ \t]/],
  ["cliche", /\b(delve|unlock|unleash|game[- ]chang\w*|tapestry|supercharge|revolutioni[sz]e|seamless\w*|embark\w*|moreover|furthermore)\b/i],
  ["not-x-but-y", /\bnot (?:just|only)\b[^.]{0,60}\bbut\b|\bit'?s not\b[^.]{0,60},\s*it'?s\b/i],
  ["imagine-opener", /^(?:imagine|picture this|what if)\b/im],
];

export function findAiTells(text: string): string[] {
  return BANNED_CHECKS.filter(([, re]) => re.test(text)).map(([name]) => name);
}
