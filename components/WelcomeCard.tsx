"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, GraduationCap, X } from "lucide-react";
import { useProject } from "./ProjectProvider";
import { Card } from "./ui/kit";
import { WALKTHROUGH } from "@/lib/tutorial";

const DISMISSED = "bas.welcome.dismissed";

/**
 * Points new authors at the tutorial and, once they are under way, at the next undone step.
 * The welcome message can be dismissed; the next-step line stays until the basics are done.
 */
export function WelcomeCard() {
  const { current, projects, loading } = useProject();
  const [dismissed, setDismissed] = useState(true); // hidden until we know, so it does not flash

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (loading) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // the card just comes back next visit
    }
  }

  // the first three walkthrough steps can be detected from the project itself
  const done = new Set<string>();
  if (current) {
    done.add("project");
    if (current.blueprint) done.add("blueprint");
    if (current._count.outlierReports > 0) done.add("research");
    if (current._count.chapters > 0) done.add("outline");
  }
  const next = current ? WALKTHROUGH.find((s) => !done.has(s.id) && ["blueprint", "research", "outline"].includes(s.id)) : null;

  if (projects.length === 0 && !dismissed) {
    return (
      <Card className="border-accent/40 bg-accent-soft/40">
        <div className="flex items-start gap-3">
          <GraduationCap size={22} className="mt-0.5 shrink-0 text-accent-dark" />
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="font-serif text-xl">Welcome. Here is how this works.</h2>
            <p className="text-sm text-ink-700">
              You describe who you are as an author, research where your niche is under-served, outline the book, then draft and polish each chapter in your own voice. The tutorial walks you through it in about five minutes.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/dashboard/projects/new" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
                Create my first project <ArrowRight size={14} />
              </Link>
              <Link href="/dashboard/tutorial" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium hover:bg-ink-100">
                Take the tour
              </Link>
            </div>
          </div>
          <button onClick={dismiss} aria-label="Dismiss the welcome message" className="-m-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-white/60">
            <X size={16} />
          </button>
        </div>
      </Card>
    );
  }

  if (next) {
    return (
      <Card className="border-accent/40 bg-accent-soft/40">
        <p className="text-xs font-medium uppercase tracking-wide text-accent-dark">Your next step</p>
        <h2 className="mt-1 font-serif text-xl">{next.title}</h2>
        <p className="mt-1 text-sm text-ink-700">{next.why}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={next.href} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
            {next.linkLabel} <ArrowRight size={14} />
          </Link>
          <Link href="/dashboard/tutorial" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium hover:bg-ink-100">
            Open the walkthrough
          </Link>
        </div>
      </Card>
    );
  }
  return null;
}
