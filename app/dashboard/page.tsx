"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Circle, Plus, Trash2 } from "lucide-react";
import { useProject } from "@/components/ProjectProvider";
import { Button, Card, ErrorNote, PageHeader } from "@/components/ui/kit";

export default function DashboardHome() {
  const { current, loading, error, remove } = useProject();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!current) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await remove(current.id);
      setConfirming(false);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Could not delete the project");
    } finally {
      setDeleting(false);
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
          <div className="mt-6 border-t border-ink-200 pt-4">
            <button onClick={() => setConfirming(true)} className="inline-flex items-center gap-2 text-sm text-red-700 hover:underline">
              <Trash2 size={14} /> Delete project
            </button>
          </div>
        </Card>
      )}
      {confirming && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog" aria-modal="true" aria-label="Delete project">
          <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Delete “{current.title}”?</h2>
            <p className="text-sm text-ink-700">
              This permanently deletes the project and everything in it: its blueprint, research, {current._count.chapters} chapter
              {current._count.chapters === 1 ? "" : "s"}, uploaded documents and characters. This cannot be undone.
            </p>
            <ErrorNote message={deleteError} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={deleting}>
                Cancel
              </Button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete project"}
              </button>
            </div>
          </div>
        </div>
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
