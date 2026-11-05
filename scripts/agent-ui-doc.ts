/**
 * Writes docs/AGENT_UI.md from src/ui/agent-ui/catalog.ts, so the reference
 * agents read and the docs site never drift apart. Run: npm run docs:agent-ui
 */
import { writeFileSync } from "node:fs";
import { CHOOSING, SURFACES, SURFACE_GROUPS } from "../src/ui/agent-ui/catalog.ts";

const words = (id: string) => id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().replace(/^./, (c) => c.toUpperCase());
const nameOf = (component: string) => component.split(/,\s*/).map(words).join(", ");
const source = (s: (typeof SURFACES)[number]) =>
  s.trigger.source === "tool" ? `tool \`${s.trigger.event}\`${s.trigger.status ? ` (${s.trigger.status})` : ""}` : `${s.trigger.source}: ${s.trigger.event}`;

/** "agent-plan first" → "Agent plan first": page ids in prose read as component names. */
const pattern = (id: string) => (id === "ask" ? /\bask(?= \(ask_user\))/g : new RegExp(`\\b${id}\\b`, "g")); // "ask" is also a verb
const named = (text: string) => SURFACES.reduce((t, s) => t.replace(pattern(s.id), nameOf(s.component).split(", ")[0]!), text);

const out: string[] = [];
out.push(`# Agent UI: which component for which moment

Generated from \`src/ui/agent-ui/catalog.ts\` by \`npm run docs:agent-ui\`. Don't edit by hand.

The agent is the Claude Code CLI streaming stream-json, acting only through our MCP tools (\`mcp__spontaneous__*\`). The harness turns that stream into thread parts and renders each part with the component below. Every component has a live page at \`/docs.html#<id>\` with its props, keyboard, accessibility and motion.

Triggers come from three places: **stream** (an event in Claude Code's output), **tool** (a call to one of our MCP tools; *proposed* tools are the contract this document asks the MCP server to add), and **app** (state the app owns).

## Choosing

Ask these in order; the first that matches wins.

| When | Use |
|---|---|
${CHOOSING.map(([w, u]) => `| ${w} | ${named(u)} |`).join("\n")}

## At a glance

| Moment | Component | Import | Trigger |
|---|---|---|---|
${SURFACE_GROUPS.flatMap((g) => g.ids.map((id) => SURFACES.find((s) => s.id === id)!)).map((s) => `| ${s.moment} | ${nameOf(s.component)} (\`${s.component}\`) | \`${s.from}\` | ${source(s)} |`).join("\n")}
`);

for (const g of SURFACE_GROUPS) {
  out.push(`## ${g.group}\n`);
  for (const id of g.ids) {
    const s = SURFACES.find((x) => x.id === id)!;
    out.push(`### ${nameOf(s.component)}

\`import { ${s.component} } from "${s.from}"\` · docs: \`/docs.html#${s.id}\`

${s.moment}

- **Trigger:** ${source(s)}
${s.youSay ? `- **You say:** “${s.youSay}”\n` : ""}- **Agent says:** “${s.agentSays}”
- **Props:** ${s.props}
${s.instead ? `- **Instead:** ${named(s.instead)}\n` : ""}${s.payload ? `\n\`\`\`js\n${s.payload}\n\`\`\`\n` : ""}`);
  }
}

writeFileSync(new URL("../docs/AGENT_UI.md", import.meta.url), out.join("\n").replace(/\n{3,}/g, "\n\n"));
console.log(`docs/AGENT_UI.md: ${SURFACES.length} surfaces`);
