"use client";

import { useEffect, useState } from "react";
import { Check, Save } from "lucide-react";
import { patch } from "@/lib/client";
import { useProject } from "./ProjectProvider";
import { Button, ErrorNote } from "./ui/kit";

/** The auto-written plan for the whole book. Editable; every chapter draft is kept consistent with it. */
export function BookBrief({ projectId, saved }: { projectId: string; saved: string }) {
  const { refresh } = useProject();
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setText(saved), [saved, projectId]);

  if (!saved && !text) return null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await patch("/api/projects", { id: projectId, bookBrief: text });
      await refresh();
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details open className="rounded-xl border border-ink-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold">Book brief</summary>
      <p className="mb-2 mt-1 text-xs text-ink-700">
        Written automatically with the outline, from your documents and instructions. Edit it to change the direction of the whole book.
      </p>
      <textarea
        rows={Math.min(14, Math.max(5, Math.ceil(text.length / 70)))}
        className="w-full text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Book brief"
      />
      <ErrorNote message={error} />
      {(text !== saved || justSaved) && (
        <Button variant="secondary" className="mt-2" onClick={save} loading={busy}>
          {justSaved ? <Check size={14} /> : <Save size={14} />} {justSaved ? "Saved" : "Save brief"}
        </Button>
      )}
    </details>
  );
}
