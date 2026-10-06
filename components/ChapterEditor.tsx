"use client";

import { useEffect, useRef, useState } from "react";
import { Headphones, Save, Sparkles, Wand2 } from "lucide-react";
import { patch, post } from "@/lib/client";
import { SEVEN_STEPS } from "@/lib/frameworks/seven-step-narrative";
import { Button, Card, ErrorNote } from "./ui/kit";
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
}

export function ChapterEditor({ chapter, onUpdated }: Props) {
  const [content, setContent] = useState(chapter.content);
  const initialBrief = chapter.brief || (chapter.status === "outline" ? chapter.content : "");
  const [brief, setBrief] = useState(initialBrief);
  const [instruction, setInstruction] = useState(chapter.instructions);
  const [sources, setSources] = useState<string[] | null>(null);
  const [newNames, setNewNames] = useState<string[]>([]);
  const [listening, setListening] = useState(false);
  const [editInstruction, setEditInstruction] = useState("");
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [busy, setBusy] = useState<null | "save" | "draft" | "edit">(null);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  // reset local state when a different chapter (or a new draft) arrives
  useEffect(() => {
    setContent(chapter.content);
    setInstruction(chapter.instructions);
    setBrief(chapter.brief || (chapter.status === "outline" ? chapter.content : ""));
    setSelection(null);
    setError(null);
  }, [chapter.id, chapter.content, chapter.instructions, chapter.brief, chapter.status]);

  const dirty = content !== chapter.content;
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const step = SEVEN_STEPS.find((s) => String(s.order) === chapter.frameworkStep);

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const { chapter: saved } = await patch<{ chapter: ChapterRow }>("/api/chapters", { id: chapter.id, content });
      onUpdated(saved);
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
      setContent(content.slice(0, selection.start) + text + content.slice(selection.end));
      setSelection(null);
      setEditInstruction("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Edit failed");
    } finally {
      setBusy(null);
    }
  }

  const hasSelection = !!selection && selection.start !== selection.end;

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
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setListening(true)} disabled={!content.trim()}>
            <Headphones size={14} /> Listen
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

      <textarea
        ref={area}
        className="h-[32rem] w-full font-serif leading-relaxed"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onSelect={(e) => setSelection({ start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })}
        aria-label="Chapter text"
      />

      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-0 flex-1"
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

      {listening && (
        <ListenPlayer
          text={content}
          title={`${chapter.order}. ${chapter.title}`}
          projectId={chapter.projectId}
          onClose={() => setListening(false)}
          onApply={async (revised) => {
            setContent(revised);
            const { chapter: saved } = await patch<{ chapter: ChapterRow }>("/api/chapters", { id: chapter.id, content: revised });
            onUpdated(saved);
          }}
        />
      )}

    </Card>
  );
}
