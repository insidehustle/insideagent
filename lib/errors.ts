/**
 * Turns raw provider and infrastructure errors into something the author can act on:
 * which service failed, why (limit reached, quota used up, bad key, outage…), and what to do.
 * Pure functions, shared by the API routes (to build the response) and the browser (to display it).
 */

export type IssueCode =
  | "rate_limit" // too many requests or tokens per minute; clears by waiting
  | "quota" // daily, monthly or credit allowance used up
  | "auth" // key rejected
  | "missing_key" // key not configured
  | "unavailable" // provider outage or over capacity
  | "timeout" // took too long
  | "too_large" // request bigger than the provider accepts
  | "database"
  | "network"
  | "unknown";

export type Provider = "groq" | "gemini" | "tavily" | "pollinations" | "youtube" | "database";

export const PROVIDER_LABEL: Record<Provider, string> = {
  groq: "AI writing (Groq)",
  gemini: "Image generation (Gemini)",
  tavily: "Web search (Tavily)",
  pollinations: "Image generation (Pollinations)",
  youtube: "YouTube",
  database: "Database",
};

export interface ServiceIssue {
  code: IssueCode;
  provider?: Provider;
  /** Short heading, e.g. "AI writing is paused: daily limit reached" */
  title: string;
  /** What happened, in plain words */
  message: string;
  /** What to do about it */
  action: string;
  /** Seconds until it is worth trying again, when the provider said */
  retryAfterSec?: number;
  /** Whether waiting a minute or so is enough, or the allowance resets much later */
  window?: "minute" | "day";
  /** The raw provider text, for the details view */
  detail?: string;
}

interface ErrorLike {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
  provider?: Provider;
  headers?: Headers | Record<string, string>;
  cause?: unknown;
}

const text = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
};

/** Seconds from "try again in 7.2s", "in 14m22.5s" or "in 2h3m". */
function parseWait(msg: string): number | undefined {
  const m = msg.match(/(?:try again|retry)[^0-9]{0,12}in\s+(?:(\d+)h)?\s*(?:(\d+)m(?!s))?\s*(?:([\d.]+)s)?/i);
  if (!m) return undefined;
  const secs = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return secs > 0 ? Math.ceil(secs) : undefined;
}

function headerRetry(e: ErrorLike): number | undefined {
  const h = e.headers;
  const v = h instanceof Headers ? h.get("retry-after") : h ? (h as Record<string, string>)["retry-after"] : undefined;
  const n = Number(v);
  return n > 0 ? Math.ceil(n) : undefined;
}

export function formatWait(sec?: number): string {
  if (!sec) return "a little while";
  if (sec < 90) return `about ${sec} seconds`;
  if (sec < 5400) return `about ${Math.round(sec / 60)} minutes`;
  return `about ${Math.round(sec / 3600)} hours`;
}

function detectProvider(e: ErrorLike, msg: string): Provider | undefined {
  if (e.provider) return e.provider;
  if (/pollinations/i.test(msg)) return "pollinations";
  if (/gemini|generativelanguage|RESOURCE_EXHAUSTED|GEMINI_API_KEY/i.test(msg)) return "gemini";
  if (/tavily|web search failed|youtube search failed|TAVILY_API_KEY/i.test(msg)) return "tavily";
  if (/groq|GROQ_API_KEY|on tokens per|on requests per|rate limit reached for model/i.test(msg)) return "groq";
  if (/youtube|caption|transcript/i.test(msg)) return "youtube";
  if (/prisma|database|P10\d\d|P20\d\d|ECONNREFUSED.*5432/i.test(msg) || /^P\d{4}$/.test(e.code ?? "")) return "database";
  return undefined;
}

