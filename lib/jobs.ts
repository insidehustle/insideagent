/**
 * Server-side background jobs. "Write the whole book" is stored as a BookJob row and done in short slices,
 * so it carries on when the browser tab is closed and fits the host's request time limit.
 *
 * Any of these can run a slice: the open browser tab, the end of the previous slice (chaining), or a scheduled
 * ping of /api/cron/jobs. A lock on the row stops two slices working on one job at once, and every step re-reads
 * the database, so a slice that is cut off simply leaves the job for the next one to pick up.
 */
import { Prisma, type BookJob } from "@prisma/client";
import { prisma } from "./prisma";
import { detectCharacters } from "./characters";
import { planOutline, draftChapter } from "./book-writer";
import { createSnapshot } from "./snapshots";
import { classifyError, issueSummary, PROVIDER_LABEL, type ServiceIssue } from "./errors";
import { HttpError } from "./utils";

export type JobStatus = "queued" | "running" | "waiting" | "paused" | "completed" | "failed" | "cancelled";
export interface JobParams {
  words: number;
  redraft: boolean;
  count: number;
}

const ACTIVE: JobStatus[] = ["queued", "running", "waiting"];
/** Do not start another chapter once a slice has run this long; the host allows 300s per request. */
const SLICE_BUDGET_MS = 170_000;
/** Hard ceiling for waiting inside a slice for a short rate limit to clear. */
const SLICE_HARD_MS = 240_000;
/** Longer than any slice, so a slice that died is picked up again. */
const LOCK_MS = 330_000;
/** Tries at the same step before the job pauses and asks for help. */
const MAX_ATTEMPTS = 3;
/** Rate limits in a row before giving up for now. */
const MAX_WAIT_HITS = 25;
/** A rate limit this short is waited out inside the slice. */
const SHORT_WAIT_MS = 45_000;
const MAX_ACTIVE_PER_USER = 2;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Thrown to leave the loop when the job was cancelled or paused from outside while a slice was working. */
class JobStopped extends Error {}
/** Thrown to pause the job with an explanation. */
class JobPause extends Error {
  constructor(public issue: ServiceIssue) {
    super(issue.title);
  }
}

export interface PublicJob {
  id: string;
  projectId: string;
  status: JobStatus;
  phase: string;
  message: string;
  issue: ServiceIssue | null;
  error: string | null;
  total: number;
  done: number;
  params: JobParams;
  nextRunAt: string;
  /** True while a slice is working on it right now */
  working: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export function toPublic(job: BookJob): PublicJob {
  return {
    id: job.id,
    projectId: job.projectId,
    status: job.status as JobStatus,
    phase: job.phase,
    message: job.message,
    issue: (job.issue as unknown as ServiceIssue | null) ?? null,
    error: job.error,
    total: job.chapterIds.length,
    done: job.doneIds.length,
    params: job.params as unknown as JobParams,
    nextRunAt: job.nextRunAt.toISOString(),
    working: !!job.lockedUntil && job.lockedUntil.getTime() > Date.now(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
  };
}

/** Starts a "write the whole book" job. One job per book; a couple per author so one person cannot run up the AI bill unattended. */
export async function createJob(userId: string, projectId: string, input: Partial<JobParams>) {
  const params: JobParams = {
    words: Math.min(4000, Math.max(500, Math.round(Number(input.words)) || 1500)),
    redraft: Boolean(input.redraft),
    count: Math.min(30, Math.max(3, Math.round(Number(input.count)) || 10)),
  };
  const open = await prisma.bookJob.findFirst({ where: { projectId, status: { in: [...ACTIVE, "paused"] } } });
  if (open) {
    throw new HttpError(
      409,
      open.status === "paused"
        ? "This book has a paused job. Resume it or cancel it before starting another."
        : "This book is already being written. Wait for it to finish, or cancel it first.",
    );
  }
  const mine = await prisma.bookJob.count({ where: { userId, status: { in: ACTIVE } } });
  if (mine >= MAX_ACTIVE_PER_USER) {
    throw new HttpError(429, `You already have ${mine} books being written. Wait for one to finish, or cancel one, before starting another.`);
  }
  return prisma.bookJob.create({
    data: { projectId, userId, params: params as unknown as Prisma.InputJsonValue, message: "Queued. Starting shortly." },
  });
}

export function latestJob(projectId: string) {
  return prisma.bookJob.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } });
}

