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
        title,
        subtitle,
        author,
        niche,
        template,
        kind,
      });
      setResults((r) => [{ image: res.image, kind, template }, ...r]);
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
