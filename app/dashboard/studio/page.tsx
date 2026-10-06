"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, ListTree, Trash2 } from "lucide-react";
import { api, post } from "@/lib/client";
import { cn } from "@/lib/cn";
import { BookAutopilot } from "@/components/BookAutopilot";
import { BookBrief } from "@/components/BookBrief";
import { useProject } from "@/components/ProjectProvider";
import { ChapterEditor, type ChapterRow } from "@/components/ChapterEditor";
import { CharactersPanel } from "@/components/CharactersPanel";
import { ReferenceDocuments } from "@/components/ReferenceDocuments";
import { RequireProject } from "@/components/RequireProject";
import { WritingInstructions } from "@/components/WritingInstructions";
import { CollapsibleCard, setAllPanels } from "@/components/ui/Collapsible";
import { Button, Card, ErrorNote, Label, PageHeader } from "@/components/ui/kit";

function Studio({ projectId, instructions, bookBrief }: { projectId: string; instructions: string; bookBrief: string }) {
  const { refresh } = useProject();
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // keep the raw text so typing "1" on the way to "12" is not rewritten while the field is being edited
  const [countText, setCountText] = useState("10");
  const count = Math.min(30, Math.max(3, Math.round(Number(countText)) || 3));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { chapters } = await api<{ chapters: ChapterRow[] }>(`/api/chapters?projectId=${projectId}`);
      setChapters(chapters);
      setActiveId((id) => (id && chapters.some((c) => c.id === id) ? id : chapters[0]?.id ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load chapters");
    }
  }, [projectId]);

  useEffect(() => {
    setChapters([]);
    setActiveId(null);
    void load();
  }, [load]);

  async function outline() {
    setBusy(true);
    setError(null);
    try {
      const { chapters } = await post<{ chapters: ChapterRow[] }>("/api/manuscript-generate", {
        action: "outline",
        projectId,
        chapterCount: count,
      });
      setChapters(chapters);
      setActiveId(chapters[0]?.id ?? null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Outline failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAll() {
    const drafted = chapters.filter((c) => c.status !== "outline").length;
    const msg = `Delete all ${chapters.length} chapters${drafted ? `, including ${drafted} drafted` : ""}? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/chapters?projectId=${projectId}`, { method: "DELETE" });
      setChapters([]);
      setActiveId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const active = chapters.find((c) => c.id === activeId);

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      {/* the side column scrolls on its own, so the editor never has to be scrolled to */}
      <div className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" onClick={() => setAllPanels("closed")} className="!px-2 !py-1 text-xs">
            <ChevronsDownUp size={14} /> Collapse all
          </Button>
          <Button variant="ghost" onClick={() => setAllPanels("open")} className="!px-2 !py-1 text-xs">
            <ChevronsUpDown size={14} /> Expand all
          </Button>
        </div>

        <CollapsibleCard id="outline" title="Outline" defaultOpen>
          <label className="block">
            <Label>Chapters</Label>
            <input type="number" min={3} max={30} inputMode="numeric" className="w-full" value={countText}
              onChange={(e) => setCountText(e.target.value)}
              onBlur={() => setCountText(String(count))}
            />
          </label>
          <Button onClick={outline} loading={busy} className="w-full">
            <ListTree size={14} /> {chapters.length ? "Regenerate outline" : "Generate outline"}
          </Button>
          {chapters.length > 0 && (
            <Button variant="ghost" onClick={deleteAll} disabled={busy} className="w-full !text-red-600">
              <Trash2 size={14} /> Delete all chapters
            </Button>
          )}
          <p className="text-xs text-ink-700">Also writes a book brief and a brief for every chapter from your documents.</p>
          <ErrorNote message={error} />
        </CollapsibleCard>

        {chapters.length > 0 && (
          <CollapsibleCard id="chapter-list" title={`Chapters (${chapters.length})`} defaultOpen>
            <nav className="-mx-2 space-y-1">
              {chapters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    "block w-full rounded-lg px-3 py-2 text-left text-sm",
                    c.id === activeId ? "bg-accent-soft font-medium text-accent-dark" : "hover:bg-ink-100",
                  )}
                >
                  <span className="text-ink-700/70">{c.order}.</span> {c.title}
                  <span className="block text-xs font-normal text-ink-700/70">{c.status}</span>
                </button>
              ))}
            </nav>
          </CollapsibleCard>
        )}

        <WritingInstructions projectId={projectId} saved={instructions} />
        <ReferenceDocuments projectId={projectId} />
        <CharactersPanel projectId={projectId} />
        <BookAutopilot
          projectId={projectId}
          count={count}
          onOutline={(cs) => {
            setChapters(cs);
            setActiveId(cs[0]?.id ?? null);
            void refresh();
          }}
          onChapter={(updated) => {
            setChapters((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
            setActiveId(updated.id);
          }}
        />
      </div>

      <div className="min-w-0 space-y-4">
        <BookBrief projectId={projectId} saved={bookBrief} />
        {active ? (
          <ChapterEditor
            key={active.id}
            chapter={active}
            onUpdated={(updated) => setChapters((cs) => cs.map((c) => (c.id === updated.id ? updated : c)))}
          />
        ) : (
          <Card>
            <p className="text-sm text-ink-700">
              Generate an outline to begin. It also writes a book brief and a brief for every chapter, drawing on your uploaded documents, characters and instructions.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function StudioPage() {
  return (
    <div>
      <PageHeader title="Content Studio" subtitle="Outline the book, draft each chapter, then refine by typing, dictating or reading it aloud." />
      <RequireProject>{(p) => <Studio key={p.id} projectId={p.id} instructions={p.writingInstructions} bookBrief={p.bookBrief} />}</RequireProject>
    </div>
  );
}
