"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Square, Volume2 } from "lucide-react";
import { Button } from "./ui/kit";
import { spokenText } from "./ListenPlayer";

interface Props {
  /** Current text of the chapter textbox */
  text: string;
  area: React.RefObject<HTMLTextAreaElement>;
  /** Selection in the textbox: the selected part is read, or with only a cursor, everything after it */
  selection: { start: number; end: number } | null;
  /** Called with a time before which the textbox's select events come from the reader, not the user */
  onProgrammaticSelect: () => void;
}

interface Segment {
  start: number;
  end: number;
}

/** Sentence-sized chunks of `text` (offsets within it), which keeps utterances short and reliable on phones. */
function segmentsOf(text: string): Segment[] {
  const spoken = spokenText(text);
  const out: Segment[] = [];
  for (const m of spoken.matchAll(/[^.!?\n]+(?:[.!?]+["')\]]*|\n|$)\s*/g)) {
    if (/[\p{L}\p{N}]/u.test(m[0])) out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  return out;
}

/**
 * Plays the chapter text aloud straight from the editor with the browser's text-to-speech, highlighting each sentence in
 * the textbox as it is spoken. Reads the selection, or from the cursor to the end when nothing is selected.
 */
export function InlineReader({ text, area, selection, onProgrammaticSelect }: Props) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [state, setState] = useState<"idle" | "playing" | "paused">("idle");
  const [rate, setRate] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const runRef = useRef(0);
  const rateRef = useRef(rate);
  const voiceRef = useRef(voiceURI);
  const voicesRef = useRef(voices);
  rateRef.current = rate;
  voiceRef.current = voiceURI;
  voicesRef.current = voices;

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
      runRef.current++;
      synth.cancel();
    };
  }, [supported]);

  const stop = useCallback(() => {
    runRef.current++;
    if (supported) window.speechSynthesis.cancel();
    setState("idle");
    setProgress(null);
  }, [supported]);

  // typing or loading new text while reading would leave the highlight in the wrong place, so reading stops
  const startedWith = useRef<string | null>(null);
  useEffect(() => {
    if (startedWith.current !== null && startedWith.current !== text) {
      startedWith.current = null;
      stop();
    }
  }, [text, stop]);

  function highlight(start: number, end: number) {
    const el = area.current;
    if (!el) return;
    onProgrammaticSelect();
    el.focus();
    el.setSelectionRange(start, end);
  }

  function play() {
    if (!supported) return;
    const synth = window.speechSynthesis;
    if (state === "paused") {
      synth.resume();
      setState("playing");
      return;
    }
    const hasRange = !!selection && selection.end > selection.start;
    const from = hasRange ? selection.start : Math.min(selection?.start ?? 0, text.length);
    const to = hasRange ? selection.end : text.length;
    const segs = segmentsOf(text.slice(from, to));
    if (!segs.length) return;

    const run = ++runRef.current;
    startedWith.current = text;
    synth.cancel();
    setState("playing");

    const go = (i: number) => {
      if (run !== runRef.current) return;
      if (i >= segs.length) {
        startedWith.current = null;
        setState("idle");
        setProgress(null);
        return;
      }
      const seg = segs[i];
      setProgress({ done: i, total: segs.length });
      const u = new SpeechSynthesisUtterance(spokenText(text.slice(from, to)).slice(seg.start, seg.end));
      u.rate = rateRef.current;
      const voice = voicesRef.current.find((v) => v.voiceURI === voiceRef.current);
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      }
      u.onstart = () => highlight(from + seg.start, from + seg.end);
      u.onend = () => go(i + 1);
      u.onerror = () => {
        // a deliberate cancel() reports an error too; only stop for real failures
        if (run === runRef.current) stop();
      };
      synth.speak(u);
    };
    go(0);
  }

  function pause() {
    window.speechSynthesis.pause();
    setState("paused");
  }

  function changeRate(r: number) {
    setRate(r);
    try {
      localStorage.setItem("bas.rate", String(r));
    } catch {
      // storage unavailable
    }
  }

  function changeVoice(uri: string) {
    setVoiceURI(uri);
    try {
      localStorage.setItem("bas.voice", uri);
    } catch {
      // storage unavailable
    }
  }

  const hasRange = !!selection && selection.end > selection.start;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2" role="group" aria-label="Read chapter aloud">
      <Volume2 size={16} className="text-ink-700" aria-hidden />
      {state === "playing" ? (
        <Button variant="secondary" onClick={pause}>
          <Pause size={14} /> Pause
        </Button>
      ) : (
        <Button variant="secondary" onClick={play} disabled={!supported || !text.trim()}>
          <Play size={14} /> {state === "paused" ? "Resume" : hasRange ? "Play selection" : (selection?.start ?? 0) > 0 ? "Play from cursor" : "Play"}
        </Button>
      )}
      <Button variant="ghost" onClick={stop} disabled={state === "idle"}>
        <Square size={14} /> Stop
      </Button>
      <label className="flex items-center gap-1 text-xs">
        Speed
        <select className="!py-1" value={rate} onChange={(e) => changeRate(Number(e.target.value))}>
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
          <select className="max-w-[10rem] !py-1" value={voiceURI} onChange={(e) => changeVoice(e.target.value)}>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </label>
      )}
      <span className="ml-auto text-xs text-ink-700" aria-live="polite">
        {!supported
          ? "This browser cannot read text aloud. Try Chrome, Edge or Safari."
          : progress
            ? `Sentence ${progress.done + 1} of ${progress.total}`
            : "Select text to hear just that part, or click where to start."}
      </span>
    </div>
  );
}