export async function cancelJob(projectId: string, jobId: string) {
  await prisma.bookJob.updateMany({
    where: { id: jobId, projectId, status: { in: [...ACTIVE, "paused"] } },
    data: { status: "cancelled", finishedAt: new Date(), message: "Cancelled. Chapters already written are kept.", issue: Prisma.DbNull },
  });
  return prisma.bookJob.findUnique({ where: { id: jobId } });
}

/** Lets a paused, failed or waiting job try again now (after the author fixed the cause, or to skip the wait). */
export async function resumeJob(projectId: string, jobId: string) {
  await prisma.bookJob.updateMany({
    where: { id: jobId, projectId, status: { in: ["paused", "failed", "waiting"] } },
    data: {
      status: "queued",
      attempts: 0,
      waitHits: 0,
      nextRunAt: new Date(),
      lockedUntil: null,
      finishedAt: null,
      error: null,
      issue: Prisma.DbNull,
      message: "Resuming…",
    },
  });
  return prisma.bookJob.findUnique({ where: { id: jobId } });
}

/** Asks the server to run the next slice of a job in a fresh request, so work continues without a browser. Needs CRON_SECRET and NEXTAUTH_URL. */
export async function kickWorker(jobId?: string): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const base = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  if (!secret || !base) return false;
  try {
    // the new request is accepted before we stop waiting; aborting our side afterwards is expected
    await fetch(`${base}/api/cron/jobs${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ""}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // timeout or refused: the scheduled ping or the open tab will pick the job up
  }
  return true;
}

/** Whether this server is set up to carry a job on by itself (needs CRON_SECRET and the site's own URL). Otherwise an open tab or a scheduled ping must do it. */
export function canSelfDrive(): boolean {
  return Boolean(process.env.CRON_SECRET && (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL));
}

/** The next job that is due and not being worked on. */
export function nextDueJob() {
  const now = new Date();
  return prisma.bookJob.findFirst({
    where: { status: { in: ACTIVE }, nextRunAt: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    orderBy: { nextRunAt: "asc" },
  });
}

/** Writes progress for the running job; throws JobStopped if it was cancelled or paused meanwhile. Also extends the lock. */
async function update(jobId: string, data: Prisma.BookJobUpdateManyMutationInput) {
  const { count } = await prisma.bookJob.updateMany({
    where: { id: jobId, status: "running" },
    data: { ...data, heartbeatAt: new Date(), lockedUntil: new Date(Date.now() + LOCK_MS) },
  });
  if (count === 0) throw new JobStopped();
}

/** Counts a try at a slow step before doing it, so a slice killed by the host's time limit still counts as a failed try. */
async function startTry(job: BookJob, what: string) {
  if (job.attempts >= MAX_ATTEMPTS) {
    throw new JobPause({
      code: "timeout",
      title: `${what} did not finish after ${MAX_ATTEMPTS} tries`,
      message: "It kept running out of time or failing, most often because the chapter is too long for one request.",
      action: "Lower the words per chapter, or switch off some reference documents, then press Resume.",
    });
  }
  await update(job.id, { attempts: job.attempts + 1 });
}

/** Does one unit of work. Returns "finished" when the job is complete. */
async function step(job: BookJob): Promise<"continue" | "finished"> {
  const params = job.params as unknown as JobParams;
  const { projectId } = job;

  switch (job.phase) {
    case "start": {
      await update(job.id, { phase: "characters", message: "Starting…" });
      return "continue";
    }
    case "characters": {
      if ((await prisma.character.count({ where: { projectId } })) === 0) {
        await update(job.id, { message: "Detecting characters…" });
        try {
          await detectCharacters(projectId);
        } catch {
          // no documents or no named characters is normal for non-fiction
        }
      }
      await update(job.id, { phase: "outline" });
      return "continue";
    }
    case "outline": {
      if ((await prisma.chapter.count({ where: { projectId } })) === 0) {
        await startTry(job, "Planning the outline");
        await update(job.id, { message: "Planning the outline from your documents and instructions…" });
        await planOutline(projectId, { chapterCount: params.count });
      }
      await update(job.id, { phase: "snapshot", attempts: 0, waitHits: 0, issue: Prisma.DbNull });
      return "continue";
    }
    case "snapshot": {
      const chapters = await prisma.chapter.findMany({ where: { projectId }, orderBy: { order: "asc" }, select: { id: true, status: true } });
      if (chapters.length === 0) throw new HttpError(400, "There are no chapters to write.");
      if (chapters.some((c) => c.status !== "outline")) {
        await update(job.id, { message: "Saving a snapshot of the current book…" });
        await createSnapshot(projectId, "autopilot", "Before Autopilot");
      }
      const todo = chapters.filter((c) => params.redraft || c.status === "outline").map((c) => c.id);
      await update(job.id, {
        phase: "chapters",
        chapterIds: todo,
        doneIds: [],
        message: todo.length ? `Ready to write ${todo.length} chapter${todo.length === 1 ? "" : "s"}.` : "Nothing to write: every chapter is already drafted.",
      });
      return "continue";
    }
    case "chapters": {
      const nextId = job.chapterIds.find((id) => !job.doneIds.includes(id));
      if (!nextId) {
        await update(job.id, {
          status: "completed",
          phase: "done",
          finishedAt: new Date(),
          message: job.chapterIds.length ? `Done. ${job.chapterIds.length} chapter${job.chapterIds.length === 1 ? "" : "s"} written.` : "Nothing to write: every chapter is already drafted.",
          issue: Prisma.DbNull,
          error: null,
        });
        return "finished";
      }
      const chapter = await prisma.chapter.findUnique({ where: { id: nextId }, select: { order: true, title: true, status: true } });
      // deleted, or written by hand while the job ran: leave it alone
      if (!chapter || (!params.redraft && chapter.status !== "outline")) {
        await update(job.id, { doneIds: [...job.doneIds, nextId] });
        return "continue";
      }
      await startTry(job, `Chapter ${chapter.order}`);
      await update(job.id, { message: `Writing chapter ${chapter.order} of ${job.chapterIds.length}: ${chapter.title}` });
      await draftChapter(nextId, { wordTarget: params.words });
      await update(job.id, {
        doneIds: [...job.doneIds, nextId],
        attempts: 0,
        waitHits: 0,
        issue: Prisma.DbNull,
        message: `Finished chapter ${chapter.order} of ${job.chapterIds.length}.`,
      });
      return "continue";
    }
    default:
      throw new HttpError(500, `Unknown job phase "${job.phase}"`);
  }
}

const clock = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Decides what a failure means for the job. Returns "retry" to carry on in this slice, or "stop" when the job was parked. */
async function onError(jobId: string, e: unknown, startedMs: number): Promise<"retry" | "stop"> {
  if (e instanceof JobStopped) return "stop";
  const job = await prisma.bookJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "running") return "stop";

  const park = (data: Prisma.BookJobUpdateManyMutationInput) =>
    prisma.bookJob.updateMany({ where: { id: jobId, status: "running" }, data: { ...data, lockedUntil: null, heartbeatAt: new Date() } });
  const pause = async (issue: ServiceIssue, message?: string) => {
    await park({ status: "paused", issue: issue as unknown as Prisma.InputJsonValue, message: message ?? issue.title, error: issueSummary(issue) });
    return "stop" as const;
  };

  if (e instanceof JobPause) return pause(e.issue);

  // a problem with the request itself that only the author can fix (a 5xx from our own code is treated as temporary below)
  if (e instanceof HttpError && e.status < 500) {
    return pause({ code: "unknown", title: e.message, message: "The job cannot continue as it is.", action: "Fix this, then press Resume or start a new job." });
  }

  const issue = classifyError(e);

  if (issue?.code === "rate_limit") {
    const waitSec = Math.min(600, Math.max(10, issue.retryAfterSec ?? 60));
    const who = issue.provider ? PROVIDER_LABEL[issue.provider] : "The AI provider";
    const waitHits = job.waitHits + 1;
    if (waitHits > MAX_WAIT_HITS) {
      return pause({ ...issue, title: `${who} keeps rate limiting this job`, action: "Try again later, or use a plan with higher limits. Press Resume when ready." });
    }
    // a rate limit is not the step's fault: give back the try that was counted
    const attempts = Math.max(0, job.attempts - 1);
    const elapsed = Date.now() - startedMs;
    if (waitSec * 1000 <= SHORT_WAIT_MS && elapsed + waitSec * 1000 < SLICE_HARD_MS) {
      await update(jobId, { waitHits, attempts, issue: issue as unknown as Prisma.InputJsonValue, message: `${who} hit its per-minute limit. Waiting ${waitSec}s, then carrying on.` });
      await sleep(waitSec * 1000);
      return "retry";
    }
    const resumeAt = new Date(Date.now() + waitSec * 1000);
    await park({
      status: "waiting",
      waitHits,
      attempts,
      nextRunAt: resumeAt,
      issue: issue as unknown as Prisma.InputJsonValue,
      message: `${who} hit its limit. Resuming automatically around ${clock(resumeAt)}.`,
    });
    return "stop";
  }

  // needs the author: allowance used up, key problems, oversized request, database trouble
  if (issue && ["quota", "auth", "missing_key", "too_large", "database"].includes(issue.code)) return pause(issue);

  // temporary trouble or something unknown: back off and try again, a few times
  if (job.attempts >= MAX_ATTEMPTS) {
    const msg = e instanceof Error ? e.message : String(e);
    return pause(
      issue ?? {
        code: "unknown",
        title: "The job stopped on an error",
        message: msg.slice(0, 300),
        action: "Check the message, fix the cause if you can, then press Resume.",
      },
    );
  }
  const delaySec = 30 * 2 ** Math.max(0, job.attempts - 1);
  const retryAt = new Date(Date.now() + delaySec * 1000);
  await park({
    status: "waiting",
    nextRunAt: retryAt,
    issue: issue ? (issue as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    message: `${issue ? issue.title : "A step failed"}. Trying again around ${clock(retryAt)} (try ${job.attempts} of ${MAX_ATTEMPTS}).`,
  });
  return "stop";
}

/**
 * Runs one slice of a job: claims it, does steps until the time budget is used up or the job stops, then hands on.
 * Safe to call from anywhere at any time; if the job is locked, not due or finished, nothing happens.
 */
export async function runSlice(jobId: string): Promise<{ ran: boolean; job: PublicJob | null }> {
  const now = new Date();
  const claim = await prisma.bookJob.updateMany({
    where: {
      id: jobId,
      status: { in: ACTIVE },
      nextRunAt: { lte: now },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: { status: "running", lockedUntil: new Date(now.getTime() + LOCK_MS), heartbeatAt: now },
  });
  if (claim.count === 0) {
    const job = await prisma.bookJob.findUnique({ where: { id: jobId } });
    return { ran: false, job: job ? toPublic(job) : null };
  }
  await prisma.bookJob.updateMany({ where: { id: jobId, startedAt: null }, data: { startedAt: now } });

  const started = Date.now();
  try {
    for (;;) {
      const job = await prisma.bookJob.findUnique({ where: { id: jobId } });
      if (!job || job.status !== "running") break;
      if (job.phase === "chapters" && Date.now() - started > SLICE_BUDGET_MS) {
        // out of time for this request: hand the rest to the next slice
        await prisma.bookJob.updateMany({ where: { id: jobId, status: "running" }, data: { status: "queued", nextRunAt: new Date() } });
        break;
      }
      try {
        if ((await step(job)) === "finished") break;
      } catch (e) {
        if ((await onError(jobId, e, started)) === "stop") break;
      }
    }
  } finally {
    await prisma.bookJob.updateMany({ where: { id: jobId, lockedUntil: { not: null } }, data: { lockedUntil: null } });
  }

  const after = await prisma.bookJob.findUnique({ where: { id: jobId } });
  // more to do right now: start the next slice in a new request
  if (after && ACTIVE.includes(after.status as JobStatus) && after.nextRunAt.getTime() <= Date.now() + 1000) {
    await kickWorker(jobId);
  }
  return { ran: true, job: after ? toPublic(after) : null };
}
