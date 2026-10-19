/** Fetches a YouTube transcript or a web page as plain text, for use as reference material. */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
}

export async function fetchYoutubeTranscript(id: string): Promise<{ title: string; text: string }> {
  // the Android client's player response carries caption URLs that download without a proof-of-origin token
  const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 14)" },
    body: JSON.stringify({
      context: { client: { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 34, hl: "en" } },
      videoId: id,
    }),
  });
  if (!res.ok) throw new Error(`YouTube returned ${res.status}`);
  const data = (await res.json()) as {
    videoDetails?: { title?: string };
    captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
  };
  const title = data.videoDetails?.title ?? `YouTube ${id}`;
  const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks?.length) throw new Error("This video has no captions available. Paste its transcript into a .txt file and upload that instead.");
  // prefer a manual English track, then auto-generated English, then whatever exists
  const track =
    tracks.find((t) => t.languageCode.startsWith("en") && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode.startsWith("en")) ??
    tracks[0];
  const cap = await fetch(track.baseUrl, { headers: { "User-Agent": UA } });
  if (!cap.ok) throw new Error(`Could not download captions (${cap.status})`);
  const xml = await cap.text();
  const lines = [...xml.matchAll(/<p [^>]*>([\s\S]*?)<\/p>/g)]
    .map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  // group into paragraphs so the reference chunker has natural breaks
  const paras: string[] = [];
  for (let i = 0; i < lines.length; i += 8) paras.push(lines.slice(i, i + 8).join(" "));
  const text = paras.join("\n\n").trim();
  if (!text) throw new Error("The captions were empty");
  return { title, text };
}

export async function fetchWebText(url: string): Promise<{ title: string; text: string }> {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) links are supported");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|0\.)/i.test(u.hostname)) {
    throw new Error("That address is not allowed");
  }
  const res = await fetch(u, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`The page returned ${res.status}`);
  const html = await res.text();
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? u.hostname);
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, "\n\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n\s*/g, "\n\n"),
  ).trim();
  if (text.length < 200) throw new Error("No readable text found on that page");
  return { title, text };
}

export async function importFromUrl(url: string): Promise<{ name: string; text: string }> {
  const id = youtubeId(url);
  if (id) {
    const { title, text } = await fetchYoutubeTranscript(id);
    return { name: `Video: ${title}`.slice(0, 120), text };
  }
  const { title, text } = await fetchWebText(url);
  return { name: `Web: ${title}`.slice(0, 120), text };
}
