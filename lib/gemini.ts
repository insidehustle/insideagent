import { GoogleGenAI } from "@google/genai";
import { requireEnv } from "./utils";
import { COVER_TEMPLATES, TEMPLATE_BRIEFS, type CoverTemplate } from "./gemini-templates";

const IMAGE_MODEL = "gemini-2.5-flash-image";

export { COVER_TEMPLATES, type CoverTemplate };

export interface GeneratedImage {
  mimeType: string;
  base64: string;
}

export async function generateImage(prompt: string): Promise<GeneratedImage> {
  const ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  const response = await ai.models.generateContent({ model: IMAGE_MODEL, contents: prompt });
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return { mimeType: part.inlineData.mimeType ?? "image/png", base64: part.inlineData.data };
    }
  }
  const text = parts.map((p) => p.text).filter(Boolean).join(" ");
  throw new Error(`Gemini returned no image${text ? `: ${text}` : "."}`);
}

export function buildCoverPrompt(args: {
  title: string;
  subtitle?: string;
  author?: string;
  niche: string;
  template: CoverTemplate;
  kind: "cover" | "promo";
}) {
  const { title, subtitle, author, niche, template, kind } = args;
  const style = TEMPLATE_BRIEFS[template];
  if (kind === "promo") {
    return `Design a square social media promo graphic for the book "${title}" (niche: ${niche}). Style: ${style}. Include the title as legible text and a short, confident one-line hook. No watermarks, no fake reviews, no stock-photo cliches.`;
  }
  return `Design a professional, high-resolution portrait book cover (2:3 ratio) for the non-fiction book titled "${title}"${subtitle ? `, subtitle "${subtitle}"` : ""}${author ? `, by ${author}` : ""}. Niche: ${niche}. Style: ${style}. The title must be perfectly legible at thumbnail size. No watermarks, no extra text beyond title, subtitle and author.`;
}
