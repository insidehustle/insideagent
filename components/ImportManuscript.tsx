"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { api } from "@/lib/client";
import { Button, ErrorNote } from "./ui/kit";
import { CollapsibleCard } from "./ui/Collapsible";
import type { ChapterRow } from "./ChapterEditor";

const METHOD_NOTE: Record<string, string> = {
  markdown: "split at the headings in your file",
  headings: "split at the chapter headings",
  numbered: "split at the numbered titles",
  length: "no chapter headings were found, so it was cut into even sections",
};

/** Brings in a finished or in-progress manuscript as chapters, to edit, listen to and check without rewriting it. */
export function ImportManuscript({ projectId, chapterCount, onImported }: { projectId: string; chapterCount: number; onImported: (chapters: ChapterRow[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run(file: File | null) {
    setError(null);
    setNote(null);
    let mode = "";
    if (chapterCount > 0) {
      const replace = window.confirm(
        `This project already has ${chapterCount} chapters.\n\nOK: replace them with the imported manuscript (a snapshot is saved first, so you can restore them).\nCancel: choose whether to add the imported chapters after the existing ones.`,
      );
      if (replace) mode = "replace";
      else if (window.confirm("Add the imported chapters after the existing ones?")) mode = "append";
      else {
        if (input.current) input.current.value = "";
        return;
      }
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.set("projectId", projectId);
      if (mode) form.set("mode", mode);
      if (file) form.set("file", file);
      else form.set("text", pasted);
      const res = await api<{ chapters: ChapterRow[]; imported: number; method: string }>("/api/chapters/import", { method: "POST", body: form });
      onImported(res.chapters);
      setNote(`Imported ${res.imported} chapter${res.imported === 1 ? "" : "s"}, ${METHOD_NOTE[res.method] ?? "split"}. Rename, split or merge any that look wrong.`);
      setPasted("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <CollapsibleCard id="import-manuscript" title="Import my manuscript" defaultOpen={chapterCount === 0}>
      <p className="text-xs text-ink-700">
        Already have your book? Import it and it is split into chapters. Nothing is rewritten: you can edit it, listen to it and run the continuity check.
      </p>
      <input ref={input} type="file" accept=".txt,.md,.docx,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && void run(e.target.files[0])} />
      <Button onClick={() => input.current?.click()} loading={busy} className="w-full">
        <FileUp size={14} /> Choose a file (.docx, .pdf, .txt, .md)
      </Button>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-ink-700">Or paste the text</summary>
        <textarea rows={5} className="mt-2 w-full text-sm" aria-label="Manuscript text" placeholder="Paste your manuscript here" value={pasted} onChange={(e) => setPasted(e.target.value)} />
        <Button variant="secondary" className="mt-2 w-full" onClick={() => void run(null)} disabled={!pasted.trim() || busy}>
          Import pasted text
        </Button>
      </details>
      <p className="text-xs text-ink-700">Chapters are found from headings such as "Chapter 1", "Prologue" or "# Title".</p>
      {note && <p role="status" className="rounded-lg bg-accent-soft p-2 text-xs text-accent-dark">{note}</p>}
      <ErrorNote message={error} />
    </CollapsibleCard>
  );
}
