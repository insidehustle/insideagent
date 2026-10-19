"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, History, Merge, Save, Scissors, Sparkles, Wand2 } from "lucide-react";
import { patch, post } from "@/lib/client";
import { SEVEN_STEPS } from "@/lib/frameworks/seven-step-narrative";
import { Button, Card, ErrorNote } from "./ui/kit";
import { ChapterHistory } from "./ChapterHistory";
import { ListenPlayer } from "./ListenPlayer";
import { CollapsibleCard } from "./ui/Collapsible";

export interface ChapterRow {
  id: string;
  projectId: string;
  order: number;
  title: string;
  frameworkStep: string | null;
  content: string;
  status: string;
  dictationNotes: string | null;
  instructions: string;
  brief: string;
}

interface Props {
  chapter: ChapterRow;
  onUpdated: (chapter: ChapterRow) => void;
  /** Called after a split or merge with the renumbered chapter list and the chapter to show */
  onStructure?: (chapters: ChapterRow[], activeId: string) => void;
  /** Whether a chapter follows this one, which is what a merge needs */
  hasNext?: boolean;
}

export function ChapterEditor({ chapter, onUpdated, onStructure, hasNext }: Props) {
  const [content, setContent] = useState(chapter.content);
  const initialBrief = chapter.brief || (chapter.status === "outline" ? chapter.content : "");
  const [brief, setBrief] = useState(initialBrief);
  const [instruction, setInstruction] = useState(chapter.instructions);
  const [sources, setSources] = useState<string[] | null>(null);
  const [newNames, setNewNames] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [editInstruction, setEditInstruction] = useState("");
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [busy, setBusy] = useState<null | "save" | "draft" | "edit" | "structure">(null);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [splitTitle, setSplitTitle] = useState("");
  const [autoState, setAutoState] = useState<"idle" | "saving" | "failed">("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  /** The text most recently sent to the server, so its echo does not overwrite what was typed since. */
  const sentRef = useRef<string | null>(null);
  const autosaving = useRef(false);

  // show new text when it arrives from elsewhere (a draft, a restore); ignore the echo of our own saves
  useEffect(() => {
    if (chapter.content === sentRef.current) return;
    sentRef.current = null;
    setContent(chapter.content);
    setSelection(null);
  }, [chapter.content]);

  useEffect(() => {
    setInstruction(chapter.instructions);
    setBrief(chapter.brief || (chapter.status === "outline" ? chapter.content : ""));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.id, chapter.instructions, chapter.brief, chapter.status]);

  const dirty = content !== chapter.content;

  // keep the latest values for the unmount flush below
  const latest = useRef({ content, chapter, onUpdated });
  latest.current = { content, chapter, onUpdated };

  // save any unsaved text when leaving this chapter
  useEffect(
    () => () => {
      const { content, chapter, onUpdated } = latest.current;
      if (content === chapter.content) return;
      patch<{ chapter: ChapterRow }>("/api/chapters", { id: chapter.id, content, versionSource: "autosave" })
        .then((r) => onUpdated(r.chapter))
        .catch(() => {});
    },
    [],
  );

  // warn before closing the tab with unsaved text
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // autosave a few seconds after typing stops
  useEffect(() => {
    if (!dirty || busy) return;
    const t = setTimeout(async () => {
      if (autosaving.current) return;
      autosaving.current = true;
      setAutoState("saving");
      try {
        await persist(content, "autosave");
        setAutoState("idle");
      } catch {
        setAutoState("failed");
      } finally {
        autosaving.current = false;
      }
    }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, dirty, busy]);

  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const step = SEVEN_STEPS.find((s) => String(s.order) === chapter.frameworkStep);

  /** Writes chapter text; the server keeps the text it replaces as a version (always for ai-edit and listen-edit). */
  async function persist(text: string, versionSource: string) {
    sentRef.current = text;
    const { chapter: saved } = await patch<{ chapter: ChapterRow }>("/api/chapters", { id: chapter.id, content: text, versionSource });
    onUpdated(saved);
    setSavedAt(new Date());
    return saved;
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      await persist(content, "manual");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveBrief() {
    setBusy("save");
    setError(null);
    try {
      const { chapter: saved } = await patch<{ chapter: ChapterRow }>("/api/chapters", { id: chapter.id, brief });
      onUpdated(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveInstruction() {
    setBusy("save");
    setError(null);
    try {
      const { chapter: saved } = await patch<{ chapter: ChapterRow }>("/api/chapters", { id: chapter.id, instructions: instruction });
      onUpdated(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function draft() {
    if (chapter.status !== "outline" && !confirm("Redrafting replaces the current text. Continue?")) return;
    if (dirty) await save();
    setBusy("draft");
    setError(null);
    try {
      const { chapter: updated, sources, newNames } = await post<{ chapter: ChapterRow; sources: string[]; newNames: string[] }>("/api/manuscript-generate", {
        action: "chapter",
        chapterId: chapter.id,
        instruction,
      });
      setSources(sources);
      setNewNames(newNames ?? []);
      onUpdated(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Drafting failed");
    } finally {
      setBusy(null);
    }
  }

  async function aiEdit() {
    if (!selection || selection.start === selection.end) return;
    setBusy("edit");
    setError(null);
    try {
      const picked = content.slice(selection.start, selection.end);
      const { text } = await post<{ text: string }>("/api/manuscript-generate", {
        action: "edit",
        projectId: chapter.projectId,
        selection: picked,
        instruction: editInstruction,
        context: content.slice(Math.max(0, selection.start - 600), selection.end + 600),
      });
      const next = content.slice(0, selection.start) + text + content.slice(selection.end);
      // keep the text as it was before the rewrite, so the edit can be undone from History
      if (dirty) await persist(content, "manual");
      await persist(next, "ai-edit");
      setContent(next);
      setSelection(null);
      setEditInstruction("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Edit failed");
    } finally {
      setBusy(null);
    }
  }

  const hasSelection = !!selection && selection.start !== selection.end;
  const caret = selection?.start ?? null;
  const canSplit = caret !== null && caret > 0 && caret < content.length && content.slice(0, caret).trim() !== "" && content.slice(caret).trim() !== "";

  async function structure(action: "split" | "merge") {
    if (!onStructure) return;
    if (
      action === "merge" &&
      !confirm("Merge this chapter with the next one? Their text and briefs are joined here and the next chapter is removed. A snapshot is saved first, so you can restore it.")
    )
      return;
    setBusy("structure");
    setError(null);
    try {
      if (dirty) await persist(content, "manual");
      const res = await post<{ chapters: ChapterRow[]; activeId: string }>("/api/chapters/structure", {
        projectId: chapter.projectId,
        action,
        chapterId: chapter.id,
        ...(action === "split" ? { at: caret, title: splitTitle } : {}),
      });
      setSplitTitle("");
      onStructure(res.chapters, res.activeId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the chapter");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl">
            {chapter.order}. {chapter.title}
          </h2>
          <p className="text-xs text-ink-700">
            {chapter.status === "outline" ? "Outline brief only" : chapter.status} · {words} words
            {step && ` · opens on: ${step.name}`}
            {" · "}
            {dirty ? (autoState === "failed" ? "Autosave failed, press Save" : "Unsaved changes") : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Saved"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setListening(true)} disabled={!content.trim()}>
            <Headphones size={14} /> Listen
          </Button>
          <Button variant="secondary" onClick={() => setHistoryOpen(true)}>
            <History size={14} /> History
          </Button>
          <Button variant="secondary" onClick={() => save()} loading={busy === "save"} disabled={!dirty}>
            <Save size={14} /> Save
          </Button>
        </div>
      </div>

      <CollapsibleCard id="chapter-brief" bare title="Chapter brief">
        <p className="text-xs text-ink-700">Written automatically from your documents. Edit it to steer the draft.</p>
        <textarea
          id={`brief-${chapter.id}`}
          aria-label="Chapter brief"
          rows={Math.min(14, Math.max(5, Math.ceil(brief.length / 60)))}
          className="w-full text-sm"
          placeholder="No brief yet. Generate the outline to have one written for every chapter."
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
        {brief !== initialBrief && (
          <Button variant="secondary" onClick={saveBrief} loading={busy === "save"}>
            <Save size={14} /> Save brief
          </Button>
        )}
      </CollapsibleCard>

      <div className="space-y-2">
        <CollapsibleCard id="chapter-instruction" bare title="Instructions for this chapter">
          <textarea
            rows={3}
            className="w-full text-sm"
            aria-label="Instructions for this chapter"
            placeholder="Angle, story to include, tone. Saved and followed every time this chapter is drafted."
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
        </CollapsibleCard>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={draft} loading={busy === "draft"}>
            <Sparkles size={14} /> {chapter.status === "outline" ? "Draft chapter" : "Redraft"}
          </Button>
          <Button variant="secondary" onClick={saveInstruction} loading={busy === "save"} disabled={instruction === chapter.instructions}>
            <Save size={14} /> Save instruction
          </Button>
          {sources && (
            <span className="text-xs text-ink-700">
              {sources.length ? `Drew on: ${sources.join(", ")}` : "No reference documents were used."}
            </span>
          )}
        </div>
      </div>

      {onStructure && (
        <CollapsibleCard id="chapter-structure" bare title="Split or merge this chapter">
          <p className="text-xs text-ink-700">
            To split, click in the text where the new chapter should begin, name it, and press Split. Use the arrows beside the chapter in the list to move it.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              className="min-w-0 flex-1"
              aria-label="Title for the new chapter"
              placeholder="Title for the new chapter (optional)"
              value={splitTitle}
              onChange={(e) => setSplitTitle(e.target.value)}
            />
            <Button variant="secondary" onClick={() => structure("split")} loading={busy === "structure"} disabled={!canSplit}>
              <Scissors size={14} /> Split at cursor
            </Button>
            <Button variant="secondary" onClick={() => structure("merge")} loading={busy === "structure"} disabled={!hasNext}>
              <Merge size={14} /> Merge with next
            </Button>
          </div>
          {!canSplit && <p className="text-xs text-ink-700">Click inside the chapter text to choose where to split.</p>}
        </CollapsibleCard>
      )}

      <textarea
        ref={area}
        className="h-[60vh] min-h-[18rem] w-full font-serif leading-relaxed md:h-[32rem]"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onSelect={(e) => setSelection({ start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })}
        aria-label="Chapter text"
      />

      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-0 flex-1"
          aria-label="How the selected text should change"
          placeholder={hasSelection ? "How should the selected text change?" : "Select text above to edit it with AI"}
          value={editInstruction}
          disabled={!hasSelection}
          onChange={(e) => setEditInstruction(e.target.value)}
        />
        <Button variant="secondary" onClick={aiEdit} loading={busy === "edit"} disabled={!hasSelection || !editInstruction.trim()}>
          <Wand2 size={14} /> Rewrite selection
        </Button>
      </div>
      <ErrorNote message={error} />
      {newNames.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Names in this draft that are not in your characters or documents: {newNames.join(", ")}. Add them to Characters if intended, or
          revise the text.
        </p>
      )}

      {historyOpen && (
        <ChapterHistory
          chapterId={chapter.id}
          chapterTitle={`${chapter.order}. ${chapter.title}`}
          currentText={content}
          onClose={() => setHistoryOpen(false)}
          onRestored={(restored) => {
            sentRef.current = null;
            onUpdated(restored);
            setContent(restored.content);
          }}
        />
      )}

      {listening && (
        <ListenPlayer
          text={content}
          title={`${chapter.order}. ${chapter.title}`}
          projectId={chapter.projectId}
          onClose={() => setListening(false)}
          onApply={async (revised) => {
            if (dirty) await persist(content, "manual");
            await persist(revised, "listen-edit");
            setContent(revised);
          }}
        />
      )}

    </Card>
  );
}
