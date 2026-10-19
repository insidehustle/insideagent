"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, X } from "lucide-react";
import { ISSUE_EVENT, OK_EVENT, type IssueEventDetail } from "@/lib/client";
import { BLOCKING, formatWait, type ServiceIssue } from "@/lib/errors";

interface Shown {
  issue: ServiceIssue;
  path: string;
  /** When waiting should be enough, as a timestamp */
  until: number | null;
}

/**
 * A floating notice that stays on screen when an outside service stops the work (rate limit, quota used up, bad key, outage),
 * saying which service, why and what to do. It clears itself when the wait is over or the same request next succeeds.
 */
export function ServiceStatusBanner() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [details, setDetails] = useState(false);

  useEffect(() => {
    const onIssue = (e: Event) => {
      const { issue, path } = (e as CustomEvent<IssueEventDetail>).detail;
      if (!BLOCKING.includes(issue.code)) return;
      const until = issue.retryAfterSec && issue.code === "rate_limit" ? Date.now() + issue.retryAfterSec * 1000 : null;
      setShown({ issue, path, until });
      setNow(Date.now());
      setDetails(false);
    };
    const onOk = (e: Event) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail;
      setShown((s) => (s && s.path === path ? null : s));
    };
    window.addEventListener(ISSUE_EVENT, onIssue);
    window.addEventListener(OK_EVENT, onOk);
    return () => {
      window.removeEventListener(ISSUE_EVENT, onIssue);
      window.removeEventListener(OK_EVENT, onOk);
    };
  }, []);

  // tick while a countdown is showing, and clear when the wait is over
  useEffect(() => {
    if (!shown?.until) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (shown.until && n >= shown.until) setShown(null);
    }, 1000);
    return () => clearInterval(t);
  }, [shown]);

  if (!shown) return null;
  const { issue, until } = shown;
  const remaining = until ? Math.max(0, Math.ceil((until - now) / 1000)) : null;
  const waiting = issue.code === "rate_limit" || (issue.code === "quota" && issue.window === "day");

  return (
    <div
      role="alert"
      className="fixed inset-x-3 bottom-3 z-40 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-lg md:inset-x-auto md:bottom-6 md:right-6 md:w-[26rem]"
    >
      <div className="flex items-start gap-3">
        {waiting ? <Clock size={18} className="mt-0.5 shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold">{issue.title}</p>
          <p>{issue.message}</p>
          <p>{issue.action}</p>
          {remaining !== null && remaining > 0 && <p className="font-medium">Try again in {formatWait(remaining)}.</p>}
          {issue.code === "quota" && issue.retryAfterSec ? <p className="font-medium">Resets in {formatWait(issue.retryAfterSec)}.</p> : null}
          {issue.detail && (
            <div>
              <button className="text-xs underline" onClick={() => setDetails((d) => !d)} aria-expanded={details}>
                {details ? "Hide technical details" : "Show technical details"}
              </button>
              {details && <p className="mt-1 break-words rounded bg-amber-100 p-2 font-mono text-xs">{issue.detail}</p>}
            </div>
          )}
        </div>
        <button onClick={() => setShown(null)} aria-label="Dismiss" className="-m-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-amber-100">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
