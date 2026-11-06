/**
 * Marks for the agent harnesses, drawn in currentColor so they sit in a key
 * like any other glyph.
 */
import type { SVGProps } from "react";

/** Claude Code: a starburst of uneven rays. */
const RAYS = [10, 7.2, 9, 6.8, 9.6, 7, 8.8, 7.4, 9.8, 6.6, 9.2, 7.2];

export function ClaudeCodeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={2.1} aria-hidden {...props}>
      {RAYS.map((r, i) => {
        const a = (i / RAYS.length) * Math.PI * 2 - Math.PI / 2;
        return <line key={i} x1={12 + Math.cos(a) * 1.6} y1={12 + Math.sin(a) * 1.6} x2={12 + Math.cos(a) * r} y2={12 + Math.sin(a) * r} />;
      })}
    </svg>
  );
}

/** Codex: a prompt in a rounded frame. */
export function CodexIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} aria-hidden {...props}>
      <rect x="2.75" y="4.25" width="18.5" height="15.5" rx="5" />
      <path d="m7.5 9.5 3 2.5-3 2.5" />
      <path d="M12.75 15h4" />
    </svg>
  );
}
