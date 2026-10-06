/** Typed fetch wrapper for the app's own API routes. Throws with the server's error message. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(url, {
    ...init,
    headers: isForm ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body (e.g. platform timeout page)
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export const post = <T,>(url: string, body: unknown) => api<T>(url, { method: "POST", body: JSON.stringify(body) });
export const put = <T,>(url: string, body: unknown) => api<T>(url, { method: "PUT", body: JSON.stringify(body) });
export const patch = <T,>(url: string, body: unknown) => api<T>(url, { method: "PATCH", body: JSON.stringify(body) });
