import { issueSummary, type ServiceIssue } from "./errors";

/** An API error that also carries the structured cause (which service, what limit, how long) when the server knew it. */
export class ApiError extends Error {
  constructor(
    message: string,
    public issue?: ServiceIssue,
    public status?: number,
  ) {
    super(message);
  }
}

/** Browser events the status banner listens to. */
export const ISSUE_EVENT = "bas:issue";
export const OK_EVENT = "bas:ok";

export interface IssueEventDetail {
  issue: ServiceIssue;
  /** The API path that failed, so a later success of the same path clears the banner */
  path: string;
}

function emit(name: string, detail: unknown) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail }));
}

const pathOf = (url: string) => url.split("?")[0];

/** Typed fetch wrapper for the app's own API routes. Throws an ApiError with the server's plain-language message. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: isForm ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    const issue: ServiceIssue = {
      code: "network",
      title: "Cannot reach the app server",
      message: "The request did not get a response.",
      action: "Check your internet connection (or that the server is running) and try again.",
    };
    emit(ISSUE_EVENT, { issue, path: pathOf(url) } satisfies IssueEventDetail);
    throw new ApiError(issueSummary(issue), issue);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body (e.g. platform timeout page)
  }
  if (!res.ok) {
    const body = data as { error?: string; issue?: ServiceIssue } | null;
    let issue = body?.issue;
    // the host answered with its own page: usually a time limit
    if (!issue && body === null && (res.status === 502 || res.status === 503 || res.status === 504)) {
      issue = {
        code: "timeout",
        title: "The request took too long",
        message: "The server stopped waiting before the job finished.",
        action: "Try again. For long chapters, lower the word target.",
      };
    }
    const message = body?.error ?? (issue ? issueSummary(issue) : `Request failed (${res.status})`);
    if (issue) emit(ISSUE_EVENT, { issue, path: pathOf(url) } satisfies IssueEventDetail);
    throw new ApiError(message, issue, res.status);
  }
  emit(OK_EVENT, { path: pathOf(url) });
  return data as T;
}

export const post = <T,>(url: string, body: unknown) => api<T>(url, { method: "POST", body: JSON.stringify(body) });
export const put = <T,>(url: string, body: unknown) => api<T>(url, { method: "PUT", body: JSON.stringify(body) });
export const patch = <T,>(url: string, body: unknown) => api<T>(url, { method: "PATCH", body: JSON.stringify(body) });
