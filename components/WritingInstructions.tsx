"use client";

import { useEffect, useState } from "react";
import { Check, Save } from "lucide-react";
import { patch } from "@/lib/client";
import { useProject } from "./ProjectProvider";
import { Button, ErrorNote } from "./ui/kit";
import { CollapsibleCard } from "./ui/Collapsible";

/** Standing instructions saved on the project and followed in every outline, chapter, edit and post. */
export function WritingInstructions({ projectId, saved }: { projectId: string; saved: string }) {
  const { refresh, current } = useProject();
  const kind = current?.kind ?? "nonfiction";
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setText(saved), [saved, projectId]);

  async function setKind(next: string) {
    setError(null);
    try {
      await patch("/api/projects", { id: projectId, kind: next });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change book type");
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await patch("/api/projects", { id: projectId, writingInstructions: text });
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
    <CollapsibleCard id="instructions" title={"Writing instructions"} defaultOpen={true}>
      <p className="text-xs text-ink-700">Saved with the project and followed in every outline, chapter, edit and social post.</p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium">Book type</span>
        <select className="w-full text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="nonfiction">Non-fiction (7-step narrative framework)</option>
          <option value="fiction">Fiction (story chapters with scenes and dialogue)</option>
        </select>
      </label>
      <textarea
        rows={6}
        className="w-full text-sm"
        maxLength={8000}
        placeholder={"e.g. Write for busy managers. Use second person. Keep chapters under 2,000 words. Always end with a 3-step exercise. Never mention competitors by name."}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <ErrorNote message={error} />
      <Button variant="secondary" onClick={save} loading={busy} disabled={text === saved && !justSaved}>
        {justSaved ? <Check size={14} /> : <Save size={14} />} {justSaved ? "Saved" : "Save instructions"}
      </Button>
    </CollapsibleCard>
  );
}
