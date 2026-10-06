"use client";

import Link from "next/link";
import { Check, Circle, Plus } from "lucide-react";
import { useProject } from "@/components/ProjectProvider";
import { Card, ErrorNote, PageHeader } from "@/components/ui/kit";

export default function DashboardHome() {
  const { current, loading, error } = useProject();

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
      {!current && !loading && (
        <Card>
          <h2 className="font-semibold">Create your first project</h2>
          <Link href="/dashboard/projects/new" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
            <Plus size={14} /> New project
          </Link>
        </Card>
      )}
    </div>
  );
}
