import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronRight, RotateCcw, Search } from "lucide-react";
import { Fold, IconKey, Key, Mark, Tag } from "@/ui/atoms";
import { Switcher } from "@/ui/molecules";
import { CATEGORIES, ENTRIES } from "./registry";
import { HarnessPage, StreamSection } from "./stream";
import { ArbitrationDemo, LabelTester } from "./actions/arbitration";
import { PRIORITY } from "@/ui/cta";
import type { CtaIntent } from "@/ui/cta";
import { CTA_EXAMPLES, CTA_RULES } from "@/ui/agent-ui/catalog";
import { DETAILS } from "./details";
import type { DocEntry } from "./registry";
import styles from "./docs.module.css";

const FOUNDATIONS = [
  { id: "introduction", name: "Introduction" },
  { id: "color", name: "Color" },
  { id: "space", name: "Space and radius" },
  { id: "materials", name: "Materials" },
  { id: "type", name: "Type" },
  { id: "motion", name: "Motion" },
  { id: "interaction", name: "Interaction" },
  { id: "actions", name: "Actions" },
  { id: "harness", name: "Agent harness" },
] as const;
type FoundationId = (typeof FOUNDATIONS)[number]["id"];

function readHash(): string {
  const id = location.hash.slice(1);
  return ENTRIES.some((e) => e.id === id) || FOUNDATIONS.some((f) => f.id === id) ? id : "introduction";
}

