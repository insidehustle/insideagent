"use client";

import Link from "next/link";
import { Card, ErrorNote } from "./ui/kit";
import { useProject, type ProjectSummary } from "./ProjectProvider";

/** Renders children only once a project exists and is selected. */
export function RequireProject({ children }: { children: (project: ProjectSummary) => React.ReactNode }) {
  const { current, loading, error } = useProject();
  if (loading) return <p className="text-ink-700">Loading project…</p>;
  if (error) return <ErrorNote message={error} />;
  if (!current)
    return (
      <Card>
        <p>No project yet.</p>
        <Link href="/dashboard" className="mt-2 inline-block text-accent underline">
          Create one on the overview page
        </Link>
      </Card>
    );
  return <>{children(current)}</>;
}
