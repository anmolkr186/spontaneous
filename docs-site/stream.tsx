/**
 * How each component is reached from an agent run: the "In the stream" section
 * on component pages and the Agent harness page. Both read the catalog in
 * src/ui/agent-ui/catalog.ts, which also generates docs/AGENT_UI.md.
 */
import { CHOOSING, SURFACES, SURFACE_GROUPS, surfaceById } from "@/ui/agent-ui/catalog";
import type { AgentSurface } from "@/ui/agent-ui/catalog";
import { Tag } from "@/ui/atoms";
import { AgentSays, UserSays } from "./demo";
import { ENTRIES } from "./registry";
import styles from "./docs.module.css";

const nameOf = (id: string) => ENTRIES.find((e) => e.id === id)?.name ?? id;
const ids = SURFACES.map((s) => s.id).sort((a, b) => b.length - a.length);
/** Prose that names components by page id reads them as names. */
const pattern = (id: string) => (id === "ask" ? /\bask(?= \(ask_user\))/g : new RegExp(`\\b${id}\\b`, "g")); // "ask" is also a verb
const named = (text: string) => ids.reduce((t, id) => t.replace(pattern(id), nameOf(id)), text);
const SOURCE = { stream: "Stream", tool: "Tool", app: "App" } as const;

function TriggerTag({ s }: { s: AgentSurface }) {
  return (
    <span className={styles.trigger}>
      <Tag>{SOURCE[s.trigger.source]}</Tag>
      <span>{s.trigger.event}</span>
      {s.trigger.status === "proposed" && <Tag>Proposed tool</Tag>}
    </span>
  );
}

/** The section on a component page. Renders nothing for components the agent never reaches. */
export function StreamSection({ id }: { id: string }) {
  const s = surfaceById(id);
  if (!s) return null;
  const quiet = s.agentSays.startsWith("(");
  return (
    <>
      <h2 className={styles.h2}>In the stream</h2>
      <p className={styles.p}>{s.moment}</p>
      <table className={styles.table}>
        <tbody>
          <tr><td>Trigger</td><td className={styles.plain}><TriggerTag s={s} /></td></tr>
          <tr><td>Props from it</td><td className={styles.plain}>{named(s.props)}</td></tr>
          {s.keys && <tr><td>Keys</td><td className={styles.plain}>{named(s.keys)}</td></tr>}
          {s.instead && <tr><td>Instead</td><td className={styles.plain}>{named(s.instead)}</td></tr>}
        </tbody>
      </table>
      {!quiet || s.youSay ? (
        <>
          <h3 className={styles.h3}>Sample exchange</h3>
          <div className={styles.exchange}>
            {s.youSay && <UserSays>{s.youSay}</UserSays>}
            {quiet ? <p className={styles.exchangeNote}>{s.agentSays.replace(/^\(([^)]*)\)\s*/, "$1. ")}</p> : <AgentSays><p className={styles.exchangeText}>{s.agentSays}</p></AgentSays>}
          </div>
        </>
      ) : <p className={styles.p}>{s.agentSays.replace(/^\(([^)]*)\)\s*/, "$1. ")}</p>}
      {s.payload && (
        <>
          <p className={styles.codeHead}>What sets it off</p>
          <pre className={styles.code}>{s.payload}</pre>
        </>
      )}
    </>
  );
}

/** Foundations › Agent harness: choosing a component for a moment of the run. */
export function HarnessPage({ go }: { go: (id: string) => void }) {
  return (
    <>
      <p className={styles.lede}>The agent is the Claude Code CLI streaming stream-json, acting only through our tools. The harness turns that stream into thread parts and renders each with one component. This page says which.</p>
      <p className={styles.p}>
        Triggers come from three places: <b>stream</b> (an event in the agent's output), <b>tool</b> (a call to one of our MCP tools; proposed tools are the contract this page asks the tool server to add) and <b>app</b> (state the app owns). The same table is in <code>docs/AGENT_UI.md</code> for agents, generated from <code>src/ui/agent-ui/catalog.ts</code> by <code>npm run docs:agent-ui</code>.
      </p>
      <h2 className={styles.h2}>Choosing</h2>
      <p className={styles.p}>Ask these in order; the first that matches wins.</p>
      <table className={styles.table}>
        <thead><tr><th>When</th><th>Use</th></tr></thead>
        <tbody>{CHOOSING.map(([w, u]) => <tr key={w}><td className={styles.plain}>{w}</td><td className={styles.plain}>{named(u)}</td></tr>)}</tbody>
      </table>
      {SURFACE_GROUPS.map((g) => (
        <section key={g.group}>
          <h2 className={styles.h2}>{g.group}</h2>
          <div className={styles.surfaces}>
            {g.ids.map((id) => {
              const s = surfaceById(id)!;
              return (
                <button key={id} type="button" className={styles.surface} onClick={() => go(id)}>
                  <b>{nameOf(id)}</b>
                  <span>{s.moment}</span>
                  <TriggerTag s={s} />
                  {!s.agentSays.startsWith("(") && <q>{s.agentSays}</q>}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