export function DocsApp() {
  const [page, setPage] = useState(readHash);
  const [query, setQuery] = useState("");
  const [componentsOpen, setComponentsOpen] = useState(true);
  useEffect(() => {
    const onHash = () => { setPage(readHash()); document.querySelector(`.${styles.main}`)?.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const filtered = useMemo(() => ENTRIES.filter((e) => e.name.toLowerCase().includes(query.toLowerCase())), [query]);
  const go = (id: string) => { location.hash = id; };
  const entry = ENTRIES.find((e) => e.id === page);

  return (
    <div className={styles.shell}>
      <header className={styles.nav}>
        <span className={styles.brand}><Mark size={22} title="" />Spontaneous design system<small>0.2</small></span>
        <div className={styles.navRight}>
          <label className={styles.search}>
            <Search />
            <input placeholder="Search components" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search components" />
          </label>
        </div>
      </header>
      <aside className={styles.sidebar}>
        <div className={styles.group}>
          <h4 className={styles.groupTitle}>Foundations</h4>
          {FOUNDATIONS.map((f) => (
            <button key={f.id} type="button" className={styles.item} aria-current={page === f.id ? "page" : undefined} onClick={() => go(f.id)}>{f.name}</button>
          ))}
        </div>
        <div className={styles.group}>
          <button type="button" className={styles.dropdown} aria-expanded={componentsOpen} aria-controls="docs-components" onClick={() => setComponentsOpen(!componentsOpen)}>
            <ChevronRight className={styles.dropdownChevron} />
            <span>Components</span>
            <span className={styles.dropdownCount}>{filtered.length}</span>
          </button>
          <Fold open={componentsOpen || !!query} id="docs-components">
            <div className={styles.dropdownBody}>
              {CATEGORIES.map((category) => {
                const items = filtered.filter((e) => e.category === category);
                if (!items.length) return null;
                return (
                  <div key={category} className={styles.category}>
                    <h4 className={styles.categoryTitle}>{category}</h4>
                    {items.map((e) => (
                      <button key={e.id} type="button" className={styles.item} aria-current={page === e.id ? "page" : undefined} onClick={() => go(e.id)}>
                        <span className={styles.itemName}>{e.name}</span>
                        {e.isNew && <span className={styles.itemNew}>New</span>}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </Fold>
        </div>
      </aside>
      <main className={styles.main}>
        <motion.article key={page} className={styles.article} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.16 }}>
          {entry ? <ComponentPage entry={entry} /> : <Foundation id={page as FoundationId} go={go} />}
        </motion.article>
      </main>
    </div>
  );
}

function ComponentPage({ entry }: { entry: DocEntry }) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [take, setTake] = useState(0);
  const details = entry.details ?? DETAILS[entry.id];
  return (
    <>
      <div className={styles.crumb}><span>Components</span><ChevronRight /><span>{entry.category}</span></div>
      <h1 className={styles.title}>{entry.name}</h1>
      <p className={styles.lede}>{entry.description}</p>
      {entry.code && <p className={styles.codeName}>In code <code>{entry.code}</code> from <code>{entry.sourcePath.replace(/^src\//, "@/").replace(/\/index\.tsx$/, "").replace(/\.tsx$/, "")}</code></p>}
      <div className={styles.tabs}>
        <Switcher label="View" value={tab} onChange={setTab} options={[{ value: "preview", label: "Preview" }, { value: "code", label: "Code" }]} />
        <span className={styles.tabsMeta}>
          <Tag>{entry.layer.replace(/s$/, "")}</Tag>
          {tab === "preview" && <IconKey label="Replay" tooltip="top" size="sm" onClick={() => setTake(take + 1)}><RotateCcw /></IconKey>}
        </span>
      </div>
      {tab === "preview" ? (
        <div key={take} className={styles.preview} data-flush={entry.flush || undefined}>{entry.demo()}</div>
      ) : (
        <>
          <p className={styles.codeHead}>{entry.sourcePath}</p>
          <pre className={styles.code}>{entry.source}</pre>
        </>
      )}

      {details?.extra?.()}

      {details && (
        <>
          <h2 className={styles.h2}>Variants</h2>
          <p className={styles.limit}>{details.limit}</p>
          <table className={styles.table}>
            <thead><tr><th>Variant</th><th>Use when</th></tr></thead>
            <tbody>{details.variants.map((v) => <tr key={v.name}><td>{v.name}</td><td colSpan={2} className={styles.plain}>{v.when}</td></tr>)}</tbody>
          </table>
        </>
      )}

      {details?.states && (
        <>
          <h2 className={styles.h2}>States</h2>
          <div className={styles.states}>
            {details.states.map((st) => (
              <figure key={st.name} className={styles.state}>
                <div className={styles.stateStage}>{st.render()}</div>
                <figcaption><b>{st.name}</b>{st.note}</figcaption>
              </figure>
            ))}
          </div>
        </>
      )}

      {details?.interactions && (
        <>
          <h2 className={styles.h2}>Interactions</h2>
          <table className={styles.table}>
            <thead><tr><th>Input</th><th>Response</th></tr></thead>
            <tbody>{details.interactions.map((i) => <tr key={i.input}><td>{i.input}</td><td className={styles.plain}>{i.response}</td></tr>)}</tbody>
          </table>
        </>
      )}

      <StreamSection id={entry.id} />

      <h2 className={styles.h2}>Usage</h2>
      <pre className={styles.code}>{entry.usage}</pre>

      <h2 className={styles.h2}>Props</h2>
      <table className={styles.table}>
        <thead><tr><th>Prop</th><th>Type</th><th>Description</th></tr></thead>
        <tbody>{entry.props.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.type}</td><td>{p.description}</td></tr>)}</tbody>
      </table>

      {entry.keyboard && (
        <>
          <h2 className={styles.h2}>Keyboard</h2>
          <table className={styles.table}>
            <thead><tr><th>Keys</th><th>Does</th></tr></thead>
            <tbody>{entry.keyboard.map(([k, d]) => <tr key={k}><td><span className={styles.keys}>{k.split(" ").map((c, i) => <kbd key={i}>{c}</kbd>)}</span></td><td className={styles.plain}>{d}</td></tr>)}</tbody>
          </table>
        </>
      )}

      {entry.a11y && (
        <>
          <h2 className={styles.h2}>Accessibility</h2>
          <ul className={styles.ul}>{entry.a11y.map((a) => <li key={a}>{a}</li>)}</ul>
        </>
      )}

      {entry.motion && (
        <>
          <h2 className={styles.h2}>Motion</h2>
          <ul className={styles.ul}>{entry.motion.map((m) => <li key={m}>{m}</li>)}</ul>
        </>
      )}

      {entry.composedOf && (
        <>
          <h2 className={styles.h2}>Built from</h2>
          <div className={styles.chips}>{entry.composedOf.map((c) => <Tag key={c}>{c}</Tag>)}</div>
        </>
      )}

      <h2 className={styles.h2}>Notes for agents</h2>
      <div className={styles.note}>
        <h4>When to use</h4>
        <ul className={styles.ul}>{entry.whenToUse.map((w) => <li key={w}>{w}</li>)}</ul>
        {entry.whenNot && <><h4>When not to</h4><ul className={styles.ul} style={{ margin: 0 }}>{entry.whenNot.map((w) => <li key={w}>{w}</li>)}</ul></>}
      </div>
    </>
  );
}

function Foundation({ id, go }: { id: FoundationId; go: (id: string) => void }) {
  const name = FOUNDATIONS.find((f) => f.id === id)!.name;
  return (
    <>
      <div className={styles.crumb}><span>Foundations</span></div>
      <h1 className={styles.title}>{id === "introduction" ? "Spontaneous design system" : name}</h1>
      {id === "introduction" && <Intro go={go} />}
      {id === "color" && <ColorPage />}
      {id === "space" && <SpacePage />}
      {id === "materials" && <MaterialsPage />}
      {id === "type" && <TypePage />}
      {id === "motion" && <MotionPage />}
      {id === "interaction" && <InteractionPage />}
      {id === "actions" && <ActionsPage />}
      {id === "harness" && <HarnessPage go={go} />}
    </>
  );
}

function Intro({ go }: { go: (id: string) => void }) {
  return (
    <>
      <p className={styles.lede}>Everything in Spontaneous comes from the mark: a graphite tile carrying light, bevelled cells. The interface uses the same materials, so the app feels like one machined object.</p>
      <h2 className={styles.h2}>Structure</h2>
      <ul className={styles.ul}>
        <li><b>Foundations</b> are tokens: color, space, radius, materials, type and motion, all in <code>src/ui/tokens</code>.</li>
        <li><b>Atoms</b> are the smallest parts with one job: Key, icon key, tag, cell, timecode, meter, mark, and the motion atoms (rays, status glyph, rolling text and numbers, folds, swaps).</li>
        <li><b>Molecules</b> combine atoms into one interaction: switcher, group and field, dock keys, cards.</li>
        <li><b>Organisms</b> are complete regions of the app: the docks, the stage, the timeline, the agent thread.</li>
        <li><b>Base controls</b> in <code>src/ui/base</code> (slider, switch, scrub input, tooltip) handle behavior and accessibility, styled entirely by these tokens.</li>
      </ul>
      <p className={styles.p}>The sidebar groups components by job (Chat, Agent, Editing, Inputs, Feedback, Primitives); each page tags its layer. Agent cards share one shell, the Tray: a raised card in a shallow tray whose header and footer rows carry meta and actions.</p>
      <h2 className={styles.h2}>Rules</h2>
      <ul className={styles.ul}>
        <li>One primary key per surface; secondary for other real actions; tertiary for quiet and escape actions.</li>
        <li>Three signal colors, one meaning each: ink for what you marked, red for recording, blue for recorded footage. Everything else is graphite.</li>
        <li>Kinds are told apart by material and words, never by assigning hues.</li>
        <li>Who made an edit is always visible: a solid cell for you, a hollow cell for auto, the mark for the agent.</li>
        <li>Mono is for time. Nothing else.</li>
        <li>Springs for anything that moves on screen, and every animation has a reduced-motion branch.</li>
        <li>The agent at work is the light face (rays, a sweep of light), never a new hue.</li>
        <li>Nothing appears hard: content rises out of a small blur, labels and numbers roll, sizes glide, checks draw themselves.</li>
      </ul>
      <h2 className={styles.h2}>Components</h2>
      <div className={styles.cards}>
        {ENTRIES.map((e) => <button key={e.id} type="button" className={styles.card} onClick={() => go(e.id)}><b>{e.name}</b>{e.layer}</button>)}
      </div>
    </>
  );
}

const RAMP = ["950", "900", "850", "800", "750", "700", "650", "600", "500", "400", "300", "200", "100", "50"];
const SEMANTIC: [string, string][] = [
  ["--background", "App"], ["--surface", "Panels"], ["--surface-raised", "Cards"], ["--surface-muted", "Selected"],
  ["--foreground", "Text"], ["--text-secondary", "Secondary text"], ["--text-muted", "Labels"], ["--border", "Lines"],
  ["--ink", "Your marks"], ["--rec", "Recording"],
];

function ColorPage() {
  return (
    <>
      <p className={styles.lede}>A graphite ramp taken from the mark's tile and face, plus two signals. Ink is amber because it reads as a highlighter on both footage and graphite; it means "you marked this". Red only ever means recording.</p>
      <h2 className={styles.h2}>Graphite</h2>
      <div className={styles.ramp}>{RAMP.map((r) => <i key={r} style={{ background: `var(--g-${r})` }} title={`--g-${r}`} />)}</div>
      <h2 className={styles.h2}>Semantic</h2>
      <div className={styles.swatches}>
        {SEMANTIC.map(([v, use]) => <div key={v} className={styles.swatch}><i style={{ background: `var(${v})` }} /><b>{use}</b>{v}</div>)}
      </div>
    </>
  );
}

const SPACE = [["--space-0-5", 2], ["--space-1", 4], ["--space-1-5", 6], ["--space-2", 8], ["--space-2-5", 10], ["--space-3", 12], ["--space-4", 16], ["--space-5", 20], ["--space-6", 24], ["--space-8", 32], ["--space-10", 40], ["--space-12", 48]] as const;
const RADII = [["xs", 4], ["sm", 6], ["md", 8], ["lg", 10], ["key", 8], ["xl", 14], ["2xl", 18]] as const;

function SpacePage() {
  return (
    <>
      <p className={styles.lede}>A 4px grid. Radii are concentric: a key inside the dock uses the dock's radius minus the dock's padding, so curves stay parallel.</p>
      <h2 className={styles.h2}>Space</h2>
      <div className={styles.scale}>
        {SPACE.map(([v, px]) => <div key={v} className={styles.scaleRow}><code>{v}</code><span>{px}px</span><span className={styles.bar} style={{ width: px * 4 }} /></div>)}
      </div>
      <h2 className={styles.h2}>Radius</h2>
      <div className={styles.radii}>
        {RADII.map(([n, px]) => <div key={n} className={styles.radius} style={{ borderRadius: px }}>{n} · {px}</div>)}
      </div>
      <p className={styles.p} style={{ marginTop: 16 }}><code>--radius-key</code> = <code>--radius-dock</code> (12) − <code>--dock-pad</code> (4) = 8px. Agent cards: <code>--radius-tray</code> (14) − <code>--tray-pad</code> (3) = 11px.</p>
    </>
  );
}

function MaterialsPage() {
  return (
    <>
      <p className={styles.lede}>Depth comes from material, not from stacking borders and shadows. Each surface has exactly one treatment, lit from the top left like the mark.</p>
      <div className={styles.materials}>
        <div className={styles.material}><i style={{ background: "var(--surface)", boxShadow: "var(--card-shadow)", borderRadius: 10 }} /><b>Panel</b>Flat graphite. Holds everything else.</div>
        <div className={styles.material}><i style={{ background: "var(--key-bg)", boxShadow: "var(--key-shadow)", borderRadius: 9 }} /><b>Key</b>Lit top edge, shaded bottom. Most actions.</div>
        <div className={styles.material}><i style={{ background: "var(--face-bg)", boxShadow: "var(--face-shadow)", borderRadius: 9 }} /><b>Face</b>The mark's cell. One primary action.</div>
        <div className={styles.material}><i style={{ background: "var(--well-bg)", boxShadow: "var(--well-shadow)", borderRadius: 9 }} /><b>Well</b>Inset. Inputs and switchers sit in it.</div>
      </div>
      <h2 className={styles.h2}>Dock</h2>
      <p className={styles.p}>A floating slab for keys and wells: the annotation bar, the recorder, the composer. <code>--dock-bg</code> with <code>--dock-shadow</code>, radius <code>--radius-dock</code>, padding <code>--dock-pad</code>.</p>
      <h2 className={styles.h2}>Tray</h2>
      <p className={styles.p}>The shell for agent cards: a shallow well (<code>--tray-bg</code>, <code>--tray-shadow</code>, radius <code>--radius-tray</code> 14) around one raised card (<code>--tray-card-bg</code>, <code>--tray-card-shadow</code>, radius 11). The tray's own header and footer rows, <code>--tray-row</code> tall, carry the meta and the actions in a quieter voice.</p>
      <div className={styles.materials} style={{ gridTemplateColumns: "1fr" }}>
        <div style={{ padding: 3, borderRadius: 14, background: "var(--tray-bg)", boxShadow: "var(--tray-shadow)" }}>
          <div style={{ height: 30, display: "flex", alignItems: "center", padding: "0 10px", color: "var(--text-muted)", fontSize: 11 }}>Header row · meta</div>
          <div style={{ height: 72, borderRadius: 11, background: "var(--tray-card-bg)", boxShadow: "var(--tray-card-shadow)" }} />
          <div style={{ height: 30, display: "flex", alignItems: "center", padding: "0 10px", color: "var(--text-muted)", fontSize: 11 }}>Footer row · status and actions</div>
        </div>
      </div>
      <h2 className={styles.h2}>Live</h2>
      <p className={styles.p}>The agent at work uses the light face from the mark: <code>--live</code> for rays and progress fills, <code>--live-sheen</code> for the band of light that sweeps a label. It is never a hue, so ink, red and blue keep their one meaning each.</p>
    </>
  );
}

function TypePage() {
  const rows: [string, string, number, number][] = [
    ["--text-3xl", "Page title", 32, 600], ["--text-xl", "Section", 19, 600], ["--text-lg", "Lede", 16, 420],
    ["--text-base", "Body and controls", 13, 420], ["--text-sm", "Secondary", 12, 420], ["--text-xs", "Labels", 11, 520],
  ];
  return (
    <>
      <p className={styles.lede}>Geist for the interface, at 13px. Geist Mono only for time, so a timestamp is recognisable at a glance.</p>
      {rows.map(([v, use, px, w]) => <div key={v} className={styles.typeRow}><span>{v} · {px}</span><span style={{ fontSize: px, fontWeight: w, color: "var(--foreground)", letterSpacing: px > 18 ? "-.025em" : undefined }}>{use}</span></div>)}
      <div className={styles.typeRow}><span>Timecode</span><span className="mono" style={{ fontSize: 13, color: "var(--foreground)" }}>1:12.25</span></div>
    </>
  );
}

function MotionPage() {
  const [on, setOn] = useState(false);
  return (
    <>
      <p className={styles.lede}>Interface springs never overshoot; they settle. The camera uses the same model as the renderer, stored per project so it can be tuned.</p>
      <h2 className={styles.h2}>Interface</h2>
      <p className={styles.p}><code>snappy</code> for presses and toggles, <code>smooth</code> for panels, <code>morph</code> for keys sliding between options. Durations from 120ms (instant) to 480ms (considered).</p>
      <h2 className={styles.h2}>Agent motion</h2>
      <p className={styles.p}>Agent components share one vocabulary, built from the motion atoms. Use these words in specs and these atoms in code.</p>
      <table className={styles.table}>
        <thead><tr><th>Move</th><th>Token</th><th>What it does</th></tr></thead>
        <tbody>{AGENT_MOTION.map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td className={styles.plain}>{c}</td></tr>)}</tbody>
      </table>
      <h2 className={styles.h2}>Camera</h2>
      <p className={styles.p}>Zoom and pan are spring channels (stiffness 200, damping 40, mass 2.25), retargeted mid-flight with velocity carried over.</p>
      <div className={styles.preview} style={{ minHeight: 160 }}>
        <div className={styles.springDemo}>
          <motion.div className={styles.springBox} animate={{ x: on ? 220 : 0, scale: on ? 1.2 : 1 }} transition={{ type: "spring", stiffness: 200, damping: 40, mass: 2.25 }} />
          <Key onClick={() => setOn(!on)}>Retarget</Key>
        </div>
      </div>
    </>
  );
}

const AGENT_MOTION: [string, string, string][] = [
  ["Blur in", "blurIn · --blur-soft", "Content rises 3px out of a 2px blur and settles in 240ms. Leaving is faster and blurs out."],
  ["Roll", "RollText · --duration-roll", "A changing label rolls up: the old one into a 3px blur, the new one out of it. The box glides to the new width."],
  ["Count", "RollNumber", "Only changed digits roll, up when the number grows and down when it shrinks."],
  ["Fold", "Fold · --ease-glide", "Height opens on grid rows 0fr → 1fr over 380ms; content fades in 80ms behind it."],
  ["Swap", "Swap", "One status blurs out while the next rises in; neighbours glide to make room."],
  ["Draw", "StatusGlyph · --duration-draw", "Rays shrink away; a check or cross grows in and draws itself over 360ms."],
  ["Sweep", "Shimmer · --duration-sweep", "A band of light passes over a label every 1.6s while work runs."],
  ["Travel", "spring.travel", "A row that changes place (reorder, regroup, a note gliding into a step) moves on a 560ms spring with no bounce."],
  ["Morph", "spring.morph", "A card resolving to one line, a highlight following the pointer: 420ms, no bounce."],
  ["Pop", "spring.pop · --ease-pop", "Small marks landing (a vote, a check ring). The only place a bounce is allowed."],
  ["Stagger", "--stagger", "Rows arriving together come a beat apart, 60ms. Keep the whole stagger under 400ms."],
];

const INTENT_ROWS: [CtaIntent, string, string][] = [
  ["decide", "The agent is waiting on you", "Replace audio · Allow for an hour · Delete 3 takes"],
  ["run", "Start work", "Run 5 edits · Apply zoom at 0:12 · Send"],
  ["review", "Accept or reject what the agent proposed", "Accept 4 changes"],
  ["apply", "Take one suggestion", "Use Lid Rise · Apply as 3 edits"],
  ["finish", "Wrap up; waits while any decide or run is pending", "Export 1080p"],
  ["navigate", "Go somewhere", "Back to clip · Watch"],
  ["dismiss", "The way out. Never primary", "Keep current · Deny · Cancel"],
];

function ActionsPage() {
  return (
    <>
      <p className={styles.lede}>Every key that moves the work forward says what it will do, and each surface shows one primary: the action that matters most right now. The app decides which; the agent may word it.</p>
      <h2 className={styles.h2}>One primary per surface</h2>
      <p className={styles.p}>Surfaces are regions: the title bar, the notes list, the agent panel, the stage. Every key that could be primary is a <code>CtaKey</code> with an intent, and the region elects one by rank. When several asks wait, the oldest holds the primary, so you answer them in the order the agent asked; the next rises as each is answered. Any other tie goes to the newest: Send once you've typed beats a suggestion. The rest step down to secondary. Export waits while any region has a decision or work pending.</p>
      <table className={styles.table}>
        <thead><tr><th>Intent</th><th>Rank</th><th>When</th><th>Keys</th></tr></thead>
        <tbody>{INTENT_ROWS.map(([i, when, keys]) => <tr key={i}><td>{i}</td><td>{PRIORITY[i]}</td><td className={styles.plain}>{when}</td><td className={styles.plain}>{keys}</td></tr>)}</tbody>
      </table>
      <h3 className={styles.h3}>Step through a session</h3>
      <p className={styles.p}>An editor-shaped window with three regions in one election. Change the moment and watch the one primary per region move and the labels follow the notes.</p>
      <ArbitrationDemo />
      <h2 className={styles.h2}>Labels</h2>
      <p className={styles.p}>The app derives a label from context for every key (<code>src/ui/cta/derive.ts</code>), so a key is never missing or wrong. The agent may propose its own with any UI tool call; it is shown when it passes these checks (<code>validate.ts</code>) and replaced by the derived one when it doesn't.</p>
      <ul className={styles.ul}>{CTA_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
      <table className={styles.table}>
        <thead><tr><th>Intent</th><th>Good</th><th>Turned down</th></tr></thead>
        <tbody>{CTA_EXAMPLES.map(([i, g, b]) => <tr key={i}><td>{i}</td><td className={styles.plain}>{g}</td><td className={styles.plain}>{b}</td></tr>)}</tbody>
      </table>
      <h3 className={styles.h3}>Word it like the agent</h3>
      <LabelTester />
      <h2 className={styles.h2}>Motion</h2>
      <ul className={styles.ul}>
        <li>A key gaining the primary crossfades from the machined key to the light face over 240ms; losing it fades back. The weight stays the same, so nothing shifts.</li>
        <li>A label that changes with context rolls: the old words rise into a 3px blur as the new ones arrive, and the key glides to its new width.</li>
        <li>A destructive primary takes a red face, the one place a primary takes a hue.</li>
        <li>Reduced motion: the material swaps and labels change instantly.</li>
      </ul>
    </>
  );
}

const RULES: [string, string, string][] = [
  ["Hover", "Background or text lightens", "120–160ms, --ease-standard. Only on things you can click."],
  ["Press", "Seats 0.5px, scale .97–.98, inset shadow", "120ms. Icon keys and dock tools scale .94."],
  ["Select", "The chosen option rises as a key and slides", "Spring, visual 320ms, no bounce."],
  ["Focus", "2px light outline, 2px offset", "Keyboard only (:focus-visible). Text fields show a caret instead."],
  ["Disabled", "40% opacity, no pointer events", "Say why with a hint tooltip when it isn't obvious."],
  ["Reveal", "Scale from .94 and travel 3–6px away from the trigger", "--ease-reveal, 220ms. Tooltips, sheets, popovers."],
  ["Collapse", "Toward the trigger, faster than reveal", "--ease-collapse, 110ms."],
  ["Drag", "Grab cursor; the object follows the pointer 1:1", "No easing while dragging; settle on a spring on release."],
  ["Camera", "Zoom and pan follow springs", "Stiffness 200, damping 40, mass 2.25; retargets keep velocity."],
  ["Reduced motion", "Every transform becomes an opacity change", "Durations drop to near zero."],
];

function InteractionPage() {
  return (
    <>
      <p className={styles.lede}>Every interactive part answers the same inputs the same way. Component pages list their specific responses; these are the shared rules.</p>
      <table className={styles.table}>
        <thead><tr><th>Input</th><th>Response</th><th>Timing</th></tr></thead>
        <tbody>{RULES.map(([a, b, c]) => <tr key={a}><td>{a}</td><td className={styles.plain}>{b}</td><td className={styles.plain}>{c}</td></tr>)}</tbody>
      </table>
    </>
  );
}
