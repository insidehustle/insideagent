export interface DiffPart {
  kind: "same" | "add" | "remove";
  text: string;
}

/** Longest-common-subsequence diff over a list of tokens. Falls back to a plain replace for very large inputs. */
function lcsDiff(a: string[], b: string[]): DiffPart[] {
  const n = a.length;
  const m = b.length;
  if (n * m > 4_000_000) {
    return [
      ...(a.length ? [{ kind: "remove" as const, text: a.join("") }] : []),
      ...(b.length ? [{ kind: "add" as const, text: b.join("") }] : []),
    ];
  }
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const parts: DiffPart[] = [];
  const push = (kind: DiffPart["kind"], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("remove", a[i++]);
    } else {
      push("add", b[j++]);
    }
  }
  while (i < n) push("remove", a[i++]);
  while (j < m) push("add", b[j++]);
  return parts;
}

/** Word-level diff from `before` to `after`. Whitespace is kept as its own tokens so the text reads naturally. */
export function diffWords(before: string, after: string): DiffPart[] {
  const tok = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];
  return lcsDiff(tok(before), tok(after));
}
