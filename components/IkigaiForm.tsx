"use client";

import { useCallback, useEffect, useState } from "react";
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

const EXTRAS = [
  { key: "stories", label: "Your stories", hint: "2 or 3 real moments that changed you or taught you something: what happened, what you learned" },
  { key: "reader", label: "Who exactly is the reader", hint: "Age, situation, what they have already tried, what they say when frustrated" },
  { key: "voiceSample", label: "How you sound", hint: "Paste or dictate a paragraph in your natural voice. Voice rules are derived from it" },
  { key: "avoid", label: "What you refuse to say, and who this is not for", hint: "Phrases, claims and advice you will not give" },
] as const;

type Key = (typeof PILLARS)[number]["key"] | (typeof EXTRAS)[number]["key"];
type Answers = Record<Key, string>;
const EMPTY: Answers = {
  loves: "",
  goodAt: "",
  marketNeeds: "",
  monetization: "",
  stories: "",
  reader: "",
  voiceSample: "",
  avoid: "",
};

interface Blueprint extends Answers {
  markdownContent: string;
  voiceRules: string[];
}

interface ProfileItem {
  id: string;
  name: string;
}

function DictationField({
  label,
  hint,
  value,
  onChange,
  required = true,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const { listening, interim, supported, error, start, stop } = useSpeech((t) =>
    onChange(`${value}${value && !value.endsWith(" ") ? " " : ""}${t}`),
  );
  return (
    <label className="block">
      <Label hint={hint}>{required ? label : `${label} (optional)`}</Label>
      <div className="relative">
        <textarea
          required={required}
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

  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [profileId, setProfileId] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileNote, setProfileNote] = useState<string | null>(null);

  const applyBlueprint = useCallback((blueprint: Blueprint | null) => {
    setAnswers(
      blueprint
        ? {
            loves: blueprint.loves,
            goodAt: blueprint.goodAt,
            marketNeeds: blueprint.marketNeeds,
            monetization: blueprint.monetization,
            stories: blueprint.stories ?? "",
            reader: blueprint.reader ?? "",
            voiceSample: blueprint.voiceSample ?? "",
            avoid: blueprint.avoid ?? "",
          }
        : EMPTY,
    );
    setMarkdown(blueprint?.markdownContent ?? "");
    setVoiceRules(blueprint?.voiceRules ?? []);
  }, []);

  const loadProfiles = useCallback(async () => {
    try {
      const { profiles } = await api<{ profiles: ProfileItem[] }>("/api/ikigai/profiles");
      setProfiles(profiles);
    } catch {
      // the profile list is a convenience; the form works without it
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    applyBlueprint(null);
    api<{ blueprint: Blueprint | null }>(`/api/ikigai?projectId=${projectId}`)
      .then(({ blueprint }) => !cancelled && applyBlueprint(blueprint))
      .catch((e) => !cancelled && setError(e.message));
    void loadProfiles();
    return () => {
      cancelled = true;
    };
  }, [projectId, applyBlueprint, loadProfiles]);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (markdown && !confirm("Regenerating replaces your current blueprint, including manual edits. Continue?")) return;
    setBusy(true);
    setError(null);
    try {
      const { blueprint } = await post<{ blueprint: Blueprint }>("/api/ikigai", { projectId, ...answers });
      applyBlueprint(blueprint);
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

  async function saveProfile() {
    const name = profileName.trim();
    if (profiles.some((p) => p.name.toLowerCase() === name.toLowerCase()) && !confirm(`A profile named "${name}" exists. Replace it?`)) return;
    setProfileBusy(true);
    setProfileNote(null);
    setError(null);
    try {
      await post("/api/ikigai/profiles", { projectId, name });
      setProfileNote(`Saved as "${name}". Blueprint edits you have not saved with "Save edits" are not included.`);
      setProfileName("");
      await loadProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setProfileBusy(false);
    }
  }

  async function useProfile() {
    if (!profileId) return;
    if (markdown && !confirm("This replaces this project's current blueprint, including manual edits. Continue?")) return;
    setProfileBusy(true);
    setProfileNote(null);
    setError(null);
    try {
      const { blueprint } = await put<{ blueprint: Blueprint }>("/api/ikigai/profiles", { projectId, profileId });
      applyBlueprint(blueprint);
      setProfileNote("Profile applied. Changes you make here will not change the saved profile.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply profile");
    } finally {
      setProfileBusy(false);
    }
  }

  async function deleteProfile() {
    const name = profiles.find((p) => p.id === profileId)?.name;
    if (!profileId || !confirm(`Delete the profile "${name}"? Projects that already use it keep their copy.`)) return;
    setProfileBusy(true);
    setError(null);
    try {
      await api(`/api/ikigai/profiles?id=${encodeURIComponent(profileId)}`, { method: "DELETE" });
      setProfileId("");
      await loadProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete profile");
    } finally {
      setProfileBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <h2 className="font-semibold">Author profiles</h2>
        <p className="text-xs text-ink-700">
          Reuse your Ikigai across books. A profile is a saved copy of this project&apos;s answers and blueprint. Applying it gives a project its own copy.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Saved profile" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">{profiles.length ? "Choose a saved profile" : "No saved profiles yet"}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={useProfile} loading={profileBusy} disabled={!profileId}>
            Use for this project
          </Button>
          <Button variant="secondary" onClick={deleteProfile} disabled={!profileId || profileBusy}>
            Delete
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Profile name"
            placeholder="Name this profile, e.g. Business author"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
          />
          <Button variant="secondary" onClick={saveProfile} loading={profileBusy} disabled={!profileName.trim() || !markdown}>
            Save this blueprint as a profile
          </Button>
        </div>
        {profileNote && <p className="text-xs text-ink-700">{profileNote}</p>}
      </Card>

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
            <hr className="border-ink-200" />
            <p className="text-xs text-ink-700">
              The more detail you add below, the closer the blueprint gets to your real voice. All of these are optional.
            </p>
            {EXTRAS.map((p) => (
              <DictationField
                key={p.key}
                required={false}
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
    </div>
  );
}
