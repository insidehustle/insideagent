"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Mic, MicOff, Pause, Play, Wand2, X } from "lucide-react";
import { post } from "@/lib/client";
import { cn } from "@/lib/cn";
import { useSpeech } from "@/lib/use-speech";
import { Button, ErrorNote } from "./ui/kit";

interface Props {
  text: string;
  title: string;
  projectId: string;
  /** Persist the revised chapter text. */
  onApply: (text: string) => Promise<void>;
  onClose: () => void;
  /** Paragraph to start from (0-based, same splitting as the player). */
  startParagraph?: number;
  /** Begin reading as soon as the player opens. */
  autoPlay?: boolean;
}

interface Segment {
  start: number;
  end: number;
}

interface Selection {
  p: number;
  /** Set when a single word was tapped. Offsets are within the paragraph. */
  word?: { text: string; start: number; end: number };
}

const QUICK_EDITS = ["Make it shorter", "Use simpler words", "More vivid", "More direct", "Sound more natural"];

export const splitParagraphs = (t: string) =>
  t
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** Same length as the input (markdown marks become spaces) so offsets map straight back to the displayed text. */
const spokenText = (p: string) =>
  p
    .replace(/^\s*#{1,6}\s/gm, (m) => " ".repeat(m.length))
    .replace(/^\s*[-*]\s/gm, (m) => " ".repeat(m.length))
    .replace(/[*_`>#]/g, " ");

/** Sentence-sized chunks: short utterances are reliable on phones and avoid the desktop 15 second cutoff. */
function segmentsOf(paragraph: string): Segment[] {
  const spoken = spokenText(paragraph);
  const out: Segment[] = [];
  for (const m of spoken.matchAll(/[^.!?\n]+(?:[.!?]+["')\]]*|\n|$)\s*/g)) {
    if (/[\p{L}\p{N}]/u.test(m[0])) out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

/** Words of a paragraph with the offsets of their letters, ignoring surrounding punctuation. */
function tokenize(paragraph: string) {
  const tokens: { text: string; start: number; end: number; core?: { text: string; start: number; end: number } }[] = [];
  let last = 0;
  for (const m of paragraph.matchAll(/\S+/g)) {
    const start = m.index ?? 0;
    if (start > last) tokens.push({ text: paragraph.slice(last, start), start: last, end: start });
    const core = m[0].match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/u);
    tokens.push({
      text: m[0],
      start,
      end: start + m[0].length,
      core: core ? { text: core[0], start: start + (core.index ?? 0), end: start + (core.index ?? 0) + core[0].length } : undefined,
    });
    last = start + m[0].length;
  }
  if (last < paragraph.length) tokens.push({ text: paragraph.slice(last), start: last, end: paragraph.length });
  return tokens;
}

function sentenceAround(paragraph: string, offset: number): string {
  const spoken = spokenText(paragraph);
  const seg = segmentsOf(paragraph).find((s) => offset >= s.start && offset < s.end);
  return (seg ? spoken.slice(seg.start, seg.end) : paragraph).trim();
}

/**
 * Reads the chapter aloud (browser text-to-speech, works on phones and computers), highlights the
 * word being spoken, and lets you tap any word or paragraph to revise it by typing or by voice.
 */
export function ListenPlayer({ text, title, projectId, onApply, onClose, startParagraph = 0, autoPlay = false }: Props) {
  const [paras, setParas] = useState<string[]>(() => splitParagraphs(text));
  const parasRef = useRef(paras);
  parasRef.current = paras;

  const [pos, setPos] = useState({ p: Math.max(0, startParagraph), s: 0 });
  const [playing, setPlaying] = useState(false);
  const [spoken, setSpoken] = useState<{ p: number; start: number } | null>(null);
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const rateRef = useRef(rate);
  const voiceRef = useRef(voiceURI);
  rateRef.current = rate;
  voiceRef.current = voiceURI;
  const voicesRef = useRef(voices);
  voicesRef.current = voices;
  const runRef = useRef(0);
  const posRef = useRef(pos);
  posRef.current = pos;
  const paraEls = useRef<(HTMLParagraphElement | null)[]>([]);

  const [sel, setSel] = useState<Selection | null>(null);
  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState<{ p: number; text: string } | null>(null);
  const [alternatives, setAlternatives] = useState<string[] | null>(null);
  const [replacement, setReplacement] = useState("");
  const [busy, setBusy] = useState<null | "rewrite" | "alts" | "save">(null);
  const [error, setError] = useState<string | null>(null);

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const speech = useSpeech(
    useCallback((t: string) => setInstruction((prev) => (prev ? `${prev} ${t}` : t)), []),
  );

  // voices load asynchronously on most browsers
  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const load = () => {
      const list = synth.getVoices();
      setVoices(list);
      setVoiceURI((cur) => {
        if (cur && list.some((v) => v.voiceURI === cur)) return cur;
        let saved = "";
        try {
          saved = localStorage.getItem("bas.voice") ?? "";
        } catch {
          // storage unavailable
        }
        const pick = list.find((v) => v.voiceURI === saved) ?? list.find((v) => v.lang.startsWith("en") && v.default) ?? list.find((v) => v.lang.startsWith("en")) ?? list[0];
        return pick?.voiceURI ?? "";
      });
    };
    load();
    synth.addEventListener("voiceschanged", load);
    try {
      const r = Number(localStorage.getItem("bas.rate"));
      if (r >= 0.6 && r <= 2) setRate(r);
    } catch {
      // storage unavailable
    }
    return () => {
      synth.removeEventListener("voiceschanged", load);
      // runRef is a counter, not a DOM node, so reading .current at cleanup time is intended
      // eslint-disable-next-line react-hooks/exhaustive-deps
      runRef.current++;
      synth.cancel();
    };
  }, [supported]);

  // keep the screen on while listening
  useEffect(() => {
    if (!playing) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, [playing]);

  useEffect(() => {
    paraEls.current[pos.p]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [pos.p]);

  const stopSpeaking = useCallback(() => {
    runRef.current++;
    if (supported) window.speechSynthesis.cancel();
    setPlaying(false);
    setSpoken(null);
  }, [supported]);

  const speakFrom = useCallback(
    (startP: number, startS: number) => {
      if (!supported) return;
      const synth = window.speechSynthesis;
      const run = ++runRef.current;
      synth.cancel();
      setPlaying(true);

      const go = (p: number, s: number) => {
        if (run !== runRef.current) return;
        const list = parasRef.current;
        if (p >= list.length) {
          setPlaying(false);
          setSpoken(null);
          setPos({ p: 0, s: 0 });
          return;
        }
        const segs = segmentsOf(list[p]);
        if (s >= segs.length) return go(p + 1, 0);
        const seg = segs[s];
        setPos({ p, s });
        const u = new SpeechSynthesisUtterance(spokenText(list[p]).slice(seg.start, seg.end));
        u.rate = rateRef.current;
        const voice = voicesRef.current.find((v) => v.voiceURI === voiceRef.current);
        if (voice) {
          u.voice = voice;
          u.lang = voice.lang;
        }
        u.onboundary = (e) => setSpoken({ p, start: seg.start + e.charIndex });
        u.onend = () => go(p, s + 1);
        u.onerror = () => {
          // a deliberate cancel() reports an error too; only stop for real failures
          if (run === runRef.current) {
            setPlaying(false);
          }
        };
        synth.speak(u);
      };
      go(startP, startS);
    },
    [supported],
  );

  useEffect(() => {
    if (autoPlay && supported) speakFrom(Math.max(0, startParagraph), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // changing speed or voice mid-sentence takes effect from the start of that sentence
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    try {
      localStorage.setItem("bas.rate", String(rate));
      localStorage.setItem("bas.voice", voiceURI);
    } catch {
      // storage unavailable
    }
    if (playing) speakFrom(posRef.current.p, posRef.current.s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate, voiceURI]);

  function jump(delta: number) {
    const p = Math.min(Math.max(posRef.current.p + delta, 0), parasRef.current.length - 1);
    if (playing) speakFrom(p, 0);
    else setPos({ p, s: 0 });
  }

  function selectParagraph(p: number, word?: Selection["word"]) {
    stopSpeaking();
    setPos({ p, s: 0 });
    setSel({ p, word });
    setPreview(null);
    setAlternatives(null);
    setReplacement("");
    setInstruction("");
    setError(null);
  }

  function closePanel() {
    speech.stop();
    setSel(null);
    setPreview(null);
    setAlternatives(null);
  }

  async function commit(next: string[]) {
    setParas(next);
    parasRef.current = next;
    setBusy("save");
    try {
      await onApply(next.join("\n\n"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the revision");
    } finally {
      setBusy(null);
    }
  }

  async function rewrite(how: string) {
    if (!sel || !how.trim()) return;
    speech.stop();
    setBusy("rewrite");
    setError(null);
    const p = sel.p;
    try {
      const { text: out } = await post<{ text: string }>("/api/manuscript-generate", {
        action: "edit",
        projectId,
        selection: paras[p],
        instruction: how,
        context: [paras[p - 1], paras[p + 1]].filter(Boolean).join("\n\n").slice(0, 1200),
      });
      setPreview({ p, text: out });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rewrite failed");
    } finally {
      setBusy(null);
    }
  }

  async function acceptPreview() {
    if (!preview) return;
    const next = paras.map((x, i) => (i === preview.p ? preview.text : x));
    setPreview(null);
    setSel(null);
    await commit(next);
    speakFrom(preview.p, 0);
  }

  async function suggestAlternatives() {
    if (!sel?.word) return;
    setBusy("alts");
    setError(null);
    try {
      const { alternatives: alts } = await post<{ alternatives: string[] }>("/api/manuscript-generate", {
        action: "alternatives",
        projectId,
        word: sel.word.text,
        sentence: sentenceAround(paras[sel.p], sel.word.start),
      });
      setAlternatives(alts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get suggestions");
    } finally {
      setBusy(null);
    }
  }

  async function replaceWord(w: string) {
    if (!sel?.word || !w.trim()) return;
    const para = paras[sel.p];
    const fixed = para.slice(0, sel.word.start) + w.trim() + para.slice(sel.word.end);
    const next = paras.map((x, i) => (i === sel.p ? fixed : x));
    const p = sel.p;
    setSel(null);
    setAlternatives(null);
    setReplacement("");
    await commit(next);
    speakFrom(p, 0);
  }

  const selParagraph = sel ? paras[sel.p] : "";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-50" role="dialog" aria-label="Listen and revise">
      <header className="flex items-center gap-3 border-b border-ink-200 bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          <p className="text-xs text-ink-700">Tap a word or paragraph to revise it</p>
        </div>
        {busy === "save" && <span className="text-xs text-ink-700">Saving…</span>}
        <button onClick={() => { stopSpeaking(); onClose(); }} aria-label="Close" className="rounded-full p-2 hover:bg-ink-100">
          <X size={18} />
        </button>
      </header>

      {!supported && (
        <p className="bg-red-50 px-4 py-2 text-sm text-red-800">
          This browser cannot read text aloud. Try Chrome, Edge or Safari. You can still tap words and paragraphs to revise them.
        </p>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl space-y-4 pb-32 font-serif text-lg leading-relaxed">
          {paras.map((para, p) => {
            const current = pos.p === p;
            const isHeading = /^#{1,6}\s/.test(para);
            return (
              <p
                key={p}
                ref={(el) => {
                  paraEls.current[p] = el;
                }}
                onClick={() => selectParagraph(p)}
                className={cn(
                  "cursor-pointer whitespace-pre-wrap rounded-lg px-3 py-2 transition-colors",
                  isHeading && "font-semibold",
                  current && playing ? "bg-accent-soft" : "hover:bg-ink-100",
                  sel?.p === p && "ring-2 ring-accent",
                )}
              >
                {tokenize(para).map((t, i) => {
                  if (!t.core) return <span key={i}>{t.text}</span>;
                  const active = spoken?.p === p && spoken.start >= t.start && spoken.start < t.end;
                  const picked = sel?.p === p && sel.word?.start === t.core.start;
                  const before = para.slice(t.start, t.core.start);
                  const after = para.slice(t.core.end, t.end);
                  return (
                    <span key={i}>
                      {before}
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          selectParagraph(p, t.core);
                        }}
                        className={cn("rounded px-0.5", active && "bg-amber-300", picked && "bg-accent text-white")}
                      >
                        {t.core.text}
                      </span>
                      {after}
                    </span>
                  );
                })}
              </p>
            );
          })}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-ink-200 bg-white shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
        {sel ? (
          <div className="mx-auto max-h-[65vh] max-w-2xl space-y-3 overflow-y-auto p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {sel.word ? `Word: “${sel.word.text}”` : `Paragraph ${sel.p + 1}`}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" onClick={() => { const p = sel.p; closePanel(); speakFrom(p, 0); }}>
                  <Play size={14} /> Read from here
                </Button>
                <button onClick={closePanel} aria-label="Close revise panel" className="rounded-full p-2 hover:bg-ink-100">
                  <X size={16} />
                </button>
              </div>
            </div>

            {sel.word && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    className="min-w-0 flex-1"
                    placeholder="Replace with…"
                    value={replacement}
                    onChange={(e) => setReplacement(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && replaceWord(replacement)}
                  />
                  <Button onClick={() => replaceWord(replacement)} disabled={!replacement.trim()}>
                    Replace
                  </Button>
                </div>
                <Button variant="secondary" onClick={suggestAlternatives} loading={busy === "alts"}>
                  Suggest alternatives
                </Button>
                {alternatives && (
                  <div className="flex flex-wrap gap-2">
                    {alternatives.length === 0 && <p className="text-xs text-ink-700">No suggestions came back. Try again.</p>}
                    {alternatives.map((a) => (
                      <button
                        key={a}
                        onClick={() => replaceWord(a)}
                        className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-sm hover:border-accent hover:bg-accent-soft"
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {preview ? (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-700">Proposed rewrite</p>
                <p className="whitespace-pre-wrap rounded-lg bg-accent-soft p-3 font-serif">{preview.text}</p>
                <div className="flex gap-2">
                  <Button onClick={acceptPreview} loading={busy === "save"}>
                    <Check size={14} /> Use this and read it
                  </Button>
                  <Button variant="secondary" onClick={() => setPreview(null)}>
                    Keep original
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {sel.word && <p className="text-xs text-ink-700">Or revise the whole paragraph:</p>}
                <p className="line-clamp-3 text-xs text-ink-700">{selParagraph}</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_EDITS.map((q) => (
                    <button
                      key={q}
                      disabled={busy !== null}
                      onClick={() => rewrite(q)}
                      className="rounded-full border border-ink-200 px-3 py-1 text-xs hover:border-accent hover:bg-accent-soft disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    className="min-w-0 flex-1 text-sm"
                    placeholder="Say or type what to change…"
                    value={instruction + (speech.interim ? ` ${speech.interim}` : "")}
                    onChange={(e) => setInstruction(e.target.value)}
                  />
                  {speech.supported && (
                    <button
                      type="button"
                      onClick={speech.listening ? speech.stop : speech.start}
                      aria-label={speech.listening ? "Stop dictation" : "Dictate instruction"}
                      className={cn("self-start rounded-full p-3", speech.listening ? "bg-red-600 text-white" : "bg-ink-100 hover:bg-ink-200")}
                    >
                      {speech.listening ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                  )}
                </div>
                <Button onClick={() => rewrite(instruction)} loading={busy === "rewrite"} disabled={!instruction.trim()}>
                  <Wand2 size={14} /> Rewrite paragraph
                </Button>
              </div>
            )}
            <ErrorNote message={error ?? speech.error} />
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-3 p-3">
            <button onClick={() => jump(-1)} aria-label="Previous paragraph" className="rounded-full p-3 hover:bg-ink-100">
              <ChevronLeft />
            </button>
            <button
              onClick={() => (playing ? stopSpeaking() : speakFrom(pos.p, pos.s))}
              disabled={!supported}
              aria-label={playing ? "Pause" : "Play"}
              className="rounded-full bg-accent p-4 text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {playing ? <Pause /> : <Play />}
            </button>
            <button onClick={() => jump(1)} aria-label="Next paragraph" className="rounded-full p-3 hover:bg-ink-100">
              <ChevronRight />
            </button>
            <label className="flex items-center gap-1 text-xs">
              Speed
              <select className="!py-1" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
                {[0.75, 0.9, 1, 1.15, 1.3, 1.5, 1.75].map((r) => (
                  <option key={r} value={r}>
                    {r}x
                  </option>
                ))}
              </select>
            </label>
            {voices.length > 0 && (
              <label className="flex min-w-0 items-center gap-1 text-xs">
                Voice
                <select className="max-w-[10rem] !py-1" value={voiceURI} onChange={(e) => setVoiceURI(e.target.value)}>
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="w-full text-center text-[11px] text-ink-700/70">
              Paragraph {pos.p + 1} of {paras.length}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
