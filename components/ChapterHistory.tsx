"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, Pin, RotateCcw } from "lucide-react";
import { api, patch, post } from "@/lib/client";
import { cn } from "@/lib/cn";
import { diffWords } from "@/lib/diff";
import { Button, ErrorNote } from "./ui/kit";
import { Modal } from "./ui/Modal";
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
  split: "Before split",
  merge: "Before merge",
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
    <Modal title="Version history" subtitle={chapterTitle} onClose={onClose} className="max-w-5xl">
        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[17rem_1fr] md:overflow-visible">
          <div className="space-y-3 border-b p-3 md:min-h-0 md:overflow-y-auto md:border-b-0 md:border-r">
            <div className="flex gap-2">
              <input className="min-w-0 flex-1 text-sm" aria-label="Name for this version" placeholder="Name this version" value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)} />
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
            <ul className="max-h-48 space-y-1 overflow-y-auto md:max-h-none">
              {versions?.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => setSelectedId(v.id)}
                    aria-pressed={v.id === selectedId}
                    className={cn("block min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm", v.id === selectedId ? "bg-accent-soft text-accent-dark" : "hover:bg-ink-100")}
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

          <div className="flex flex-col p-4 md:min-h-0">
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
                <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-ink-50/40 p-4 font-serif text-sm leading-relaxed md:max-h-none md:min-h-0 md:flex-1">
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
    </Modal>
  );
}
