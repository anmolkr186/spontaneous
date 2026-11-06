import type { RecordingSummary } from "./capture";

/**
 * The browser build on localhost acts as if a recording just finished: the dev
 * server (scripts/dev-recordings.ts) hands over the sample in dev/sample, and the
 * editor opens it through the same path the desktop app uses after a capture.
 *
 * Pick another with the `recording` query parameter:
 *   ?recording=latest                     your newest capture in ~/Movies/Spontaneous
 *   ?recording=Recording Oct 31 at 05.08  a capture there by name
 *   ?recording=none                       no recording: the shot preview with the mock project
 */
let pending: { name: string; summary: Promise<RecordingSummary | null> } | null = null;

export function devRecording(): Promise<RecordingSummary | null> {
  const name = new URLSearchParams(window.location.search).get("recording") ?? "";
  if (name === "none") return Promise.resolve(null);
  // The editor asks on every focus; one fetch per name is enough.
  if (pending?.name !== name) {
    const summary = fetch(`/__dev/recording?name=${encodeURIComponent(name)}`)
      .then((res) => (res.ok ? (res.json() as Promise<RecordingSummary>) : null))
      .catch(() => null);
    pending = { name, summary };
  }
  return pending.summary;
}
