"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { post } from "@/lib/client";
import { Button, Card, ErrorNote } from "./ui/kit";

/** Adds a YouTube video (its transcript) or a web page as a reference document. */
export function ImportLink({ projectId, onImported, compact }: { projectId: string; onImported?: () => void; compact?: boolean }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const { document } = await post<{ document: { name: string } }>("/api/documents/import", { projectId, url });
      setDone(`Added "${document.name}"`);
      setUrl("");
      onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <div className="space-y-2">
      {!compact && <h3 className="font-semibold">Add a video or web page</h3>}
      <p className="text-xs text-ink-700">Paste a YouTube link (its captions are used as the transcript) or an article URL. It becomes a reference document for Content Studio.</p>
      <div className="flex gap-2">
        <input className="min-w-0 flex-1" placeholder="https://youtube.com/watch?v=…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button variant="secondary" onClick={add} loading={busy} disabled={!url.trim()}>
          <Link2 size={14} /> Add
        </Button>
      </div>
      <ErrorNote message={error} />
      {done && <p className="text-xs text-green-700">{done}</p>}
    </div>
  );
  return compact ? body : <Card>{body}</Card>;
}
