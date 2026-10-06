"use client";

import { useRef, useState } from "react";
import { Rocket, Square } from "lucide-react";
import { api, post } from "@/lib/client";
import { Button, ErrorNote, Label } from "./ui/kit";
import { CollapsibleCard } from "./ui/Collapsible";
import type { ChapterRow } from "./ChapterEditor";

interface Props {
  projectId: string;
  /** Chapter count from the Outline panel, the single place this is set. */
  count: number;
  onOutline: (chapters: ChapterRow[]) => void;
  onChapter: (chapter: ChapterRow) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRateLimit = (m: string) => /rate.?limit|429|try again|tokens per minute/i.test(m);

/**
 * Writes the whole book unattended: detects characters, outlines from your documents and instructions,
 * then drafts every chapter in order, each continuing from the last. Safe to stop and resume.
 */
export function BookAutopilot({ projectId, count, onOutline, onChapter }: Props) {
  const [words, setWords] = useState(1500);
  const [redraft, setRedraft] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  /** One request, with patient retries when the provider's per-minute token limit is hit. */
  async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!isRateLimit(msg) || attempt >= 3 || stop.current) throw e;
        for (let s = 45; s > 0 && !stop.current; s--) {
          setStatus(`${label}: rate limit reached, waiting ${s}s before retrying…`);
          await sleep(1000);
        }
      }
    }
  }

  async function run() {
    stop.current = false;
    setRunning(true);
    setError(null);
    try {
      // 1. characters
      const { characters } = await api<{ characters: unknown[] }>(`/api/characters?projectId=${projectId}`);
      if (characters.length === 0) {
        setStatus("Detecting characters…");
        try {
          await withRetry("Characters", () => post("/api/characters", { projectId, action: "detect" }));
        } catch {
          // no documents or no named characters: not an error for non-fiction books
        }
      }
      if (stop.current) return;

      // 2. outline
      let { chapters } = await api<{ chapters: ChapterRow[] }>(`/api/chapters?projectId=${projectId}`);
      if (chapters.length === 0) {
        setStatus("Planning the outline from your documents and instructions…");
        const res = await withRetry("Outline", () =>
          post<{ chapters: ChapterRow[] }>("/api/manuscript-generate", { action: "outline", projectId, chapterCount: count }),
        );
        chapters = res.chapters;
        onOutline(chapters);
      }

      // 3. chapters, in order, so each can continue from the one before
      const todo = chapters.filter((c) => redraft || c.status === "outline");
      setProgress({ done: 0, total: todo.length });
      for (let i = 0; i < todo.length; i++) {
        if (stop.current) {
          setStatus(`Stopped after ${i} of ${todo.length} chapters. Press the button to resume.`);
          return;
        }
        const c = todo[i];
        setStatus(`Writing chapter ${c.order} of ${chapters.length}: ${c.title}`);
        const res = await withRetry(`Chapter ${c.order}`, () =>
          post<{ chapter: ChapterRow }>("/api/manuscript-generate", { action: "chapter", chapterId: c.id, wordTarget: words }),
        );
        onChapter(res.chapter);
        setProgress({ done: i + 1, total: todo.length });
      }
      setStatus(todo.length ? "Done. Every chapter is drafted." : "Nothing to write: every chapter is already drafted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Autopilot stopped unexpectedly");
      setStatus("Stopped on an error. Press the button to resume where it left off.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <CollapsibleCard id="autopilot" title={"Write the whole book"} defaultOpen={false}>
      <p className="text-xs text-ink-700">Uses your documents, characters, writing instructions and blueprint. Existing drafts are kept unless you choose to redraft.</p>
      <p className="text-xs text-ink-700">
        Plans {count} chapters (change this in the Outline panel). If an outline already exists, it is used as it is.
      </p>
      <label className="block">
        <Label>Words each</Label>
        <input type="number" min={500} max={4000} step={100} className="w-full" value={words} disabled={running} onChange={(e) => setWords(+e.target.value)} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={redraft} disabled={running} onChange={(e) => setRedraft(e.target.checked)} />
        Redraft chapters that are already written
      </label>
      {running ? (
        <Button variant="secondary" className="w-full" onClick={() => (stop.current = true)}>
          <Square size={14} /> Stop after this chapter
        </Button>
      ) : (
        <Button className="w-full" onClick={run}>
          <Rocket size={14} /> Write the book automatically
        </Button>
      )}
      {progress && progress.total > 0 && (
        <div>
          <div className="h-2 rounded bg-ink-100">
            <div className="h-full rounded bg-accent transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-700">
            {progress.done} of {progress.total} chapters
          </p>
        </div>
      )}
      {status && <p className="text-xs text-ink-700">{status}</p>}
      <ErrorNote message={error} />
      <p className="text-[11px] text-ink-700/70">
        Keep this tab open while it runs. On the Groq free tier, expect pauses between chapters.
      </p>
    </CollapsibleCard>
  );
}
