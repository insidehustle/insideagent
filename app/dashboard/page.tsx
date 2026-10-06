"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Circle } from "lucide-react";
import { useProject } from "@/components/ProjectProvider";
import { Button, Card, ErrorNote, Label, PageHeader } from "@/components/ui/kit";

export default function DashboardHome() {
  const { current, projects, loading, error, create } = useProject();
  const [title, setTitle] = useState("");
  const [niche, setNiche] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      await create(title, niche);
      setTitle("");
      setNiche("");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create project");
    } finally {
      setBusy(false);
    }
  }

  const steps = current && [
    { done: !!current.blueprint, label: "Author blueprint", href: "/dashboard/ikigai" },
    { done: current._count.outlierReports > 0, label: "Market research", href: "/dashboard/research" },
    { done: current._count.chapters > 0, label: "Outline and chapters", href: "/dashboard/studio" },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Overview" subtitle="Each project is one book: its blueprint, research, chapters and campaigns." />
      <ErrorNote message={error} />
      {current && steps && (
        <Card>
          <h2 className="font-semibold">{current.title}</h2>
          <p className="text-sm text-ink-700">Niche: {current.niche}</p>
          <ul className="mt-4 space-y-2">
            {steps.map((s) => (
              <li key={s.label}>
                <Link href={s.href} className="flex items-center gap-2 text-sm hover:text-accent">
                  {s.done ? <Check size={16} className="text-green-700" /> : <Circle size={16} className="text-ink-200" />}
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <h2 className="mb-4 font-semibold">{projects.length || loading ? "New project" : "Create your first project"}</h2>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <Label>Working title</Label>
            <input required className="w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block">
            <Label hint="e.g. productivity for ADHD adults">Niche</Label>
            <input required className="w-full" value={niche} onChange={(e) => setNiche(e.target.value)} />
          </label>
          <ErrorNote message={formError} />
          <Button type="submit" loading={busy}>
            Create project
          </Button>
        </form>
      </Card>
    </div>
  );
}
