"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { api, post } from "@/lib/client";
import { Button, Card, ErrorNote, Label } from "./ui/kit";
import type { ChapterRow } from "./ChapterEditor";

interface SocialPost {
  kind: "post" | "thread";
  text: string;
  tells: string[];
  characters: number;
}

export function SocialExporter({ projectId }: { projectId: string }) {
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [chapterId, setChapterId] = useState("");
  const [platform, setPlatform] = useState<"linkedin" | "x">("linkedin");
  const [count, setCount] = useState(3);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [copied, setCopied] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChapters([]);
    setChapterId("");
    setPosts([]);
    api<{ chapters: ChapterRow[] }>(`/api/chapters?projectId=${projectId}`)
      .then(({ chapters }) => {
        const drafted = chapters.filter((c) => c.status !== "outline");
        setChapters(drafted);
        setChapterId(drafted[0]?.id ?? "");
      })
      .catch((e) => setError(e.message));
  }, [projectId]);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ posts: SocialPost[] }>("/api/social-repurpose", { chapterId, platform, count });
      setPosts(res.posts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Repurposing failed");
    } finally {
      setBusy(false);
    }
  }

  async function copy(i: number) {
    try {
      await navigator.clipboard.writeText(posts[i].text);
      setCopied(i);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Clipboard access was blocked. Select the text and copy manually.");
    }
  }

  const limit = platform === "x" ? 280 : 3000;

  return (
    <div className="space-y-6">
      <Card className="grid gap-4 sm:grid-cols-4">
        <label className="block sm:col-span-2">
          <Label>Chapter</Label>
          <select className="w-full" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
            {chapters.length === 0 && <option value="">No drafted chapters yet</option>}
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.order}. {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <Label>Platform</Label>
          <select className="w-full" value={platform} onChange={(e) => setPlatform(e.target.value as "linkedin" | "x")}>
            <option value="linkedin">LinkedIn</option>
            <option value="x">X</option>
          </select>
        </label>
        <label className="block">
          <Label>Posts</Label>
          <input type="number" min={1} max={6} className="w-full" value={count} onChange={(e) => setCount(+e.target.value)} />
        </label>
        <div className="sm:col-span-4">
          <Button onClick={generate} loading={busy} disabled={!chapterId}>
            Generate posts
          </Button>
        </div>
      </Card>
      <ErrorNote message={error} />
      <div className="space-y-4">
        {posts.map((p, i) => (
          <Card key={i} className="space-y-3">
            <div className="flex items-center justify-between text-xs text-ink-700">
              <span>
                {p.kind === "thread" ? "Thread" : "Post"} ·{" "}
                <span className={p.kind === "post" && p.characters > limit ? "text-red-700" : ""}>{p.characters} chars</span>
              </span>
              <Button variant="ghost" onClick={() => copy(i)}>
                {copied === i ? <Check size={14} /> : <Copy size={14} />} {copied === i ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="whitespace-pre-wrap text-sm">{p.text}</p>
            {p.tells.length > 0 && (
              <p className="flex items-center gap-1 text-xs text-amber-700">
                <AlertTriangle size={12} /> Still contains possible AI tells ({p.tells.join(", ")}). Worth a manual pass.
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
