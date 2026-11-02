"use client";

import { useEffect, useState } from "react";
import { Check, MessageCircleQuestion, SkipForward } from "lucide-react";
import { post } from "@/lib/client";
import { useProject } from "./ProjectProvider";
import { Button, ErrorNote } from "./ui/kit";
import { CollapsibleCard } from "./ui/Collapsible";

interface QA {
  q: string;
  a: string;
}

const key = (projectId: string) => `bas:interview:${projectId}`;

/**
 * The AI interviews the author, drawing on the reference documents and the writing instructions.
 * The answers are distilled into the writing instructions, so every outline, chapter and edit uses them.
 */
export function AuthorInterview({ projectId }: { projectId: string }) {
  const { refresh } = useProject();
  const [history, setHistory] = useState<QA[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // resume an unfinished interview
  useEffect(() => {
    setAdded(null);
    setDone(false);
    setAnswer("");
    try {
      const saved = JSON.parse(localStorage.getItem(key(projectId)) ?? "null") as { history: QA[]; question: string | null } | null;
      setHistory(saved?.history ?? []);
      setQuestion(saved?.question ?? null);
    } catch {
      setHistory([]);
      setQuestion(null);
    }
  }, [projectId]);

  function remember(h: QA[], q: string | null) {
    try {
      if (h.length === 0 && !q) localStorage.removeItem(key(projectId));
      else localStorage.setItem(key(projectId), JSON.stringify({ history: h, question: q }));
    } catch {
      // the interview still works without saved progress
    }
  }

  async function ask(h: QA[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ question: string; done: boolean }>("/api/interview", { projectId, action: "next", history: h });
      setHistory(h);
      setAnswer("");
      if (res.done) {
        setQuestion(null);
        setDone(true);
        remember(h, null);
      } else {
        setQuestion(res.question);
        remember(h, res.question);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get the next question");
    } finally {
      setBusy(false);
    }
  }

  async function submit(skip: boolean) {
    if (!question) return;
    await ask([...history, { q: question, a: skip ? "" : answer.trim() }]);
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ added: string }>("/api/interview", { projectId, action: "finish", history });
      setAdded(res.added);
      setHistory([]);
      setQuestion(null);
      setDone(false);
      remember([], null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the interview to your instructions");
    } finally {
      setBusy(false);
    }
  }

  const answered = history.filter((h) => h.a.trim()).length;

  return (
    <CollapsibleCard id="interview" title="Author interview" defaultOpen={false}>
      <p className="text-xs text-ink-700">
        The AI interviews you using your reference documents and writing instructions. Your answers are added to the writing instructions, so the book carries your stories, opinions and voice.
      </p>

      {added && (
        <div role="status" className="rounded-lg bg-accent-soft p-3 text-xs text-accent-dark">
          <p className="mb-1 flex items-center gap-1 font-medium"><Check size={14} /> Added to your writing instructions</p>
          <pre className="whitespace-pre-wrap font-sans">{added}</pre>
        </div>
      )}

      {question ? (
        <div className="space-y-2">
          <p className="text-xs text-ink-700">Question {history.length + 1}</p>
          <p className="text-sm font-medium" aria-live="polite">{question}</p>
          <textarea
            rows={4}
            className="w-full text-sm"
            aria-label="Your answer"
            maxLength={4000}
            placeholder="Answer in your own words. Specific names, numbers and stories help most."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={() => void submit(false)} loading={busy} disabled={!answer.trim()} className="flex-1">
              Next question
            </Button>
            <Button variant="ghost" onClick={() => void submit(true)} disabled={busy}>
              <SkipForward size={14} /> Skip
            </Button>
          </div>
        </div>
      ) : (
        !added && (
          <Button onClick={() => void ask(history)} loading={busy} variant={answered || done ? "secondary" : "primary"} className="w-full">
            <MessageCircleQuestion size={14} /> {history.length ? "Continue interview" : "Start interview"}
          </Button>
        )
      )}

      {done && <p className="text-xs text-ink-700">That covers it. Add your answers to the writing instructions below.</p>}

      {answered > 0 && (
        <Button onClick={() => void finish()} loading={busy} disabled={busy} variant={done ? "primary" : "secondary"} className="w-full">
          <Check size={14} /> Add {answered} answer{answered === 1 ? "" : "s"} to writing instructions
        </Button>
      )}
      <ErrorNote message={error} />
    </CollapsibleCard>
  );
}
