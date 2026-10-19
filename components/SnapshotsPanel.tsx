"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, RotateCcw, Trash2 } from "lucide-react";
import { api, post } from "@/lib/client";
import { Button, ErrorNote } from "./ui/kit";
import { CollapsibleCard } from "./ui/Collapsible";
import type { ChapterRow } from "./ChapterEditor";

interface Snapshot {
  id: string;
  label: string;
  source: string;
  createdAt: string;
  chapters: number;
  drafted: number;
  words: number;
}

const SOURCE_LABEL: Record<string, string> = {
  manual: "Milestone",
  autopilot: "Before Autopilot",
  "delete-chapters": "Before deleting chapters",
  restore: "Before restore",
  structure: "Before merging chapters",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

interface Props {
  projectId: string;
  /** Bumped by the parent when something else created a snapshot (Autopilot, delete all), so the list refreshes. */
  refreshKey: number;
  /** Called after a restore with the rebuilt chapters. */
  onRestored: (chapters: ChapterRow[]) => void;
}

/** Whole-project milestones: save the brief, instructions, blueprint and every chapter, and roll back to any of them. */
export function SnapshotsPanel({ projectId, refreshKey, onRestored }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { snapshots } = await api<{ snapshots: Snapshot[] }>(`/api/snapshots?projectId=${projectId}`);
      setSnapshots(snapshots);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load snapshots");
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function create() {
    setBusy("create");
    setError(null);
    try {
      await post("/api/snapshots", { projectId, action: "create", label: label.trim() });
      setLabel("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save snapshot");
    } finally {
      setBusy(null);
    }
  }

  async function restore(s: Snapshot) {
    const msg = `Restore "${s.label || SOURCE_LABEL[s.source] || "snapshot"}" from ${when(s.createdAt)}? This replaces the brief, instructions, blueprint and chapters (${s.chapters} chapters, ${s.words} words). The current state is saved first, so you can undo it.`;
    if (!window.confirm(msg)) return;
    setBusy(s.id);
    setError(null);
    try {
      const { chapters } = await post<{ chapters: ChapterRow[] }>("/api/snapshots", { projectId, action: "restore", snapshotId: s.id });
      onRestored(chapters);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(s: Snapshot) {
    if (!window.confirm("Delete this snapshot?")) return;
    try {
      await api(`/api/snapshots?projectId=${projectId}&id=${s.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <CollapsibleCard id="snapshots" title="Project snapshots" defaultOpen={false}>
      <p className="text-xs text-ink-700">
        Saves the whole book (brief, instructions, blueprint, every chapter). Taken automatically before Autopilot and before deleting chapters.
      </p>
      <div className="flex gap-2">
        <input className="min-w-0 flex-1" aria-label="Name for this milestone" placeholder="Name this milestone" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button variant="secondary" onClick={create} loading={busy === "create"}>
          <Camera size={14} /> Save
        </Button>
      </div>
      <ErrorNote message={error} />
      {snapshots?.length === 0 && <p className="text-xs text-ink-700">No snapshots yet.</p>}
      <ul className="space-y-2">
        {snapshots?.map((s) => (
          <li key={s.id} className="rounded-lg border px-3 py-2 text-sm">
            <p className="font-medium">{s.label || SOURCE_LABEL[s.source] || s.source}</p>
            <p className="text-xs text-ink-700/80">
              {when(s.createdAt)} · {s.drafted}/{s.chapters} drafted · {s.words} words
            </p>
            <div className="mt-1 flex gap-1">
              <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => restore(s)} loading={busy === s.id}>
                <RotateCcw size={12} /> Restore
              </Button>
              <Button variant="ghost" className="!px-2 !py-1 text-xs !text-red-600" onClick={() => remove(s)} aria-label="Delete snapshot">
                <Trash2 size={12} />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </CollapsibleCard>
  );
}
