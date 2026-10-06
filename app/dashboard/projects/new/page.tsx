"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/components/ProjectProvider";
import { Button, Card, ErrorNote, Label, PageHeader } from "@/components/ui/kit";

export default function NewProjectPage() {
  const { create, projects, loading } = useProject();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [niche, setNiche] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await create(title, niche);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="New project" subtitle="Each project is one book: its blueprint, research, chapters and campaigns." />
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
          <ErrorNote message={error} />
          <Button type="submit" loading={busy}>
            Create project
          </Button>
        </form>
      </Card>
    </div>
  );
}
