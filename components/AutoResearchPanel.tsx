"use client";

import { useState } from "react";
import { patch } from "@/lib/client";
import { useProject } from "./ProjectProvider";
import { Card, ErrorNote } from "./ui/kit";

const FREQUENCIES = [
  { days: 1, label: "Every day" },
  { days: 3, label: "Every 3 days" },
  { days: 7, label: "Every week" },
  { days: 30, label: "Every month" },
];

/** Turns scheduled web research on or off for the project. The schedule itself runs from /api/cron/research. */
export function AutoResearchPanel({ projectId }: { projectId: string }) {
  const { current, refresh } = useProject();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!current || current.id !== projectId) return null;

  async function save(body: { autoResearch?: boolean; autoResearchEveryDays?: number }) {
    setBusy(true);
    setError(null);
    try {
      await patch("/api/projects", { id: projectId, ...body });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={current.autoResearch}
            disabled={busy}
            onChange={(e) => save({ autoResearch: e.target.checked })}
          />
          Auto-research this niche
        </label>
        <select
          aria-label="How often"
          value={current.autoResearchEveryDays}
          disabled={busy || !current.autoResearch}
          onChange={(e) => save({ autoResearchEveryDays: Number(e.target.value) })}
        >
          {FREQUENCIES.map((f) => (
            <option key={f.days} value={f.days}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-ink-700">
        Re-runs the web search and scoring on a schedule and saves a new report that shows how the score and competitors changed.
        {current.lastAutoResearchAt && <> Last automatic run: {new Date(current.lastAutoResearchAt).toLocaleString()}.</>}
      </p>
      <ErrorNote message={error} />
    </Card>
  );
}
