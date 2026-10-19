"use client";

import { useState } from "react";
import { Check, ExternalLink, Plus, Search } from "lucide-react";
import { post } from "@/lib/client";
import { Button, Card, ErrorNote } from "./ui/kit";

interface Video {
  videoId: string;
  url: string;
  title: string;
  snippet: string;
  score: number;
  query: string;
}

/** Searches YouTube for videos that match the book's brief, and adds chosen ones as reference documents. */
export function YoutubeReferences({ projectId }: { projectId: string }) {
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [queries, setQueries] = useState<string[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, true>>({});
  const [itemError, setItemError] = useState<Record<string, string>>({});

  async function search() {
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ queries: string[]; videos: Video[] }>("/api/research/youtube", { projectId, focus });
      setVideos(res.videos);
      setQueries(res.queries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function add(v: Video) {
    setAdding(v.videoId);
    setItemError((m) => {
      const next = { ...m };
      delete next[v.videoId];
      return next;
    });
    try {
      await post("/api/documents/import", { projectId, url: v.url });
      setAdded((a) => ({ ...a, [v.videoId]: true }));
    } catch (e) {
      setItemError((m) => ({ ...m, [v.videoId]: e instanceof Error ? e.message : "Could not import" }));
    } finally {
      setAdding(null);
    }
  }

  return (
    <Card>
      <div className="space-y-3">
        <div>
          <h3 className="font-semibold">YouTube references</h3>
          <p className="text-xs text-ink-700">
            Finds videos related to this book, using its brief, writing instructions and chapter plans. Add a video to use its transcript as a reference document.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1"
            placeholder="Optional focus, e.g. how to open a chapter"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
          />
          <Button variant="secondary" onClick={search} loading={busy}>
            <Search size={14} /> Find videos
          </Button>
        </div>
        <ErrorNote message={error} />
        {queries.length > 0 && <p className="text-xs text-ink-700">Searched: {queries.join(" · ")}</p>}
        {videos && videos.length === 0 && <p className="text-sm">No videos found. Try adding a focus or filling in the book brief.</p>}
        {videos && videos.length > 0 && (
          <ul className="divide-y">
            {videos.map((v) => (
              <li key={v.videoId} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <a href={v.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium hover:underline">
                    {v.title} <ExternalLink size={12} />
                  </a>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-700">{v.snippet}</p>
                  <p className="mt-0.5 text-xs text-ink-700">
                    Match {Math.round(v.score * 100)}% · from &quot;{v.query}&quot;
                  </p>
                  <ErrorNote message={itemError[v.videoId] ?? null} />
                </div>
                {added[v.videoId] ? (
                  <span className="inline-flex items-center gap-1 text-xs text-green-700">
                    <Check size={14} /> Added
                  </span>
                ) : (
                  <Button variant="secondary" onClick={() => add(v)} loading={adding === v.videoId}>
                    <Plus size={14} /> Add
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
