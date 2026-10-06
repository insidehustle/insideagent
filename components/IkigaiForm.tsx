"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff, Save } from "lucide-react";
import { api, post, put } from "@/lib/client";
import { useSpeech } from "@/lib/use-speech";
import { Button, Card, ErrorNote, Label } from "./ui/kit";

const PILLARS = [
  { key: "loves", label: "What you love", hint: "Topics you could talk about for hours" },
  { key: "goodAt", label: "What you are good at", hint: "Skills, results, hard-won experience" },
  { key: "marketNeeds", label: "What the world needs", hint: "Problems your readers keep running into" },
  { key: "monetization", label: "What people will pay for", hint: "Outcomes worth money to them" },
] as const;

type Key = (typeof PILLARS)[number]["key"];
type Answers = Record<Key, string>;
const EMPTY: Answers = { loves: "", goodAt: "", marketNeeds: "", monetization: "" };

interface Blueprint extends Answers {
  markdownContent: string;
  voiceRules: string[];
}

function DictationField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { listening, interim, supported, error, start, stop } = useSpeech((t) =>
    onChange(`${value}${value && !value.endsWith(" ") ? " " : ""}${t}`),
  );
  return (
    <label className="block">
      <Label hint={hint}>{label}</Label>
      <div className="relative">
        <textarea
          required
          rows={4}
          className="w-full pr-12"
          value={value + (interim ? ` ${interim}` : "")}
          onChange={(e) => onChange(e.target.value)}
        />
        {supported && (
          <button
            type="button"
            onClick={listening ? stop : start}
            aria-label={listening ? "Stop dictation" : "Dictate answer"}
            className={`absolute right-2 top-2 rounded-full p-2 ${listening ? "bg-red-600 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200"}`}
          >
            {listening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </label>
  );
}

export function IkigaiForm({ projectId }: { projectId: string }) {
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [markdown, setMarkdown] = useState("");
  const [voiceRules, setVoiceRules] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAnswers(EMPTY);
    setMarkdown("");
    setVoiceRules([]);
    api<{ blueprint: Blueprint | null }>(`/api/ikigai?projectId=${projectId}`)
      .then(({ blueprint }) => {
        if (cancelled || !blueprint) return;
        setAnswers({
          loves: blueprint.loves,
          goodAt: blueprint.goodAt,
          marketNeeds: blueprint.marketNeeds,
          monetization: blueprint.monetization,
        });
        setMarkdown(blueprint.markdownContent);
        setVoiceRules(blueprint.voiceRules);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (markdown && !confirm("Regenerating replaces your current blueprint, including manual edits. Continue?")) return;
    setBusy(true);
    setError(null);
    try {
      const { blueprint } = await post<{ blueprint: Blueprint }>("/api/ikigai", { projectId, ...answers });
      setMarkdown(blueprint.markdownContent);
      setVoiceRules(blueprint.voiceRules);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { blueprint } = await put<{ blueprint: Blueprint }>("/api/ikigai", { projectId, markdownContent: markdown });
      setVoiceRules(blueprint.voiceRules);
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <form onSubmit={generate} className="space-y-4">
          {PILLARS.map((p) => (
            <DictationField
              key={p.key}
              label={p.label}
              hint={p.hint}
              value={answers[p.key]}
              onChange={(v) => setAnswers((a) => ({ ...a, [p.key]: v }))}
            />
          ))}
          <Button type="submit" loading={busy}>
            {markdown ? "Regenerate blueprint" : "Generate blueprint"}
          </Button>
        </form>
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">author_blueprint.md</h2>
          <Button variant="secondary" onClick={save} loading={saving} disabled={!markdown}>
            <Save size={14} /> Save edits
          </Button>
        </div>
        <ErrorNote message={error} />
        {markdown ? (
          <textarea
            className="h-[28rem] w-full font-mono text-xs"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            aria-label="Author blueprint markdown"
          />
        ) : (
          <p className="text-sm text-ink-700">Your blueprint appears here. Edit it freely; every later generation reads the saved version.</p>
        )}
        {savedAt && <p className="text-xs text-ink-700">Saved {savedAt.toLocaleTimeString()}</p>}
        {voiceRules.length > 0 && (
          <div>
            <h3 className="mb-1 text-sm font-medium">Active voice rules ({voiceRules.length})</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-700">
              {voiceRules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
