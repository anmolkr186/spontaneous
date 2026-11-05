/**
 * A word diff for prose: the text split into words that carry their trailing
 * space, compared by longest common subsequence, then grouped so every run of
 * removed and added words between two unchanged stretches is one change.
 */

export type DiffSegment =
  | { type: "equal"; text: string }
  | { type: "change"; remove: string; insert: string };

/** Above this many cells the middle is shown as one change instead of diffed word by word. */
const MAX_CELLS = 4_000_000;

const tokenize = (s: string) => s.match(/^\s+|\S+\s*/g) ?? [];
const same = (a: string, b: string) => a.trim() === b.trim();

export function diffWords(original: string, suggested: string): DiffSegment[] {
  const a = tokenize(original);
  const b = tokenize(suggested);

  // Shared start and end are cheap to find and usually most of the text.
  let start = 0;
  while (start < a.length && start < b.length && same(a[start]!, b[start]!)) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && same(a[endA - 1]!, b[endB - 1]!)) { endA--; endB--; }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const ops: { op: "=" | "-" | "+"; text: string }[] = a.slice(0, start).map((text) => ({ op: "=" as const, text }));

  if ((midA.length + 1) * (midB.length + 1) > MAX_CELLS) {
    midA.forEach((text) => ops.push({ op: "-", text }));
    midB.forEach((text) => ops.push({ op: "+", text }));
  } else {
    // lcs[i][j]: length of the common subsequence of midA[i…] and midB[j…].
    const n = midA.length, m = midB.length, w = m + 1;
    const lcs = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * w + j] = same(midA[i]!, midB[j]!) ? lcs[(i + 1) * w + j + 1]! + 1 : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!);
      }
    }
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && same(midA[i]!, midB[j]!)) { ops.push({ op: "=", text: midA[i]! }); i++; j++; }
      else if (j >= m || (i < n && lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!)) ops.push({ op: "-", text: midA[i++]! });
      else ops.push({ op: "+", text: midB[j++]! });
    }
  }
  a.slice(endA).forEach((text) => ops.push({ op: "=", text }));

  const out: DiffSegment[] = [];
  for (const { op, text } of ops) {
    const last = out[out.length - 1];
    if (op === "=") {
      if (last?.type === "equal") last.text += text;
      else out.push({ type: "equal", text });
    } else {
      const change = last?.type === "change" ? last : (out.push({ type: "change", remove: "", insert: "" }), out[out.length - 1] as Extract<DiffSegment, { type: "change" }>);
      if (op === "-") change.remove += text;
      else change.insert += text;
    }
  }
  return out;
}

/** The text with each change taken (accepted) or left as it was. */
export function textOf(segments: DiffSegment[], take: (changeIndex: number) => boolean) {
  let k = 0;
  return segments.map((s) => (s.type === "equal" ? s.text : take(k++) ? s.insert : s.remove)).join("");
}
