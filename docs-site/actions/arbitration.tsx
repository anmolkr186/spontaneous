/**
 * Actions › arbitration specimen. An editor-shaped mock with three regions (title
 * bar, notes, agent panel) in one election. Step through the moments of a
 * session and watch the one primary per region move, labels regenerate from
 * context, and Export wait for the work. Below, try wording a key as the agent
 * would and see whether the app accepts it.
 */
import { useState } from "react";
import { AudioLines, Clapperboard } from "lucide-react";
import { Key, Tag, Timecode } from "@/ui/atoms";
import { Switcher } from "@/ui/molecules";
import { ApprovalCard } from "@/ui/organisms/approval-card";
import { AgentPlan } from "@/ui/organisms/agent-plan";
import type { PlanStep } from "@/ui/organisms/agent-plan";
import { SuggestionChips } from "@/ui/organisms/agent";
import { CtaKey, CtaRegion, CtaRoot, checkLabel, exportLabel, notesLabel } from "@/ui/cta";
import type { CtaIntent } from "@/ui/cta";
import { AgentSays, UserSays } from "../demo";
import styles from "./arbitration.module.css";

type Moment = "idle" | "notes" | "plan" | "approval" | "done";
const MOMENTS: { value: Moment; label: string }[] = [
  { value: "idle", label: "Idle" }, { value: "notes", label: "Notes open" }, { value: "plan", label: "Plan proposed" },
  { value: "approval", label: "Needs a yes" }, { value: "done", label: "Finished" },
];
const NOTE_SETS: Record<"zooms" | "mixed" | "one", { at: number; intents: ("zoom" | "cut" | "callout")[]; text: string }[]> = {
  one: [{ at: 12, intents: ["zoom"], text: "Zoom here, the button is tiny" }],
  zooms: [{ at: 12, intents: ["zoom"], text: "Zoom here, the button is tiny" }, { at: 31, intents: ["zoom"], text: "Zoom on the share menu" }, { at: 65, intents: ["zoom"], text: "Push in on the toast" }],
  mixed: [{ at: 12, intents: ["zoom"], text: "Zoom here, the button is tiny" }, { at: 42, intents: ["cut"], text: "Cut this pause" }, { at: 65, intents: ["callout"], text: "Call out the share link" }],
};
const STEPS: PlanStep[] = [
  { id: "s1", title: "Cut the dead air after the form", tool: "cut", from: 42, to: 51 },
  { id: "s2", title: "Zoom on the Create button", tool: "add_zoom", from: 12 },
  { id: "s3", title: "Add a callout on the Share menu", tool: "add_overlay", from: 65 },
];

function Mock({ moment, notes }: { moment: Moment; notes: keyof typeof NOTE_SETS }) {
  const open = moment === "notes" || moment === "plan" || moment === "approval" ? NOTE_SETS[notes] : [];
  return (
    <CtaRoot>
      <div className={styles.window}>
        <div className={styles.bar}>
          <Clapperboard /><span>Projects walkthrough</span>
          <span className={styles.grow} />
          <CtaRegion name="titlebar"><CtaKey size="sm" intent="finish" label={exportLabel()} /></CtaRegion>
        </div>
        <div className={styles.body}>
          <CtaRegion name="notes">
            <section className={styles.notes} aria-label="Notes">
              <h4>Notes</h4>
              {open.length ? open.map((n, i) => (
                <div key={n.at} className={styles.note}><span className={styles.pin}>{i + 1}</span><Timecode value={n.at} muted /><span>{n.text}</span></div>
              )) : <p className={styles.empty}>No open notes</p>}
              <div className={styles.notesBar}>
                <span>{open.length} open</span>
                <CtaKey size="sm" intent="run" count={open.length} label={notesLabel(open)} disabled={!open.length} reason="No open notes" />
              </div>
            </section>
          </CtaRegion>
          <CtaRegion name="agent">
            <section className={styles.agent} aria-label="Agent">
              {moment === "plan" && (
                <AgentSays><AgentPlan title="Tighten the Projects walkthrough" defaultSteps={STEPS} estimate="~30s" onCancel={() => {}} onRun={() => {}} /></AgentSays>
              )}
              {moment === "approval" && (
                <AgentSays status="Needs you">
                  <ApprovalCard title="Replace the recording's audio with the cleaned track" description="Room hum removed" risk="medium" tool="replace_audio" icon={<AudioLines />}
                    details={[{ label: "Track", value: "Microphone" }, { label: "Length", value: <Timecode value={134} /> }]} allowAlways={false} onApprove={() => {}} />
                </AgentSays>
              )}
              {moment === "done" && <><UserSays>Apply my notes.</UserSays><AgentSays><p className={styles.text}>Applied 3 notes: two zooms and a callout.</p></AgentSays></>}
              <span className={styles.grow} />
              {moment === "notes" && <SuggestionChips items={[{ id: "apply", intent: "run", label: notesLabel(open), onSelect: () => {} }, { id: "draft", label: "Draft a launch cut", onSelect: () => {} }]} />}
              <div className={styles.composer}><span>Ask the agent…</span><Key size="sm" variant="secondary" disabled>Send</Key></div>
            </section>
          </CtaRegion>
        </div>
      </div>
    </CtaRoot>
  );
}

const INTENTS: { value: CtaIntent; label: string }[] = [
  { value: "decide", label: "Decide" }, { value: "run", label: "Run" }, { value: "review", label: "Review" }, { value: "apply", label: "Apply" }, { value: "finish", label: "Finish" },
];

/** Try wording a key as the agent would and see whether the app shows it. */
export function LabelTester() {
  const [text, setText] = useState("Tighten the intro");
  const [intent, setIntent] = useState<CtaIntent>("run");
  const verdict = checkLabel(text, { intent, count: 3 });
  return (
    <div className={styles.tester}>
      <div className={styles.testerRow}>
        <input className={styles.input} value={text} onChange={(e) => setText(e.target.value)} aria-label="Proposed label" spellCheck={false} />
        <Switcher label="Intent" size="sm" value={intent} onChange={setIntent} options={INTENTS} />
      </div>
      <div className={styles.testerRow}>
        <CtaKey intent={intent} label="Run 3 edits" proposal={text} count={3} role="primary" />
        {verdict.ok ? <Tag>Shown as written</Tag> : <span className={styles.reason}><Tag>Turned down</Tag>{verdict.reason}. The key falls back to the derived label.</span>}
      </div>
      <p className={styles.hint}>The action here touches 3 things, so a number in the label must be 3.</p>
    </div>
  );
}

export function ArbitrationDemo() {
  const [moment, setMoment] = useState<Moment>("notes");
  const [notes, setNotes] = useState<keyof typeof NOTE_SETS>("zooms");
  return (
    <>
      <div className={styles.controls}>
        <Switcher label="Moment" value={moment} onChange={setMoment} options={MOMENTS} />
        {moment !== "idle" && moment !== "done" && (
          <Switcher label="Notes" size="sm" value={notes} onChange={setNotes} options={[{ value: "one", label: "1 note" }, { value: "zooms", label: "3 zooms" }, { value: "mixed", label: "Mixed" }]} />
        )}
      </div>
      <Mock moment={moment} notes={notes} />

    </>
  );
}
