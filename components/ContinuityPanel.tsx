"use client";

import { useState } from "react";
import { ScanSearch } from "lucide-react";
import { post } from "@/lib/client";
import { cn } from "@/lib/cn";
import { Button, ErrorNote } from "./ui/kit";
import { CollapsibleCard } from "./ui/Collapsible";

interface Issue {
  kind: string;
  severity: "high" | "medium" | "low";
  chapters: number[];
  description: string;
  suggestion: string;
  source: "scan" | "ai";
}

interface Result {
  checked: number;
  issues: Issue[];
  ai: "done" | "unavailable" | "skipped";
  aiNote?: string;
}

const KIND: Record<string, string> = {
  repetition: "Repeated wording",
  opening: "Same opening",
  length: "Length",
  names: "Unknown name",
  empty: "Empty chapter",
  contradiction: "Contradiction",
  dropped_thread: "Dropped thread",
  promise_gap: "Promise not kept",
  pacing: "Flow",
};

const SEVERITY = {
  high: "border-red-200 bg-red-50 text-red-900",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  low: "border-ink-200 bg-ink-50 text-ink-900",
} as const;

/** Looks across the drafted chapters for repeated wording, lopsided lengths, unknown names, contradictions and dropped threads. */
export function ContinuityPanel({ projectId, onSelectChapter }: { projectId: string; onSelectChapter: (order: number) => void }) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await post<Result>("/api/continuity", { projectId }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CollapsibleCard id="continuity" title="Continuity check" defaultOpen={false}>
      <p className="text-xs text-ink-700">
        Reads across your drafted chapters for repeated phrases, repeated openings, very short or long chapters, names that are not in Characters, and (with AI) contradictions and dropped threads.
      </p>
      <Button variant="secondary" className="w-full" onClick={run} loading={busy}>
        <ScanSearch size={14} /> {result ? "Check again" : "Check the book"}
      </Button>
      <ErrorNote message={error} />
      {result && (
        <div className="space-y-2" aria-live="polite">
          <p className="text-xs text-ink-700">
            Checked {result.checked} drafted chapter{result.checked === 1 ? "" : "s"}.{" "}
            {result.issues.length === 0 ? "No problems found." : `${result.issues.length} thing${result.issues.length === 1 ? "" : "s"} to look at.`}
          </p>
          {result.aiNote && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{result.aiNote}</p>}
          <ul className="space-y-2">
            {result.issues.map((it, i) => (
              <li key={i} className={cn("rounded-lg border p-3 text-sm", SEVERITY[it.severity])}>
                <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                  <span>{KIND[it.kind] ?? it.kind}</span>
                  <span className="font-normal normal-case opacity-80">{it.severity} · {it.source === "ai" ? "AI reading, please verify" : "exact match"}</span>
                </p>
                <p className="mt-1">{it.description}</p>
                {it.suggestion && <p className="mt-1 text-xs opacity-90">{it.suggestion}</p>}
                {it.chapters.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-1">
                    {[...new Set(it.chapters)].map((n) => (
                      <button key={n} onClick={() => onSelectChapter(n)} className="min-h-8 rounded-full border border-current px-3 text-xs hover:bg-white/60">
                        Open chapter {n}
                      </button>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </CollapsibleCard>
  );
}
