"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, ScanSearch, Trash2, Users } from "lucide-react";
import { api, patch, post } from "@/lib/client";
import { useProject } from "./ProjectProvider";
import { Button, ErrorNote } from "./ui/kit";
import { CollapsibleCard } from "./ui/Collapsible";

interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
  aliases: string;
  source: string;
}

/** Characters found in your documents and drafts. Every outline, chapter and edit keeps them consistent. */
export function CharactersPanel({ projectId }: { projectId: string }) {
  const [chars, setChars] = useState<Character[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const { current, refresh } = useProject();
  const suggestFiction = chars.length >= 2 && current?.kind !== "fiction";

  const load = useCallback(async () => {
    try {
      const { characters } = await api<{ characters: Character[] }>(`/api/characters?projectId=${projectId}`);
      setChars(characters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load characters");
    }
  }, [projectId]);

  useEffect(() => {
    setChars([]);
    setNotice(null);
    void load();
  }, [load]);

  async function detect() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await post<{ characters: Character[]; found: number; added: number }>("/api/characters", {
        projectId,
        action: "detect",
      });
      setChars(res.characters);
      setNotice(
        res.found === 0
          ? "No named characters were found in your documents or drafts."
          : `Found ${res.found} character${res.found === 1 ? "" : "s"}, ${res.added} new.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detection failed");
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await post("/api/characters", { projectId, name: newName.trim() });
      setNewName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add character");
    }
  }

  async function save(c: Character, field: "name" | "role" | "description" | "aliases", value: string) {
    if (value === c[field]) return;
    try {
      const { character } = await patch<{ character: Character }>("/api/characters", { id: c.id, [field]: value });
      setChars((cs) => cs.map((x) => (x.id === c.id ? character : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      await load();
    }
  }

  async function remove(c: Character) {
    if (!confirm(`Remove ${c.name}?`)) return;
    try {
      await api(`/api/characters?id=${c.id}`, { method: "DELETE" });
      setChars((cs) => cs.filter((x) => x.id !== c.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <CollapsibleCard id="characters" title={<><Users size={16} /> Characters ({chars.length})</>} defaultOpen={false}>
      <p className="text-xs text-ink-700">Detected from your documents and drafts. Edit any entry; the writing keeps names, traits and relationships consistent.</p>
      <Button variant="secondary" onClick={detect} loading={busy} className="w-full">
        <ScanSearch size={14} /> {chars.length ? "Re-scan for characters" : "Detect characters"}
      </Button>
      {notice && <p className="text-xs text-ink-700">{notice}</p>}
      {suggestFiction && (
        <div className="rounded-lg bg-accent-soft p-2 text-xs">
          This looks like a story. Fiction mode writes scenes and dialogue instead of the non-fiction framework.
          <button
            className="ml-1 font-medium underline"
            onClick={async () => {
              await patch("/api/projects", { id: projectId, kind: "fiction" });
              await refresh();
            }}
          >
            Switch to Fiction
          </button>
        </div>
      )}
      <ErrorNote message={error} />
      <ul className="space-y-3">
        {chars.map((c) => (
          <li key={c.id} className="space-y-1 rounded-lg border border-ink-200 p-2">
            <div className="flex items-center gap-1">
              <input
                className="min-w-0 flex-1 !px-2 !py-1 font-medium"
                defaultValue={c.name}
                aria-label="Character name"
                onBlur={(e) => save(c, "name", e.target.value)}
              />
              <input
                className="w-24 !px-2 !py-1 text-xs"
                defaultValue={c.role}
                placeholder="role"
                aria-label="Role"
                onBlur={(e) => save(c, "role", e.target.value)}
              />
              <button onClick={() => remove(c)} aria-label={`Remove ${c.name}`} className="text-ink-700 hover:text-red-700">
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              rows={3}
              className="w-full !px-2 !py-1 text-xs"
              defaultValue={c.description}
              placeholder="Who they are, traits, relationships"
              aria-label="Description"
              onBlur={(e) => save(c, "description", e.target.value)}
            />
            <p className="text-[11px] text-ink-700/70">
              {c.source === "detected" ? "Auto-detected" : "Edited by you"}
              {c.aliases && ` · also: ${c.aliases}`}
            </p>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <input
          className="min-w-0 flex-1 !py-1 text-sm"
          placeholder="Add a character by name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button type="submit" variant="ghost" aria-label="Add character">
          <Plus size={14} />
        </Button>
      </form>
    </CollapsibleCard>
  );
}
