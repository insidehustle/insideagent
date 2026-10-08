export type CoverTemplate = "minimalist" | "bold-typographic" | "illustrated" | "photographic" | "premium-dark";

export const TEMPLATE_BRIEFS: Record<CoverTemplate, string> = {
  minimalist: "clean minimalist layout, generous negative space, one focal symbol, restrained two-color palette",
  "bold-typographic": "bold graphic composition, high contrast, flat color blocks and strong geometric shapes",
  illustrated: "tasteful editorial illustration, cohesive color story, hand-crafted feel",
  photographic: "cinematic photographic composition, shallow depth of field, natural lighting",
  "premium-dark": "premium dark background, subtle gradients, metallic accents, authoritative tone",
};

export const COVER_TEMPLATES = Object.keys(TEMPLATE_BRIEFS) as CoverTemplate[];
