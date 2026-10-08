"use client";

import { useState } from "react";
import { Download, ImageIcon } from "lucide-react";
import { post } from "@/lib/client";
import { COVER_TEMPLATES, type CoverTemplate } from "@/lib/gemini-templates";
import { Button, Card, ErrorNote, Label } from "./ui/kit";

interface Props {
  projectId: string;
  title: string;
  niche: string;
}

interface Result {
  image: { dataUrl: string; mimeType: string };
  kind: "cover" | "promo";
  template: CoverTemplate;
}

const TEXT_STYLE: Record<CoverTemplate, { font: string; color: string; weight: string; upper: boolean }> = {
  minimalist: { font: "Georgia, serif", color: "#ffffff", weight: "400", upper: false },
  "bold-typographic": { font: "Impact, 'Arial Black', sans-serif", color: "#ffffff", weight: "700", upper: true },
  illustrated: { font: "Georgia, serif", color: "#fffaf0", weight: "700", upper: false },
  photographic: { font: "'Helvetica Neue', Arial, sans-serif", color: "#ffffff", weight: "700", upper: true },
  "premium-dark": { font: "Georgia, serif", color: "#e6c875", weight: "700", upper: true },
};

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws the title, subtitle and author over the generated artwork and returns a PNG data URL. */
async function overlayText(
  artUrl: string,
  o: { title: string; subtitle: string; author: string; template: CoverTemplate; kind: "cover" | "promo" },
): Promise<string> {
  const img = new Image();
  img.src = artUrl;
  await img.decode();
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser");
  ctx.drawImage(img, 0, 0);

  const st = TEXT_STYLE[o.template];
  const maxW = W * 0.82;
  const cx = W / 2;
  const promo = o.kind === "promo";
  const fmt = (t: string) => (st.upper ? t.toUpperCase() : t);

  // scrims keep text legible over any artwork
  const scrim = (y0: number, y1: number, a0: number, a1: number) => {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `rgba(0,0,0,${a0})`);
    g.addColorStop(1, `rgba(0,0,0,${a1})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
  };
  if (promo) scrim(H * 0.2, H * 0.8, 0.45, 0.45);
  else {
    scrim(0, H * 0.5, 0.6, 0);
    if (o.author) scrim(H, H * 0.85, 0.6, 0);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = st.color;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = W * 0.01;

  // shrink the title until it fits in 4 lines
  let size = W * (promo ? 0.1 : 0.115);
  let lines: string[] = [];
  for (; size > W * 0.04; size -= 2) {
    ctx.font = `${st.weight} ${size}px ${st.font}`;
    lines = wrap(ctx, fmt(o.title), maxW);
    if (lines.length <= 4) break;
  }
  const lh = size * 1.15;
  let y = promo ? (H - lines.length * lh) / 2 - (o.subtitle ? size * 0.4 : 0) : H * 0.07;
  lines.forEach((l) => {
    ctx.fillText(l, cx, y);
    y += lh;
  });

  if (o.subtitle) {
    const ss = size * 0.4;
    ctx.font = `400 ${ss}px ${st.font}`;
    y += ss * 0.5;
    for (const l of wrap(ctx, o.subtitle, maxW).slice(0, 3)) {
      ctx.fillText(l, cx, y);
      y += ss * 1.3;
    }
  }
  if (o.author) {
    const as = W * 0.05;
    ctx.font = `600 ${as}px ${st.font}`;
    ctx.textBaseline = "bottom";
    ctx.fillText(fmt(o.author), cx, promo ? H * 0.9 : H * 0.95);
  }
  return canvas.toDataURL("image/png");
}

export function CoverStudio({ projectId, title: defaultTitle, niche }: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState("");
  const [author, setAuthor] = useState("");
  const [template, setTemplate] = useState<CoverTemplate>("minimalist");
  const [kind, setKind] = useState<"cover" | "promo">("cover");
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ image: Result["image"] }>("/api/cover-generate", {
        projectId,
        niche,
        template,
        kind,
      });
      const dataUrl = await overlayText(res.image.dataUrl, { title, subtitle, author, template, kind });
      setResults((r) => [{ image: { dataUrl, mimeType: "image/png" }, kind, template }, ...r]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <Card className="space-y-4">
        <label className="block">
          <Label>Title</Label>
          <input className="w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <Label>Subtitle</Label>
          <input className="w-full" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </label>
        <label className="block">
          <Label>Author name</Label>
          <input className="w-full" value={author} onChange={(e) => setAuthor(e.target.value)} />
        </label>
        <label className="block">
          <Label>Layout template</Label>
          <select className="w-full" value={template} onChange={(e) => setTemplate(e.target.value as CoverTemplate)}>
            {COVER_TEMPLATES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <Label>Asset</Label>
          <select className="w-full" value={kind} onChange={(e) => setKind(e.target.value as "cover" | "promo")}>
            <option value="cover">Book cover (2:3)</option>
            <option value="promo">Social promo (square)</option>
          </select>
        </label>
        <ErrorNote message={error} />
        <Button onClick={generate} loading={busy} disabled={!title.trim()} className="w-full">
          <ImageIcon size={14} /> Generate
        </Button>
      </Card>
      <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {results.length === 0 && <p className="text-sm text-ink-700">Generated images appear here.</p>}
        {results.map((r, i) => (
          <figure key={i} className="overflow-hidden rounded-xl border border-ink-200 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.image.dataUrl} alt={`${r.kind} concept, ${r.template}`} className="w-full" />
            <figcaption className="flex items-center justify-between p-3 text-xs text-ink-700">
              {r.kind} · {r.template}
              <a
                href={r.image.dataUrl}
                download={`${title.replace(/\W+/g, "-").toLowerCase()}-${r.kind}-${results.length - i}.${r.image.mimeType.split("/")[1] ?? "png"}`}
                className="flex items-center gap-1 text-accent underline"
              >
                <Download size={12} /> Save
              </a>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
