"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Check, Headphones, Play } from "lucide-react";
import { api, patch } from "@/lib/client";
import { RequireProject } from "@/components/RequireProject";
import type { ChapterRow } from "@/components/ChapterEditor";
import { GlobalReplace } from "@/components/GlobalReplace";
import { ListenPlayer, splitParagraphs } from "@/components/ListenPlayer";
import { Button, Card, ErrorNote, PageHeader } from "@/components/ui/kit";

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function Manuscript({ projectId, title }: { projectId: string; title: string }) {
  const [chapters, setChapters] = useState<ChapterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [listening, setListening] = useState<{ chapterId: string; paragraph: number } | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => {
    setChapters(null);
    api<{ chapters: ChapterRow[] }>(`/api/chapters?projectId=${projectId}`)
      .then(({ chapters }) => setChapters([...chapters].sort((a, b) => a.order - b.order)))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load chapters"));
  }, [projectId]);

  // outline-only chapters hold the brief in `content`, so they are not part of the manuscript yet
  const written = useMemo(() => (chapters ?? []).filter((c) => c.status !== "outline" && c.content.trim()), [chapters]);
  const pending = (chapters?.length ?? 0) - written.length;
  const totalWords = useMemo(() => written.reduce((n, c) => n + wordCount(c.content), 0), [written]);

  async function copyAll() {
    const text = written.map((c) => `Chapter ${c.order}: ${c.title}\n\n${c.content.trim()}`).join("\n\n\n");
    try {
      await navigator.clipboard.writeText(`${title}\n\n\n${text}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to the clipboard");
    }
  }

  // the chapter nearest the top of the screen, so the selector follows the reader while scrolling
  useEffect(() => {
    if (written.length === 0) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        const top = [...visible.entries()].sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0];
        if (top) setCurrentId(top[0].replace("chapter-", ""));
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    for (const c of written) {
      const el = document.getElementById(`chapter-${c.id}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [written]);

  function goTo(id: string) {
    setCurrentId(id);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`chapter-${id}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  const currentIndex = Math.max(0, written.findIndex((c) => c.id === currentId));
  const listenChapter = chapters?.find((c) => c.id === listening?.chapterId);
  // the chapter that follows the one being heard, so listening can carry on without a click
  const nextWritten = written[written.findIndex((c) => c.id === listening?.chapterId) + 1];

  if (!chapters) return error ? <ErrorNote message={error} /> : <p className="text-ink-700">Loading manuscript…</p>;

  if (written.length === 0)
    return (
      <Card>
        <p className="text-sm text-ink-700">No chapters have been written yet. Draft chapters in the Content Studio and they will appear here.</p>
      </Card>
    );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-700">
          {written.length} chapter{written.length === 1 ? "" : "s"} · {totalWords.toLocaleString()} words
          {pending > 0 && ` · ${pending} not yet drafted`}
        </p>
        <Button variant="secondary" onClick={copyAll}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy full manuscript"}
        </Button>
      </div>
      <ErrorNote message={error} />
      <nav
        aria-label="Jump to a chapter"
        className="sticky top-[3.25rem] z-30 -mx-4 mb-6 flex items-center gap-2 border-b border-ink-200 bg-white/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 md:top-0 md:mx-0 md:rounded-xl md:border md:px-3"
      >
        <button
          onClick={() => goTo(written[Math.max(0, currentIndex - 1)].id)}
          disabled={currentIndex <= 0}
          aria-label="Previous chapter"
          className="shrink-0 rounded-full p-2 hover:bg-ink-100 disabled:opacity-30"
        >
          <ChevronLeft size={18} />
        </button>
        <select
          aria-label="Chapter"
          className="min-w-0 flex-1 text-sm"
          value={written[currentIndex]?.id ?? ""}
          onChange={(e) => goTo(e.target.value)}
        >
          {written.map((c) => (
            <option key={c.id} value={c.id}>
              {c.order}. {c.title}
            </option>
          ))}
        </select>
        <button
          onClick={() => goTo(written[Math.min(written.length - 1, currentIndex + 1)].id)}
          disabled={currentIndex >= written.length - 1}
          aria-label="Next chapter"
          className="shrink-0 rounded-full p-2 hover:bg-ink-100 disabled:opacity-30"
        >
          <ChevronRight size={18} />
        </button>
        <Button variant="secondary" className="shrink-0" onClick={() => setListening({ chapterId: written[currentIndex].id, paragraph: 0 })}>
          <Headphones size={14} /> <span className="hidden sm:inline">Listen from here</span>
          <span className="sm:hidden">Listen</span>
        </Button>
      </nav>
      <GlobalReplace projectId={projectId} onChanged={(cs) => setChapters([...cs].sort((a, b) => a.order - b.order))} />

      <article className="rounded-xl border border-ink-200 bg-white p-6 md:p-12">
        <h1 className="mb-12 text-center font-serif text-3xl font-semibold">{title}</h1>
        {written.map((c) => (
          <section key={c.id} id={`chapter-${c.id}`} className="mb-14 scroll-mt-32 last:mb-0 md:scroll-mt-20">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-700/70">Chapter {c.order}</p>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <h2 className="font-serif text-2xl font-semibold">{c.title}</h2>
              <Button variant="secondary" onClick={() => setListening({ chapterId: c.id, paragraph: 0 })}>
                <Headphones size={14} /> Listen
              </Button>
            </div>
            <div className="space-y-4 font-serif text-base leading-relaxed">
              {splitParagraphs(c.content).map((para, i) => (
                <div key={i} className="group relative">
                  <button
                    onClick={() => setListening({ chapterId: c.id, paragraph: i })}
                    aria-label="Listen from this paragraph"
                    title="Listen from here"
                    className="absolute -left-9 top-0 hidden rounded-full bg-accent p-1.5 text-white hover:bg-accent-dark group-hover:block focus:block md:block md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                  >
                    <Play size={12} />
                  </button>
                  <p className="whitespace-pre-wrap rounded-lg group-hover:bg-ink-50">{para}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </article>

      {listening && listenChapter && (
        <ListenPlayer
          key={`${listening.chapterId}:${listening.paragraph}`}
          text={listenChapter.content}
          title={`${listenChapter.order}. ${listenChapter.title}`}
          projectId={projectId}
          startParagraph={listening.paragraph}
          autoPlay
          intro={/^chapter\b/i.test(listenChapter.title) ? `${listenChapter.title}.` : `${listenChapter.order}. ${listenChapter.title}.`}
          onChapterEnd={nextWritten ? () => setListening({ chapterId: nextWritten.id, paragraph: 0 }) : undefined}
          onClose={() => setListening(null)}
          onApply={async (revised) => {
            const { chapter: saved } = await patch<{ chapter: ChapterRow }>("/api/chapters", { id: listenChapter.id, content: revised });
            setChapters((cs) => cs && cs.map((c) => (c.id === saved.id ? saved : c)));
          }}
        />
      )}
    </div>
  );
}

export default function ManuscriptPage() {
  return (
    <div>
      <PageHeader title="Manuscript" subtitle="The whole book in one page, every written chapter in order." />
      <RequireProject>{(p) => <Manuscript key={p.id} projectId={p.id} title={p.title} />}</RequireProject>
    </div>
  );
}
