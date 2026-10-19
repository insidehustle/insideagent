"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Circle, Lightbulb, RotateCcw } from "lucide-react";
import { useProject } from "@/components/ProjectProvider";
import { Button, Card, PageHeader } from "@/components/ui/kit";
import { cn } from "@/lib/cn";
import { FAQ, GUIDES, WALKTHROUGH } from "@/lib/tutorial";

const STORAGE = "bas.tutorial";

interface Saved {
  step: number;
  done: string[];
}

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) {
      const v = JSON.parse(raw) as Saved;
      return { step: Math.min(Math.max(Number(v.step) || 0, 0), WALKTHROUGH.length - 1), done: Array.isArray(v.done) ? v.done : [] };
    }
  } catch {
    // storage unavailable or corrupt: start fresh
  }
  return { step: 0, done: [] };
}

function Walkthrough() {
  const { current } = useProject();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = loadSaved();
    setStep(s.step);
    setDone(s.done);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ step, done }));
    } catch {
      // progress just will not persist
    }
  }, [step, done, ready]);

  // steps the app can see are finished for the selected project
  const detected = new Set<string>();
  if (current) {
    detected.add("project");
    if (current.blueprint) detected.add("blueprint");
    if (current._count.outlierReports > 0) detected.add("research");
    if (current._count.chapters > 0) detected.add("outline");
  }
  const isDone = (id: string) => detected.has(id) || done.includes(id);
  const completed = WALKTHROUGH.filter((s) => isDone(s.id)).length;

  const s = WALKTHROUGH[step];
  const toggleDone = () => setDone((d) => (d.includes(s.id) ? d.filter((x) => x !== s.id) : [...d, s.id]));
  const manual = done.includes(s.id);

  return (
    <Card className="p-0">
      <div className="border-b border-ink-200 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Guided walkthrough</h2>
          <p className="text-xs text-ink-700">
            {completed} of {WALKTHROUGH.length} steps done
            {current ? ` for "${current.title}"` : ""}
          </p>
        </div>
        <div className="mt-2 h-2 rounded bg-ink-100" role="progressbar" aria-valuemin={0} aria-valuemax={WALKTHROUGH.length} aria-valuenow={completed}>
          <div className="h-full rounded bg-accent transition-all" style={{ width: `${(completed / WALKTHROUGH.length) * 100}%` }} />
        </div>
      </div>

      <div className="grid md:grid-cols-[15rem_1fr]">
        <nav className="border-b border-ink-200 p-2 md:border-b-0 md:border-r" aria-label="Walkthrough steps">
          <ol className="flex gap-1 overflow-x-auto md:flex-col">
            {WALKTHROUGH.map((w, i) => (
              <li key={w.id} className="shrink-0">
                <button
                  onClick={() => setStep(i)}
                  aria-current={i === step ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                    i === step ? "bg-accent-soft font-medium text-accent-dark" : "text-ink-700 hover:bg-ink-100",
                  )}
                >
                  {isDone(w.id) ? <Check size={14} className="shrink-0 text-green-700" /> : <Circle size={14} className="shrink-0 text-ink-200" />}
                  <span className="whitespace-nowrap md:whitespace-normal">
                    {i + 1}. {w.title}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-4 p-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-700/70">
              Step {step + 1} of {WALKTHROUGH.length}
            </p>
            <h3 className="font-serif text-2xl">{s.title}</h3>
            <p className="mt-1 text-ink-700">{s.why}</p>
          </div>

          <ol className="space-y-2">
            {s.actions.map((a, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent-dark">
                  {i + 1}
                </span>
                <span>{a}</span>
              </li>
            ))}
          </ol>

          {s.tip && (
            <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <Lightbulb size={16} className="mt-0.5 shrink-0" />
              <span>{s.tip}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-ink-200 pt-4">
            <Link
              href={s.href}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
            >
              {s.linkLabel} <ArrowRight size={14} />
            </Link>
            {detected.has(s.id) ? (
              <span className="inline-flex items-center gap-1 text-sm text-green-700">
                <Check size={14} /> Done for this project
              </span>
            ) : (
              <Button variant="secondary" onClick={toggleDone}>
                {manual ? <RotateCcw size={14} /> : <Check size={14} />} {manual ? "Mark not done" : "Mark done"}
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" onClick={() => setStep((n) => Math.max(0, n - 1))} disabled={step === 0}>
                <ArrowLeft size={14} /> Back
              </Button>
              <Button variant="secondary" onClick={() => setStep((n) => Math.min(WALKTHROUGH.length - 1, n + 1))} disabled={step === WALKTHROUGH.length - 1}>
                Next <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Guides() {
  const [open, setOpen] = useState<string>(GUIDES[0].id);
  return (
    <section aria-labelledby="guides" className="space-y-3">
      <h2 id="guides" className="font-serif text-2xl">
        Feature guides
      </h2>
      {GUIDES.map((g) => {
        const isOpen = open === g.id;
        return (
          <Card key={g.id} id={g.id} className="p-0">
            <button
              onClick={() => setOpen(isOpen ? "" : g.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span>
                <span className="block font-semibold">{g.title}</span>
                <span className="block text-sm text-ink-700">{g.summary}</span>
              </span>
              <ChevronDown size={18} className={cn("shrink-0 transition", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="space-y-3 border-t border-ink-200 px-5 py-4">
                <dl className="space-y-3">
                  {g.items.map((it) => (
                    <div key={it.heading}>
                      <dt className="text-sm font-medium">{it.heading}</dt>
                      <dd className="text-sm text-ink-700">{it.body}</dd>
                    </div>
                  ))}
                </dl>
                <Link href={g.href} className="inline-flex items-center gap-1 text-sm font-medium text-accent-dark hover:underline">
                  Open {g.title} <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </Card>
        );
      })}
    </section>
  );
}

function Faq() {
  return (
    <section aria-labelledby="faq" className="space-y-3">
      <h2 id="faq" className="font-serif text-2xl">
        Common questions
      </h2>
      <Card className="divide-y divide-ink-200 p-0">
        {FAQ.map((f) => (
          <details key={f.q} className="group px-5 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
              {f.q}
              <ChevronDown size={16} className="shrink-0 transition group-open:rotate-180" />
            </summary>
            <p className="mt-2 text-sm text-ink-700">{f.a}</p>
          </details>
        ))}
      </Card>
    </section>
  );
}

export default function TutorialPage() {
  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader
        title="Tutorial"
        subtitle="Learn the whole workflow, from your first project to a finished, promoted book. Follow the walkthrough in order, or jump to any feature guide."
      />
      <Walkthrough />
      <Guides />
      <Faq />
    </div>
  );
}
