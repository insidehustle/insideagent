import { GoogleGenAI } from "@google/genai";
import { requireEnv } from "./utils";
import { COVER_TEMPLATES, TEMPLATE_BRIEFS, type CoverTemplate } from "./gemini-templates";

const IMAGE_MODEL = "gemini-2.5-flash-image";

export { COVER_TEMPLATES, type CoverTemplate };

export interface GeneratedImage {
  mimeType: string;
  base64: string;
}

/** Free, keyless fallback. Text rendering is weak, so expect imperfect titles. */
async function generatePollinationsImage(prompt: string, kind: "cover" | "promo"): Promise<GeneratedImage> {
  const [width, height] = kind === "promo" ? [1024, 1024] : [768, 1152];
  const url = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?width=${width}&height=${height}&model=flux&nologo=true&seed=${Math.floor(Math.random() * 1e6)}`;
  const key = process.env.POLLINATIONS_API_KEY;
  const res = await fetch(url, { signal: AbortSignal.timeout(100_000), headers: key ? { Authorization: `Bearer ${key}` } : undefined });
  if (res.status === 402) throw new Error("Pollinations rate limit reached for anonymous use. Wait a minute, or set POLLINATIONS_API_KEY (free at enter.pollinations.ai).");
  if (!res.ok) throw new Error(`Pollinations returned ${res.status}`);
  const mimeType = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  if (!mimeType.startsWith("image/")) throw new Error("Pollinations returned no image.");
  return { mimeType, base64: Buffer.from(await res.arrayBuffer()).toString("base64") };
}

/** IMAGE_PROVIDER=pollinations|gemini. Default: Gemini when GEMINI_API_KEY is set (falling back to Pollinations on error), else Pollinations. */
export async function generateImage(prompt: string, kind: "cover" | "promo" = "cover"): Promise<GeneratedImage> {
  const provider = process.env.IMAGE_PROVIDER;
  if (provider === "pollinations" || (provider !== "gemini" && !process.env.GEMINI_API_KEY)) {
    return generatePollinationsImage(prompt, kind);
  }
  try {
    return await generateGeminiImage(prompt);
  } catch (e) {
    if (provider === "gemini") throw e;
    return generatePollinationsImage(prompt, kind);
  }
}

async function generateGeminiImage(prompt: string): Promise<GeneratedImage> {
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

const NO_TEXT = "Artwork only: absolutely no text, letters, numbers, logos, watermarks or typography anywhere in the image.";

/** Artwork-only prompt. Title, subtitle and author are overlaid by the app, so they are not sent to the model. */
export function buildCoverPrompt(args: { niche: string; template: CoverTemplate; kind: "cover" | "promo" }) {
  const { niche, template, kind } = args;
  const style = TEMPLATE_BRIEFS[template];
  if (kind === "promo") {
    return `Square social media promo background artwork for a non-fiction book in the niche "${niche}". Style: ${style}. Keep the center calm and uncluttered so text can be placed over it. ${NO_TEXT}`;
  }
  return `Professional portrait book cover artwork (2:3 ratio) for a non-fiction book in the niche "${niche}". Style: ${style}. Leave the upper third and the bottom strip visually calm and uncluttered so a title and author name can be placed over them. ${NO_TEXT}`;
}
