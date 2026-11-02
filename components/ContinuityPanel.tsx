"use client";

import { useState } from "react";
import { Check, ScanSearch, Wand2 } from "lucide-react";
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

interface Edit {
  find: string;
  replace: string;
}

interface Proposal {
  chapterId: string;
  order: number;
  title: string;
  edits: Edit[];
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
export function ContinuityPanel({
  projectId,
  onSelectChapter,
  onChaptersChanged,
}: {
  projectId: string;
  onSelectChapter: (order: number) => void;
  /** Called after a fix is applied, so the chapters are reloaded */
  onChaptersChanged?: () => void;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // the issue being fixed, the author's instruction, the edits the writer proposed and the issues already fixed
  const [fixing, setFixing] = useState<number | null>(null);
  const [instruction, setInstruction] = useState("");
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [fixBusy, setFixBusy] = useState<"propose" | "apply" | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);
  const [fixed, setFixed] = useState<Set<number>>(new Set());

  function startFix(i: number, it: Issue) {
    setFixing(i);
    setInstruction(it.suggestion ?? "");
    setProposals(null);
    setFixError(null);
  }

  async function propose(it: Issue) {
    setFixBusy("propose");
    setFixError(null);
    try {
      const { proposals } = await post<{ proposals: Proposal[] }>("/api/continuity/fix", { mode: "propose", projectId, instruction, issue: it });
      setProposals(proposals);
    } catch (e) {
      setFixError(e instanceof Error ? e.message : "Could not prepare the fix");
    } finally {
      setFixBusy(null);
    }
  }

  async function apply(i: number) {
    if (!proposals) return;
    setFixBusy("apply");
    setFixError(null);
    try {
      await post("/api/continuity/fix", {
        mode: "apply",
        projectId,
        changes: proposals.filter((p) => p.edits.length).map((p) => ({ chapterId: p.chapterId, edits: p.edits })),
      });
      setFixed((f) => new Set(f).add(i));
      setFixing(null);
      setProposals(null);
      onChaptersChanged?.();
    } catch (e) {
      setFixError(e instanceof Error ? e.message : "Could not apply the fix");
    } finally {
      setFixBusy(null);
    }
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await post<Result>("/api/continuity", { projectId }));
      setFixing(null);
      setProposals(null);
      setFixed(new Set());
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
                {fixed.has(i) && (
                  <p className="mt-2 flex items-center gap-1 text-xs font-medium">
                    <Check size={14} /> Fixed. The earlier text is saved in each chapter&apos;s History.
                  </p>
                )}
                {it.chapters.length > 0 && fixing !== i && (
                  <Button variant="secondary" className="mt-2" onClick={() => startFix(i, it)}>
                    <Wand2 size={14} /> {fixed.has(i) ? "Fix again" : "Fix this"}
                  </Button>
                )}
                {fixing === i && (
                  <div className="mt-2 space-y-2 rounded-lg border border-current/30 bg-white/70 p-2 text-ink-900">
                    <label className="block text-xs font-medium">
                      What should change? The writer edits chapter {[...new Set(it.chapters)].join(", ")} for you.
                      <textarea
                        className="mt-1 w-full text-sm font-normal"
                        rows={3}
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        placeholder="e.g. Her sister is called Maya everywhere; use Maya in chapter 4."
                      />
                    </label>
                    {!proposals && (
                      <div className="flex gap-2">
                        <Button onClick={() => propose(it)} loading={fixBusy === "propose"} disabled={!instruction.trim()}>
                          Show proposed changes
                        </Button>
                        <Button variant="ghost" onClick={() => setFixing(null)}>Cancel</Button>
                      </div>
                    )}
                    {proposals && (
                      <div className="space-y-2">
                        {proposals.every((p) => p.edits.length === 0) && (
                          <p className="text-xs">The writer found nothing to change with that instruction. Try describing the change more specifically.</p>
                        )}
                        {proposals.filter((p) => p.edits.length).map((p) => (
                          <div key={p.chapterId} className="space-y-1">
                            <p className="text-xs font-semibold">Chapter {p.order}: {p.title}</p>
                            {p.edits.map((e, k) => (
                              <div key={k} className="rounded border border-ink-200 p-2 text-xs">
                                <p className="whitespace-pre-wrap text-red-800 line-through decoration-red-300">{e.find}</p>
                                <p className="mt-1 whitespace-pre-wrap text-green-900">{e.replace}</p>
                              </div>
                            ))}
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-2">
                          {proposals.some((p) => p.edits.length) && (
                            <Button onClick={() => apply(i)} loading={fixBusy === "apply"}>Apply changes</Button>
                          )}
                          <Button variant="secondary" onClick={() => propose(it)} loading={fixBusy === "propose"}>Try again</Button>
                          <Button variant="ghost" onClick={() => { setProposals(null); }}>Edit instruction</Button>
                          <Button variant="ghost" onClick={() => setFixing(null)}>Cancel</Button>
                        </div>
                      </div>
                    )}
                    <ErrorNote message={fixError} />
                  </div>
                )}
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
