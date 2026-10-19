"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, Pin, RotateCcw, X } from "lucide-react";
import { api, patch, post } from "@/lib/client";
import { cn } from "@/lib/cn";
import { diffWords } from "@/lib/diff";
import { Button, ErrorNote } from "./ui/kit";
import type { ChapterRow } from "./ChapterEditor";

interface Version {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  source: string;
  label: string;
  pinned: boolean;
  createdAt: string;
}

const SOURCE_LABEL: Record<string, string> = {
  manual: "Saved",
  autosave: "Autosave",
  redraft: "Before redraft",
  "ai-edit": "Before AI edit",
  "listen-edit": "Before read-aloud edit",
  restore: "Before restore",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

interface Props {
  chapterId: string;
  chapterTitle: string;
  /** What is in the editor right now, which versions are compared against. */
  currentText: string;
  onClose: () => void;
  /** Called with the restored chapter so the editor shows it. */
  onRestored: (chapter: ChapterRow) => void;
}

/** Version history of one chapter: compare any earlier version with the current text, restore it, name or pin it. */
export function ChapterHistory({ chapterId, chapterTitle, currentText, onClose, onRestored }: Props) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState("");

  async function load() {
    try {
      const { versions } = await api<{ versions: Version[] }>(`/api/chapters/versions?chapterId=${chapterId}`);
      setVersions(versions);
      setSelectedId((id) => (id && versions.some((v) => v.id === id) ? id : versions[0]?.id ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  const selected = versions?.find((v) => v.id === selectedId) ?? null;
  const parts = useMemo(() => (selected ? diffWords(selected.content, currentText) : []), [selected, currentText]);
  const changed = parts.some((p) => p.kind !== "same");

  async function restore() {
    if (!selected) return;
    if (!confirm(`Replace the chapter with the version from ${when(selected.createdAt)}? The current text is saved first, so you can undo this.`)) return;
    setBusy("restore");
    setError(null);
    try {
      const { chapter } = await post<{ chapter: ChapterRow }>("/api/chapters/versions", {
        chapterId,
        action: "restore",
        versionId: selected.id,
      });
      onRestored(chapter);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveNamed() {
    setBusy("save");
    setError(null);
    try {
      await post("/api/chapters/versions", { chapterId, action: "save", label: labelDraft.trim() });
      setLabelDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  async function togglePin(v: Version) {
    try {
      await patch("/api/chapters/versions", { chapterId, versionId: v.id, pinned: !v.pinned });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Version history">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <h2 className="font-serif text-lg">Version history</h2>
            <p className="text-xs text-ink-700">{chapterTitle}</p>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[17rem_1fr]">
          <div className="min-h-0 space-y-3 overflow-y-auto border-b p-3 md:border-b-0 md:border-r">
            <div className="flex gap-2">
              <input className="min-w-0 flex-1 text-sm" placeholder="Name this version" value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)} />
              <Button variant="secondary" onClick={saveNamed} loading={busy === "save"} aria-label="Save current text as a version">
                <Bookmark size={14} />
              </Button>
            </div>
            {versions === null && <p className="text-sm text-ink-700">Loading…</p>}
            {versions?.length === 0 && (
              <p className="text-sm text-ink-700">
                No earlier versions yet. One is kept automatically before every redraft, AI rewrite and restore, and while you edit.
              </p>
            )}
            <ul className="space-y-1">
              {versions?.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => setSelectedId(v.id)}
                    className={cn("block w-full rounded-lg px-3 py-2 text-left text-sm", v.id === selectedId ? "bg-accent-soft text-accent-dark" : "hover:bg-ink-100")}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">{v.label || SOURCE_LABEL[v.source] || v.source}</span>
                      {v.pinned && <Pin size={12} />}
                    </span>
                    <span className="block text-xs text-ink-700/80">
                      {when(v.createdAt)} · {v.wordCount} words
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex min-h-0 flex-col p-4">
            {selected ? (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-ink-700">
                    Compared with what is in the editor now.{" "}
                    <span className="rounded bg-red-100 px-1 text-red-800 line-through">Only in this version</span>{" "}
                    <span className="rounded bg-green-100 px-1 text-green-800">Only in the current text</span>
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => togglePin(selected)}>
                      <Pin size={14} /> {selected.pinned ? "Unpin" : "Pin"}
                    </Button>
                    <Button onClick={restore} loading={busy === "restore"} disabled={!changed}>
                      <RotateCcw size={14} /> Restore this version
                    </Button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-ink-50/40 p-4 font-serif text-sm leading-relaxed">
                  {!changed && <p className="mb-2 font-sans text-xs text-ink-700">This version is identical to the current text.</p>}
                  {parts.map((p, i) =>
                    p.kind === "same" ? (
                      <span key={i}>{p.text}</span>
                    ) : p.kind === "remove" ? (
                      <span key={i} className="bg-red-100 text-red-800 line-through">
                        {p.text}
                      </span>
                    ) : (
                      <span key={i} className="bg-green-100 text-green-800">
                        {p.text}
                      </span>
                    ),
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-ink-700">Select a version to compare it with the current text.</p>
            )}
            <div className="mt-2">
              <ErrorNote message={error} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
