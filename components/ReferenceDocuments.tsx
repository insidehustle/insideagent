"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { api, patch } from "@/lib/client";
import { Button, ErrorNote } from "./ui/kit";
import { CollapsibleCard } from "./ui/Collapsible";

interface Doc {
  id: string;
  name: string;
  charCount: number;
  useForWriting: boolean;
}

/** Uploaded premise, drafts and reference books. The writing prompts pull relevant passages from these. */
export function ReferenceDocuments({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const { documents } = await api<{ documents: Doc[] }>(`/api/documents?projectId=${projectId}`);
      setDocs(documents);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load documents");
    }
  }, [projectId]);

  useEffect(() => {
    setDocs([]);
    void load();
  }, [load]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("projectId", projectId);
        form.set("file", file);
        await api("/api/documents", { method: "POST", body: form });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function toggle(doc: Doc) {
    setDocs((ds) => ds.map((d) => (d.id === doc.id ? { ...d, useForWriting: !d.useForWriting } : d)));
    try {
      await patch("/api/documents", { id: doc.id, useForWriting: !doc.useForWriting });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
      await load();
    }
  }

  async function remove(doc: Doc) {
    if (!confirm(`Remove ${doc.name}?`)) return;
    try {
      await api(`/api/documents?id=${doc.id}`, { method: "DELETE" });
      setDocs((ds) => ds.filter((d) => d.id !== doc.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <CollapsibleCard id="documents" title={"Reference documents"} defaultOpen={true}>
      <p className="text-xs text-ink-700">Upload your premise, drafts or books to learn from (.txt, .md, .pdf). Relevant passages are used when writing.</p>
      <input ref={input} type="file" multiple accept=".txt,.md,.pdf" className="hidden" onChange={(e) => upload(e.target.files)} />
      <Button variant="secondary" onClick={() => input.current?.click()} loading={busy} className="w-full">
        <Upload size={14} /> Upload files
      </Button>
      <ErrorNote message={error} />
      {docs.length === 0 ? (
        <p className="text-xs text-ink-700">No documents yet. Files uploaded on the Research page appear here too.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={d.useForWriting}
                onChange={() => toggle(d)}
                aria-label={`Use ${d.name} when writing`}
                className="shrink-0"
              />
              <FileText size={14} className="shrink-0 text-ink-700" />
              <span className="min-w-0 flex-1 truncate" title={d.name}>
                {d.name}
              </span>
              <span className="shrink-0 text-xs text-ink-700">{Math.round(d.charCount / 1000)}k</span>
              <button onClick={() => remove(d)} aria-label={`Remove ${d.name}`} className="shrink-0 text-ink-700 hover:text-red-700">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleCard>
  );
}
