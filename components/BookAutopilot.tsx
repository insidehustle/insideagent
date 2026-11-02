"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Clock, Play, RotateCw, Rocket, Square } from "lucide-react";
import { api, post } from "@/lib/client";
import { formatWait } from "@/lib/errors";
import type { PublicJob } from "@/lib/jobs";
import { Button, ErrorNote, Label } from "./ui/kit";
import { CollapsibleCard } from "./ui/Collapsible";

interface Props {
  projectId: string;
  /** Chapter count from the Outline panel, the single place this is set. */
  count: number;
  /** Called when the job has changed the book (outline created, a chapter written), so the chapter list can reload. */
  onChanged: () => void;
}

interface JobResponse {
  job: PublicJob | null;
  serverTime: number;
  selfDriving?: boolean;
}

const ACTIVE = ["queued", "running", "waiting"];
const PHASE: Record<string, string> = {
  start: "Starting",
  characters: "Detecting characters",
  outline: "Planning the outline",
  snapshot: "Saving a snapshot",
  chapters: "Writing chapters",
  done: "Done",
};

/**
 * Writes the whole book as a background job on the server: detects characters, outlines from your documents and instructions,
 * then drafts every chapter in order, each continuing from the last. State lives in the database, so it survives closing the tab.
 * If the server cannot carry on by itself, this open tab nudges the job along.
 */
export function BookAutopilot({ projectId, count, onChanged }: Props) {
  const [job, setJob] = useState<PublicJob | null>(null);
  const [selfDriving, setSelfDriving] = useState(false);
  const [words, setWords] = useState(1500);
  const [redraft, setRedraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // server clock minus ours, so countdowns are right even when the computer's clock is off
  const skew = useRef(0);
  const driving = useRef(false);
  const seen = useRef<string>("");
  const changed = useRef(onChanged);
  changed.current = onChanged;

  const accept = useCallback((res: JobResponse) => {
    if (res.serverTime) skew.current = res.serverTime - Date.now();
    if (res.selfDriving !== undefined) setSelfDriving(res.selfDriving);
    setJob(res.job);
    // tell the page when the book itself changed
    const j = res.job;
    const sig = j ? `${j.id}|${j.status}|${j.phase}|${j.done}` : "";
    if (j && seen.current && sig !== seen.current && (j.phase !== "start" && j.phase !== "characters")) changed.current();
    seen.current = sig;
  }, []);

  const load = useCallback(async () => {
    try {
      accept(await api<JobResponse>(`/api/jobs?projectId=${projectId}`));
    } catch {
      // keep showing the last known state; the next poll tries again
    }
  }, [projectId, accept]);

  useEffect(() => {
    seen.current = "";
    setJob(null);
    void load();
  }, [load]);

  const active = !!job && ACTIVE.includes(job.status);

  // follow the job: quickly while it is active, lazily otherwise
  useEffect(() => {
    const t = setInterval(() => void load(), active ? 3000 : 20000);
    return () => clearInterval(t);
  }, [load, active]);

  // drive countdowns
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  // While this tab is open it nudges the job along whenever nothing else is working on it, so progress never depends on one trigger.
  useEffect(() => {
    if (!job || !ACTIVE.includes(job.status) || job.working || driving.current) return;
    if (Date.parse(job.nextRunAt) > now + skew.current) return;
    driving.current = true;
    post<JobResponse & { ran: boolean }>("/api/jobs/run", { jobId: job.id })
      .then((res) => accept({ job: res.job, serverTime: res.serverTime }))
      .catch(() => void load())
      .finally(() => {
        driving.current = false;
      });
  }, [job, now, accept, load]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      accept(await post<JobResponse>("/api/jobs", { projectId, words, redraft, count }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start");
    } finally {
      setBusy(false);
    }
  }

  async function control(action: "cancel" | "resume") {
    if (!job) return;
    if (action === "cancel" && !window.confirm("Stop writing the book? Chapters already written are kept.")) return;
    setBusy(true);
    setError(null);
    try {
      accept(await post<JobResponse>("/api/jobs/control", { jobId: job.id, action }));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the job");
    } finally {
      setBusy(false);
    }
  }

  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
  const waitLeft = job && job.status === "waiting" ? Math.max(0, Math.ceil((Date.parse(job.nextRunAt) - (now + skew.current)) / 1000)) : 0;

  return (
    <CollapsibleCard id="autopilot" title={"Write the whole book"} defaultOpen={false}>
      <p className="text-xs text-ink-700">Uses your documents, characters, writing instructions and blueprint. Existing drafts are kept unless you choose to redraft.</p>

      {job && (active || job.status === "paused") ? (
        <div className="space-y-3" aria-live="polite">
          <div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                {job.status === "paused" ? "Paused" : job.status === "waiting" ? "Waiting" : PHASE[job.phase] ?? "Working"}
              </span>
              {job.total > 0 && (
                <span className="text-xs text-ink-700">
                  {job.done} of {job.total} chapters
                </span>
              )}
            </div>
            {job.total > 0 && (
              <div className="mt-1 h-2 overflow-hidden rounded bg-ink-100" role="progressbar" aria-label="Chapters written" aria-valuemin={0} aria-valuemax={job.total} aria-valuenow={job.done}>
                <div className="h-full rounded bg-accent transition-all" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
          <p className="text-sm">{job.message}</p>

          {job.status === "waiting" && waitLeft > 0 && (
            <p className="flex items-center gap-2 text-xs text-ink-700">
              <Clock size={14} /> Next try in {formatWait(waitLeft)}.
            </p>
          )}

          {job.issue && (job.status === "paused" || job.status === "waiting") && (
            <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="flex items-center gap-2 font-semibold">
                <AlertTriangle size={16} className="shrink-0" /> {job.issue.title}
              </p>
              <p>{job.issue.message}</p>
              <p>{job.issue.action}</p>
            </div>
          )}

          <p className="text-xs text-ink-700">
            {selfDriving
              ? "This runs on the server. You can close this tab; chapters keep being written and will be here when you come back."
              : "Keep this tab open: this server is not set up to continue on its own, so progress happens while the tab is open. See the README to enable background running."}
          </p>

          <div className="flex gap-2">
            {(job.status === "paused" || job.status === "waiting") && (
              <Button className="flex-1" onClick={() => control("resume")} loading={busy}>
                {job.status === "paused" ? <Play size={14} /> : <RotateCw size={14} />} {job.status === "paused" ? "Resume" : "Try now"}
              </Button>
            )}
            <Button variant="secondary" className="flex-1" onClick={() => control("cancel")} disabled={busy}>
              <Square size={14} /> Stop
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-ink-700">
            Plans {count} chapters (change this in the Outline panel). If an outline already exists, it is used as it is.
          </p>
          <label className="block">
            <Label>Words each</Label>
            <input type="number" min={500} max={4000} step={100} className="w-full" value={words} onChange={(e) => setWords(+e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={redraft} onChange={(e) => setRedraft(e.target.checked)} />
            Redraft chapters that are already written
          </label>
          <Button className="w-full" onClick={start} loading={busy}>
            <Rocket size={14} /> Write the book automatically
          </Button>
          {job && (job.status === "completed" || job.status === "cancelled" || job.status === "failed") && (
            <p className="text-xs text-ink-700">
              Last run: {job.status === "completed" ? "finished" : job.status}. {job.message}
            </p>
          )}
        </>
      )}
      <ErrorNote message={error} />
    </CollapsibleCard>
  );
}
