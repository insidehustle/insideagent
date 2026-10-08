"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, Upload } from "lucide-react";
import { api, post } from "@/lib/client";
import { cn } from "@/lib/cn";
import { Button, Card, ErrorNote, Label } from "./ui/kit";
import { OutlierScoreCard, type OutlierReportView } from "./OutlierScoreCard";
import { AutoResearchPanel } from "./AutoResearchPanel";

export function OutlierSearchControls({ projectId, defaultNiche }: { projectId: string; defaultNiche: string }) {
  const [mode, setMode] = useState<"web" | "file">("web");
  const [niche, setNiche] = useState(defaultNiche);
  const [file, setFile] = useState<File | null>(null);
  const [reports, setReports] = useState<OutlierReportView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => setNiche(defaultNiche), [defaultNiche]);

  const load = useCallback(async () => {
    try {
      const { reports } = await api<{ reports: OutlierReportView[] }>(`/api/outlier-analysis?projectId=${projectId}`);
      setReports(reports);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reports");
    }
  }, [projectId]);

  useEffect(() => {
    setReports([]);
    void load();
  }, [load]);

  async function run() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "web") {
        await post("/api/outlier-analysis/search-niche", { projectId, niche });
      } else {
        if (!file) throw new Error("Choose a .txt, .md, .docx or .pdf file first");
        const form = new FormData();
        form.set("file", file);
        form.set("projectId", projectId);
        form.set("niche", niche);
        const res = await api<{ truncated?: boolean }>("/api/outlier-analysis", { method: "POST", body: form });
        if (res.truncated) setNotice("The file was long, so a sample of its start, middle and end was analyzed.");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  const tabs = [
    { id: "web" as const, label: "Search the web", icon: Globe },
    { id: "file" as const, label: "Upload a file", icon: Upload },
  ];

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex gap-2" role="tablist">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                mode === id ? "bg-accent-soft font-medium text-accent-dark" : "text-ink-700 hover:bg-ink-100",
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        <label className="block">
          <Label>Niche</Label>
          <input className="w-full" value={niche} onChange={(e) => setNiche(e.target.value)} />
        </label>
        {mode === "web" ? (
          <p className="text-sm text-ink-700">
            Runs live searches for top books, review summaries, framework gaps, and 1-3 star complaints, then scores the opportunity.
          </p>
        ) : (
          <label className="block">
            <Label hint=".txt, .md, .docx or .pdf, up to 10 MB. Also saved as a reference document for writing.">Manuscript or reference material</Label>
            <input type="file" accept=".txt,.md,.docx,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        )}
        <ErrorNote message={error} />
        {notice && <p className="text-sm text-ink-700">{notice}</p>}
        <Button onClick={run} loading={busy} disabled={!niche.trim()}>
          {busy ? "Analyzing (can take a minute)" : "Run analysis"}
        </Button>
      </Card>

      <AutoResearchPanel projectId={projectId} />

      {reports.length === 0 ? (
        <p className="text-sm text-ink-700">No reports yet.</p>
      ) : (
        <>
          <OutlierScoreCard report={reports[0]} />
          {reports.length > 1 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-700">Earlier reports ({reports.length - 1})</summary>
              <div className="mt-4 space-y-8">
                {reports.slice(1).map((r) => (
                  <OutlierScoreCard key={r.id} report={r} />
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
