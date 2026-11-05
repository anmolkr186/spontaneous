/**
 * Display names. In code a component is `AgentCheckpoints`; on every docs page
 * it reads as "Agent checkpoints", in plain words. Prose that mentions another
 * component by its code name is rewritten the same way. Code blocks, props and
 * types keep the real identifiers, so agents can still copy them.
 */

/** Product and platform names that are written joined on purpose. */
const KEEP = new Set(["GitHub", "JavaScript", "TypeScript", "WebKit", "YouTube", "ScreenCaptureKit", "AVFoundation", "CoreML", "FaceTime", "QuickTime", "LinkedIn", "PostHog"]);
const IDENT = /\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b/g;

/** `AgentCheckpoints` → "Agent checkpoints". */
export function words(identifier: string) {
  const spaced = identifier.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Rewrites code names inside a sentence: "use ThinkingState" → "use Thinking state". */
export function say(text: string) {
  return text.replace(IDENT, (m) => (KEEP.has(m) ? m : words(m)));
}

/** A component's name as a title, in sentence case: "SourceKey and ToggleKey" → "Source key and toggle key". */
export function title(name: string) {
  const s = say(name);
  return s.charAt(0) + s.slice(1).replace(/\b([A-Z])([a-z])/g, (_, a: string, b: string) => a.toLowerCase() + b);
}
