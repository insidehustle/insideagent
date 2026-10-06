export type CoverTemplate = "minimalist" | "bold-typographic" | "illustrated" | "photographic" | "premium-dark";

export const TEMPLATE_BRIEFS: Record<CoverTemplate, string> = {
  minimalist: "clean minimalist layout, generous negative space, one focal symbol, restrained two-color palette",
  "bold-typographic": "oversized bold typography dominating the frame, high contrast, flat color blocks",
  illustrated: "tasteful editorial illustration, cohesive color story, hand-crafted feel",
  photographic: "cinematic photographic composition, shallow depth of field, natural lighting",
  "premium-dark": "premium dark background, subtle gradients, metallic accent typography, authoritative tone",
};

export const COVER_TEMPLATES = Object.keys(TEMPLATE_BRIEFS) as CoverTemplate[];
