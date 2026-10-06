import Groq from "groq-sdk";
import { requireEnv } from "./utils";

/** Narrative writing and analysis. Override with GROQ_MODEL_WRITER. */
export const MODEL_WRITER = process.env.GROQ_MODEL_WRITER || "openai/gpt-oss-120b";
/** Quick, cheap tasks. Override with GROQ_MODEL_FAST. */
export const MODEL_FAST = process.env.GROQ_MODEL_FAST || "openai/gpt-oss-20b";

/** Upper bound on completion tokens; some Groq models cap output well below the 32K a chapter might request. */
const MAX_COMPLETION_TOKENS = Number(process.env.GROQ_MAX_COMPLETION_TOKENS) || 16000;

/** Rate-limit retries: how many times to wait and retry, and the longest single wait. */
const MAX_RETRIES = 4;
const MAX_WAIT_MS = 60_000;

let client: Groq | null = null;
function getClient() {
  if (!client) client = new Groq({ apiKey: requireEnv("GROQ_API_KEY"), maxRetries: 0 });
  return client;
}

interface AskOptions {
  system?: string;
  model?: string;
  maxTokens?: number;
  /** Constrain output to a single JSON object (Groq JSON mode). */
  json?: boolean;
}

/** Seconds Groq asks us to wait, from the retry-after header or its "try again in 7.2s" message. */
function retryDelayMs(error: unknown, attempt: number): number | null {
  const e = error as { status?: number; message?: string; headers?: Record<string, string> | Headers };
  // provider-side trouble ("over capacity", gateway errors): back off exponentially, 3s, 6s, 12s, 24s
  if (e?.status !== undefined && e.status >= 500 && e.status <= 504) return 3000 * 2 ** attempt;
  if (e?.status !== 429) return null;
  const header =
    e.headers instanceof Headers ? e.headers.get("retry-after") : (e.headers as Record<string, string> | undefined)?.["retry-after"];
  if (header && Number(header) > 0) return Number(header) * 1000;
  const m = e.message?.match(/try again in\s+(?:(\d+)m)?\s*([\d.]+)s/i);
  if (m) return ((Number(m[1] ?? 0) * 60) + Number(m[2])) * 1000;
  return 10_000;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function askLLM(prompt: string, opts: AskOptions = {}): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      const completion = await getClient().chat.completions.create({
        model: opts.model ?? MODEL_WRITER,
        reasoning_effort: "low",
        ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
        max_tokens: Math.min(opts.maxTokens ?? MAX_COMPLETION_TOKENS, MAX_COMPLETION_TOKENS),
        messages: [
          ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
          { role: "user" as const, content: prompt },
        ],
      });
      const choice = completion.choices[0];
      if (choice?.finish_reason === "length") {
        throw new Error("The response was cut off at the token limit. Lower the chapter word target or raise GROQ_MAX_COMPLETION_TOKENS.");
      }
      const text = choice?.message?.content?.trim();
      if (!text) throw new Error("The model returned an empty response.");
      return text;
    } catch (e) {
      const delay = retryDelayMs(e, attempt);
      // a request bigger than the per-minute limit can never succeed by waiting
      const tooLarge = /request too large/i.test((e as Error)?.message ?? "");
      if (delay === null || tooLarge || attempt >= MAX_RETRIES || delay > MAX_WAIT_MS) throw e;
      await sleep(delay + 500);
    }
  }
}

/**
 * Asks for a JSON object (JSON mode needs an object at the top level, so wrap arrays in a key)
 * and parses it. Retries once, since smaller models occasionally emit malformed JSON.
 */
export async function askLLMJson<T>(prompt: string, opts: AskOptions = {}): Promise<T> {
  const full = `${prompt}\n\nRespond with a single valid JSON object and nothing else. Escape quotes and newlines inside strings.`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseJson<T>(await askLLM(full, { ...opts, json: true }));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Model did not return valid JSON.");
}

export function parseJson<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[{[]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start === -1 || end <= start) throw new Error("Model did not return valid JSON. Try again.");
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  }
}
