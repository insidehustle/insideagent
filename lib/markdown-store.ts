import { prisma } from "./prisma";

export interface BlueprintInput {
  loves: string;
  goodAt: string;
  marketNeeds: string;
  monetization: string;
}

/** Extracts bullet items under a "Voice Rules" heading. */
export function extractVoiceRules(markdown: string): string[] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => /^#{1,3}\s*voice rules\s*$/i.test(l.trim()));
  if (start === -1) return [];
  const rules: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,3}\s/.test(line)) break;
    const item = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/)?.[1]?.trim();
    if (item) rules.push(item);
  }
  return rules;
}

export async function saveBlueprint(projectId: string, input: BlueprintInput, markdownContent: string) {
  const voiceRules = extractVoiceRules(markdownContent);
  return prisma.authorBlueprint.upsert({
    where: { projectId },
    update: { ...input, markdownContent, voiceRules },
    create: { projectId, ...input, markdownContent, voiceRules },
  });
}

/** Re-save after the user edits the generated markdown. Voice rules are re-derived. */
export async function updateBlueprintMarkdown(projectId: string, markdownContent: string) {
  return prisma.authorBlueprint.update({
    where: { projectId },
    data: { markdownContent, voiceRules: extractVoiceRules(markdownContent) },
  });
}

export async function getBlueprintMarkdown(projectId: string): Promise<string> {
  const bp = await prisma.authorBlueprint.findUnique({ where: { projectId } });
  return bp?.markdownContent ?? "";
}