/** Returns a ServiceIssue for provider and infrastructure failures, or null when the error is an ordinary app error. */
export function classifyError(error: unknown): ServiceIssue | null {
  const e = (error ?? {}) as ErrorLike;
  const msg = text(error);
  const status = typeof e.status === "number" ? e.status : undefined;
  const provider = detectProvider(e, msg);
  const label = provider ? PROVIDER_LABEL[provider] : "An outside service";
  const detail = msg.slice(0, 600);

  // missing configuration
  const missing = msg.match(/^([A-Z][A-Z0-9_]+) is not set/);
  if (missing) {
    return {
      code: "missing_key",
      provider,
      title: `${label} is not set up`,
      message: `${missing[1]} is missing from the server settings.`,
      action: `Add ${missing[1]} to .env.local (or the hosting provider's environment variables) and restart the app.`,
      detail,
    };
  }

  // database
  if (provider === "database" || /P2021|P2022|does not exist in the current database|Can't reach database|connection (?:pool|refused)|ECONNREFUSED|P1001|P1002|P1017/i.test(msg)) {
    const stale = /P2021|P2022|does not exist/i.test(msg);
    return {
      code: "database",
      provider: "database",
      title: stale ? "The database needs updating" : "Cannot reach the database",
      message: stale ? "A table or column this feature needs is missing." : "The app could not connect to its database.",
      action: stale
        ? "Run npm run db:push against this database, then try again."
        : "Check DATABASE_URL and that the database is running (a paused Neon database wakes up on the next try).",
      detail,
    };
  }

  // out of credit / quota (checked before plain rate limit: many providers answer 429 for both)
  const dayLimit = /per day|\(TPD\)|\(RPD\)|daily/i.test(msg);
  const quotaWords = /insufficient[_ ]quota|exceeded your current quota|billing|out of credits?|credit balance|usage limit|plan'?s set usage|payment required|free tier|RESOURCE_EXHAUSTED.*quota|quota.*exceeded/i.test(msg);
  if (status === 402 || status === 432 || status === 433 || quotaWords || (dayLimit && (status === 429 || /rate limit/i.test(msg)))) {
    const wait = parseWait(msg) ?? headerRetry(e);
    const resets = dayLimit && wait ? ` It should reset in ${formatWait(wait)}.` : "";
    const how: Record<string, string> = {
      groq: "Wait for the allowance to reset, upgrade the Groq plan, or set a different GROQ_API_KEY.",
      tavily: "Add search credits or upgrade the Tavily plan, or wait for the monthly reset. Research and YouTube search are unavailable until then.",
      gemini: "Check the Gemini API quota and billing in Google AI Studio. Covers fall back to Pollinations when IMAGE_PROVIDER is not forced to Gemini.",
      pollinations: "Set POLLINATIONS_API_KEY (free at enter.pollinations.ai) or wait and try again.",
    };
    return {
      code: "quota",
      provider,
      window: dayLimit ? "day" : undefined,
      retryAfterSec: wait,
      title: `${label} has used up its allowance`,
      message: `${label} reports its ${dayLimit ? "daily" : "usage"} limit or credit has been reached.${resets}`,
      action: (provider && how[provider]) || "Wait for the allowance to reset, or add credit or upgrade the plan with that provider.",
      detail,
    };
  }

  // too many requests right now
  const tooLarge = status === 413 || /request too large/i.test(msg);
  if (!tooLarge && (status === 429 || /rate.?limit|too many requests|tokens per minute|requests per minute|\(TPM\)|\(RPM\)/i.test(msg))) {
    const wait = parseWait(msg) ?? headerRetry(e);
    return {
      code: "rate_limit",
      provider,
      window: "minute",
      retryAfterSec: wait,
      title: `${label} is rate limited`,
      message: `${label} is receiving requests faster than its plan allows.`,
      action: `Wait ${formatWait(wait ?? 60)} and try again. Long jobs such as Write the whole book pause and retry on their own.`,
      detail,
    };
  }

  // bad key
  if (status === 401 || status === 403 || /invalid[_ ]api[_ ]key|incorrect api key|api key not valid|unauthorized|permission denied|PERMISSION_DENIED|API_KEY_INVALID/i.test(msg)) {
    if (provider) {
      return {
        code: "auth",
        provider,
        title: `${label} rejected the API key`,
        message: "The key is wrong, expired, revoked or lacks access.",
        action: `Check the key for ${label} in .env.local or the hosting environment variables, then restart.`,
        detail,
      };
    }
  }

  if (status === 413 || /request too large|too large|context length|maximum context|too many tokens/i.test(msg)) {
    return {
      code: "too_large",
      provider,
      title: "That request is too big for the AI",
      message: "The text and reference material together are larger than the model accepts in one go.",
      action: "Use a shorter word target, switch off some reference documents, or shorten the instructions, then try again.",
      detail,
    };
  }

  if (/timed? ?out|ETIMEDOUT|AbortError|deadline|FUNCTION_INVOCATION_TIMEOUT|504/i.test(msg) || status === 504 || status === 408) {
    return {
      code: "timeout",
      provider,
      title: `${label} took too long`,
      message: "The request ran out of time before finishing.",
      action: "Try again. For a long chapter, lower the word target; for the whole book, use Write the whole book, which does one chapter at a time.",
      detail,
    };
  }

  if ((status !== undefined && status >= 500 && status <= 599) || /over capacity|overloaded|service unavailable|bad gateway|internal server error|UNAVAILABLE/i.test(msg)) {
    return {
      code: "unavailable",
      provider,
      title: `${label} is having trouble`,
      message: "The provider is overloaded or down at the moment. This is not caused by your account.",
      action: "Wait a few minutes and try again.",
      detail,
    };
  }

  if (/fetch failed|ENOTFOUND|ECONNRESET|EAI_AGAIN|network|socket hang up/i.test(msg)) {
    return {
      code: "network",
      provider,
      title: "Cannot reach the service",
      message: `The server could not connect to ${provider ? label : "an outside service"}.`,
      action: "Check the internet connection and try again.",
      detail,
    };
  }

  return null;
}

/** One line for plain error boxes: what happened and what to do. */
export function issueSummary(issue: ServiceIssue): string {
  return `${issue.title}. ${issue.message} ${issue.action}`;
}

/** Whether this kind of issue means AI-powered work cannot continue right now (used to show the banner). */
export const BLOCKING: IssueCode[] = ["rate_limit", "quota", "auth", "missing_key", "unavailable", "database", "network", "timeout"];
