"use client";

import { useState } from "react";
import { Check, Replace, Search } from "lucide-react";
import { post } from "@/lib/client";
import { Button, ErrorNote } from "./ui/kit";
import type { ChapterRow } from "./ChapterEditor";

interface Match {
  id: string;
  order: number;
  title: string;
  count: number;
  titleCount: number;
  samples: { before: string; match: string; after: string }[];
}

/**
 * Find and replace across every written chapter, for a renamed character, a changed term or a spelling.
 * Shows where the text would change first. The changes are saved to the chapters, so they appear in the Content Studio too.
 */
export function GlobalReplace({ projectId, onChanged }: { projectId: string; onChanged: (chapters: ChapterRow[]) => void }) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(true);
  const [found, setFound] = useState<{ chapters: Match[]; total: number } | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | "preview" | "apply">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const body = { projectId, find, replace, matchCase, wholeWord };

  function edited() {
    // the preview no longer describes what is typed
    setFound(null);
    setDone(null);
    setSkip(new Set());
  }

  async function preview() {
    setBusy("preview");
    setError(null);
    setDone(null);
    try {
      setFound(await post<{ chapters: Match[]; total: number }>("/api/chapters/replace", { ...body, action: "preview" }));
      setSkip(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!found) return;
    const chosen = found.chapters.filter((c) => !skip.has(c.id));
    if (chosen.length === 0) return;
    setBusy("apply");
    setError(null);
    try {
      const res = await post<{ changed: number; chapters: ChapterRow[] }>("/api/chapters/replace", { ...body, action: "apply", chapterIds: chosen.map((c) => c.id) });
      onChanged(res.chapters);
      setDone(`Changed ${res.changed} chapter${res.changed === 1 ? "" : "s"}. The earlier text is saved in each chapter's History and in Project snapshots.`);
      setFound(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Replace failed");
    } finally {
      setBusy(null);
    }
  }

  const chosenTotal = found ? found.chapters.filter((c) => !skip.has(c.id)).reduce((n, c) => n + c.count + c.titleCount, 0) : 0;

  return (
    <details className="mb-6 rounded-xl border border-ink-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold">Find and replace in the whole book</summary>
      <p className="mb-3 mt-1 text-xs text-ink-700">
        Rename a character, change a term or fix a spelling in every chapter at once. You see where it would change before anything is saved, and the changes appear in the Content Studio too.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-medium">
          Find
          <input className="mt-1 w-full text-sm font-normal" value={find} maxLength={200} onChange={(e) => { setFind(e.target.value); edited(); }} />
        </label>
        <label className="block text-xs font-medium">
          Replace with
          <input className="mt-1 w-full text-sm font-normal" value={replace} maxLength={2000} onChange={(e) => { setReplace(e.target.value); edited(); }} />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={matchCase} onChange={(e) => { setMatchCase(e.target.checked); edited(); }} /> Match case
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={wholeWord} onChange={(e) => { setWholeWord(e.target.checked); edited(); }} /> Whole words only
        </label>
        <Button variant="secondary" className="ml-auto" onClick={preview} loading={busy === "preview"} disabled={!find.trim() || busy !== null}>
          <Search size={14} /> Show matches
        </Button>
      </div>
      <ErrorNote message={error} />
      {done && (
        <p role="status" className="mt-3 flex items-center gap-1 rounded-lg bg-accent-soft p-2 text-xs text-accent-dark">
          <Check size={14} /> {done}
        </p>
      )}

      {found &&
        (found.chapters.length === 0 ? (
          <p className="mt-3 text-sm text-ink-700">No matches in the written chapters.</p>
        ) : (
          <div className="mt-3 space-y-3">
            <ul className="space-y-2">
              {found.chapters.map((c) => (
                <li key={c.id} className="rounded-lg border border-ink-200 p-2 text-sm">
                  <label className="flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={!skip.has(c.id)}
                      onChange={(e) =>
                        setSkip((s) => {
                          const next = new Set(s);
                          if (e.target.checked) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {c.order}. {c.title}
                    </span>
                    <span className="shrink-0 text-xs font-normal text-ink-700">
                      {c.count + c.titleCount} match{c.count + c.titleCount === 1 ? "" : "es"}
                    </span>
                  </label>
                  {c.samples.map((s, i) => (
                    <p key={i} className="mt-1 break-words pl-6 text-xs text-ink-700">
                      …{s.before}
                      <mark className="rounded bg-amber-200 px-0.5 text-ink-900">{s.match}</mark>
                      {s.after}…
                    </p>
                  ))}
                </li>
              ))}
            </ul>
            <Button onClick={apply} loading={busy === "apply"} disabled={chosenTotal === 0 || busy !== null}>
              <Replace size={14} /> Replace {chosenTotal} match{chosenTotal === 1 ? "" : "es"}
            </Button>
          </div>
        ))}
    </details>
  );
}
