"use client";

import { useCallback, useEffect, useState } from "react";
import { Flame, Target } from "lucide-react";
import { api, patch } from "@/lib/client";
import { cn } from "@/lib/cn";
import { useProject } from "./ProjectProvider";
import { Button, ErrorNote, Label } from "./ui/kit";
import { CollapsibleCard } from "./ui/Collapsible";

interface Progress {
  goal: number;
  words: number;
  chapters: number;
  drafted: number;
  perChapter: { id: string; order: number; title: string; status: string; words: number }[];
  activeDays: string[];
  today: string;
}

const PRESETS = [
  { label: "Short guide", words: 20_000 },
  { label: "Standard book", words: 50_000 },
  { label: "Full-length", words: 80_000 },
];

const nf = (n: number) => n.toLocaleString();
const dayMs = 86_400_000;
const toUtc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
const addDays = (d: string, n: number) => new Date(toUtc(d) + n * dayMs).toISOString().slice(0, 10);

/** Current and longest run of consecutive days with edits. A streak is still alive if today has no edits yet but yesterday did. */
function streaks(days: string[], today: string) {
  const set = new Set(days);
  let current = 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of [...set].sort()) {
    run = prev && toUtc(d) - toUtc(prev) === dayMs ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, longest, doneToday: set.has(today) };
}

interface Props {
  projectId: string;
  /** Changes whenever chapter text changes, so the numbers refresh (debounced) */
  signature: string;
  onSelectChapter: (order: number) => void;
}

/** Word count against the book's goal, per-chapter lengths and the writing streak. */
export function ProgressPanel({ projectId, signature, onSelectChapter }: Props) {
  const { current, refresh } = useProject();
  const [data, setData] = useState<Progress | null>(null);
  const [goalText, setGoalText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const tz = new Date().getTimezoneOffset();
      setData(await api<Progress>(`/api/progress?projectId=${projectId}&tz=${tz}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load progress");
    }
  }, [projectId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 1200);
    return () => clearTimeout(t);
  }, [load, signature]);

  useEffect(() => {
    setGoalText(current?.wordGoal ? String(current.wordGoal) : "");
  }, [current?.id, current?.wordGoal]);

  async function saveGoal(words: number) {
    setBusy(true);
    setError(null);
    try {
      await patch("/api/projects", { id: projectId, wordGoal: words });
      await refresh();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the goal");
    } finally {
      setBusy(false);
    }
  }

  const goal = data?.goal ?? 0;
  const pct = goal > 0 && data ? Math.min(100, Math.round((data.words / goal) * 100)) : 0;
  const perChapterTarget = goal > 0 && data && data.chapters > 0 ? Math.round(goal / data.chapters) : 0;
  const maxWords = data ? Math.max(1, perChapterTarget, ...data.perChapter.map((c) => c.words)) : 1;
  const s = data ? streaks(data.activeDays, data.today) : null;
  const last14 = data ? Array.from({ length: 14 }, (_, i) => addDays(data.today, i - 13)) : [];

  return (
    <CollapsibleCard id="progress" title={<><Target size={16} /> Progress</>} defaultOpen>
      {!data ? (
        <p className="text-sm text-ink-700">{error ?? "Loading…"}</p>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-2xl font-semibold">
                {nf(data.words)} <span className="text-sm font-normal text-ink-700">{goal > 0 ? `of ${nf(goal)} words` : "words written"}</span>
              </p>
              <p className="text-sm text-ink-700">
                {data.drafted} of {data.chapters} chapters drafted
              </p>
            </div>
            {goal > 0 && (
              <>
                <div
                  className="mt-2 h-3 overflow-hidden rounded-full bg-ink-100"
                  role="progressbar"
                  aria-label="Words written toward the goal"
                  aria-valuemin={0}
                  aria-valuemax={goal}
                  aria-valuenow={Math.min(data.words, goal)}
                  aria-valuetext={`${pct}% of the word goal`}
                >
                  <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-xs text-ink-700">
                  {pct}% there{data.words < goal ? `, ${nf(goal - data.words)} words to go` : ". Goal reached."}
                </p>
              </>
            )}
          </div>

          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveGoal(Math.max(0, Math.round(Number(goalText)) || 0));
            }}
          >
            <label className="block">
              <Label hint="whole book, in words">{goal > 0 ? "Word goal" : "Set a word goal"}</Label>
              <div className="flex gap-2">
                <input type="number" min={0} step={1000} inputMode="numeric" className="min-w-0 flex-1" value={goalText} onChange={(e) => setGoalText(e.target.value)} placeholder="e.g. 50000" />
                <Button type="submit" variant="secondary" loading={busy} disabled={goalText === String(goal || "")}>
                  Save
                </Button>
              </div>
            </label>
            {goal === 0 && (
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button key={p.words} type="button" onClick={() => void saveGoal(p.words)} className="min-h-9 rounded-full border border-ink-200 px-3 text-xs hover:bg-ink-100">
                    {p.label}: {nf(p.words)}
                  </button>
                ))}
              </div>
            )}
          </form>

          {s && (
            <div>
              <p className="flex items-center gap-2 text-sm">
                <Flame size={16} className={cn(s.current > 0 ? "text-orange-600" : "text-ink-200")} />
                <span className="font-medium">
                  {s.current} day{s.current === 1 ? "" : "s"} in a row
                </span>
                <span className="text-xs text-ink-700">· longest {s.longest}</span>
              </p>
              <ul className="mt-2 flex gap-1" aria-label="Days you edited a chapter, last 14 days">
                {last14.map((d) => {
                  const on = data.activeDays.includes(d);
                  return (
                    <li
                      key={d}
                      title={d}
                      aria-label={`${d}: ${on ? "edited" : "no edits"}`}
                      className={cn("h-5 w-5 rounded", on ? "bg-accent" : "bg-ink-100", d === data.today && "ring-2 ring-ink-700/40")}
                    />
                  );
                })}
              </ul>
              <p className="mt-1 text-xs text-ink-700">{s.doneToday ? "You have written today." : s.current > 0 ? "Edit a chapter today to keep the streak." : "Edit a chapter to start a streak."} Days count when a chapter is edited or saved.</p>
            </div>
          )}

          {data.perChapter.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">Chapter lengths{perChapterTarget ? ` (target about ${nf(perChapterTarget)} words each)` : ""}</p>
              <ul className="space-y-1">
                {data.perChapter.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => onSelectChapter(c.order)} className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-ink-100" aria-label={`Chapter ${c.order}, ${c.title}, ${c.words} words. Open it.`}>
                      <span className="w-5 shrink-0 text-right text-ink-700">{c.order}</span>
                      <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded bg-ink-100">
                        <span className={cn("absolute inset-y-0 left-0 rounded", c.status === "outline" ? "bg-ink-200" : "bg-accent")} style={{ width: `${(c.words / maxWords) * 100}%` }} />
                      </span>
                      <span className="w-14 shrink-0 text-right tabular-nums text-ink-700">{nf(c.words)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ErrorNote message={error} />
        </div>
      )}
    </CollapsibleCard>
  );
}
