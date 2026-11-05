import { useState } from "react";
import { motion } from "motion/react";
import { AudioLines, Trash2 } from "lucide-react";
import { Timecode } from "@/ui/atoms";
import { ApprovalCard } from "@/ui/organisms/approval-card";
import { CtaRegion } from "@/ui/cta";
import src from "@/ui/organisms/approval-card/index.tsx?raw";
import { blurIn } from "@/ui/tokens/motion";
import { AgentSays, DemoPanel, UserSays, useScript } from "../demo";
import type { DocEntry } from "../registry";

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function Demo() {
  const [asked, setAsked] = useState(false);
  const root = useScript([
    { at: 2600, run: () => root.current?.querySelector<HTMLButtonElement>("[data-action='approve']")?.click() },
    { at: 5600, run: () => setAsked(true) },
  ]);
  return (
    <div ref={root}>
      <CtaRegion name="agent"><DemoPanel>
        <UserSays>Clean up the narration on the Projects demo and drop the takes I didn't use.</UserSays>
        <AgentSays status="Needs you">
          <ApprovalCard
            label="Step 2 · Audio"
            title="Replace the recording's audio with the cleaned track"
            description="Room hum removed and levels evened out"
            risk="medium"
            tool="replace_audio"
            icon={<AudioLines />}
            details={[
              { label: "Track", value: "Microphone" },
              { label: "Length", value: <Timecode value={134} /> },
              { label: "Changes", value: "Hum removed, peaks down 3 dB" },
            ]}
            expiresIn={60}
            onApprove={() => wait(1400)}
          />
          {asked && (
            <motion.div {...blurIn}>
              <ApprovalCard
                label="Step 3 · Takes"
                title="Delete 3 unused takes"
                description="Takes 2, 3 and 5 aren't on the timeline"
                risk="high"
                tool="delete_takes"
                count={3}
                icon={<Trash2 />}
                details={[
                  { label: "Takes", value: "Take 2, Take 3, Take 5" },
                  { label: "Footage", value: <><Timecode value={151} /> in all</> },
                  { label: "Kept", value: "Take 4, the one you edited" },
                ]}
                expiresIn={45}
                onApprove={() => wait(1200)}
                onEdit={() => {}}
              />
            </motion.div>
          )}
        </AgentSays>
      </DemoPanel></CtaRegion>
    </div>
  );
}

export const entry: DocEntry = {
  id: "approval-card",
  name: "ApprovalCard",
  layer: "Organisms",
  category: "Agent",
  order: 60,
  isNew: true,
  description: "The agent asks before it does something hard to undo: what it wants to do, how risky it is, and exactly what will change. A decision blurs the card away and the tray glides down to one resolved row with a check or cross that draws itself.",
  demo: () => <Demo />,
  usage: `import { ApprovalCard } from "@/ui/organisms/approval-card";
import { CtaRegion } from "@/ui/cta";

// One card per pending tool call. Return a promise to show the key working.
<ApprovalCard
  label="Step 2 · Audio"
  title="Replace the recording's audio with the cleaned track"
  description="Room hum removed and levels evened out"
  risk="medium"
  icon={<AudioLines />}
  details={[
    { label: "Track", value: "Microphone" },
    { label: "Length", value: <Timecode value={134} /> },
  ]}
  expiresIn={60}
  onApprove={({ always }) => agent.answer(callId, { approved: true, always })}
  onDeny={({ reason }) => agent.answer(callId, { approved: false, reason })}
/>

// Your own preview instead of rows: the takes that would go
<ApprovalCard title="Delete 3 unused takes" risk="high" icon={<Trash2 />} onApprove={remove}>
  <TakeList takes={unused} />
</ApprovalCard>`,
  source: src,
  sourcePath: "src/ui/organisms/approval-card/index.tsx",
  props: [
    { name: "tool", type: "string", description: "The tool asking. Words the keys: replace_audio gives Replace audio / Keep current; delete_takes with count 3 gives Delete 3 takes / Keep takes." },
    { name: "count", type: "number", description: "How many things it affects." },
    { name: "cta", type: "CtaProposal", description: "Labels the agent proposed. Shown when they pass the CTA checks; otherwise the label derived from context." },
    { name: "title", type: "string", description: "The action in the app's words. Also the card's accessible name." },
    { name: "description", type: "ReactNode", description: "One line of context under the title. Truncates." },
    { name: "risk", type: "\"low\" | \"medium\" | \"high\"", description: "A tag with a word and a three-cell gauge. Only high takes the rec tone. Leave out to hide it." },
    { name: "icon", type: "ReactNode = shield", description: "Icon in the 32px key tile." },
    { name: "details", type: "{ label, value }[]", description: "Label and value rows in the preview well. Put times in Timecode." },
    { name: "preview / children", type: "ReactNode", description: "Your own preview above the details, e.g. a list of takes." },
    { name: "status", type: "\"pending\" | \"approved\" | \"denied\"", description: "Controlled status. Back to \"pending\" starts a fresh request." },
    { name: "defaultStatus", type: "ApprovalStatus = \"pending\"", description: "Starting status when uncontrolled." },
    { name: "onApprove", type: "({ always }) => void | Promise", description: "Approve or ⌘↵. A promise shows the key working and locks the card; a rejection keeps it pending." },
    { name: "onDeny", type: "({ reason: \"user\" | \"timeout\" }) => void", description: "Deny, Escape, or the countdown running out." },
    { name: "onEdit", type: "() => void", description: "Shows an Edit key before Deny." },
    { name: "expiresIn", type: "number", description: "Seconds until the request denies itself. Shown as \"Expires in 0:42\" in the tray foot next to the keys; held while the card is pointed at or focused." },
    { name: "onExpire", type: "() => void", description: "The countdown ran out. Called right before onDeny({ reason: \"timeout\" })." },
    { name: "allowAlways", type: "boolean = true", description: "Show the \"Always allow this action\" checkbox." },
    { name: "alwaysLabel / approveLabel / denyLabel / editLabel", type: "string", description: "Labels. Defaults: \"Always allow this action\", \"Approve\", \"Deny\", \"Edit\"." },
    { name: "shortcuts", type: "boolean = true", description: "Show the ⌘↵ and Esc caps on the keys. The shortcuts work either way." },
    { name: "label", type: "ReactNode", description: "Small label in the tray head, e.g. \"Step 2 · Audio\"." },
  ],
  composedOf: ["Tray", "Fold", "Key", "Kbd", "Tag", "Cell", "Timecode", "Checkbox (local)"],
  whenToUse: [
    "The agent is about to do something hard to take back: replace audio, delete takes, overwrite an export, post to Slack.",
    "One card per pending tool call, inline in the agent thread under the message that asked.",
    "Requests that should lapse on their own when nobody answers: pass expiresIn.",
  ],
  whenNot: [
    "A standing right the agent wants (read the mic track, write to a folder) that you may grant for a while: use PermissionRequest.",
    "Deciding up front what the agent may do without asking: use AutonomyDial.",
    "Reversible edits like a zoom or a speed change: just apply them and list them in AgentLedger with Undo.",
    "Destructive actions the person started themselves: a plain confirm fits better.",
  ],
  keyboard: [
    ["⌘ ↵", "Approves while focus is anywhere in the card (Ctrl ↵ on Windows and Linux)."],
    ["Esc", "Denies while focus is in the card."],
    ["Tab", "Moves through Always allow, Edit, Deny and Approve."],
    ["Space", "Ticks or clears Always allow when it has focus."],
  ],
  a11y: [
    "role=\"group\" named by the title and described by the description and the countdown.",
    "Approve and Deny are real buttons with aria-keyshortcuts; the key caps are aria-hidden.",
    "The countdown is described in full (\"Expires in 42 seconds unless you approve or deny it\"); the visible clock is aria-hidden so it isn't read every second.",
    "While an approval is working the card is aria-busy and the Approve key stays focusable.",
    "The decision is announced politely (\"Approved: Replace the recording's audio…\") and focus moves to the resolved row if it was in the card.",
    "Always allow is a native checkbox under its well, so labels and Space behave as expected.",
  ],
  motion: [
    "Approve with a promise: rays take the check's place, the ⌘↵ cap glides shut so the key narrows instead of jumping, and a band of light sweeps the label until it settles.",
    "A decision blurs the card and its tray foot out over 160ms while the tray glides down to the resolved row on the fold curve (380ms).",
    "The resolved row rises out of a 2px blur; its check (success) or cross (secondary) scales in and draws itself.",
    "The countdown ticks once a second with no motion; in the last ten seconds it turns foreground and its words swap for an Expiring tag with a blur.",
    "Always allow: a face cell pops into the well and its tick draws; the box presses in to .92.",
    "Reduced motion: the card switches to the resolved row at once with no blur or draw; the working rays and the label sweep stand still.",
  ],
  details: {
    limit: "One card per pending call. Risk has three levels; only high takes the rec tone.",
    variants: [
      { name: "Low risk", when: "Easy to redo by hand: re-rendering a preview, regenerating captions." },
      { name: "Medium risk", when: "Changes the recording or the project in a way that takes work to put back: replacing audio, cutting footage." },
      { name: "High risk", when: "Gone for good or leaves the app: deleting takes, overwriting an export, posting to Slack." },
    ],
    states: [
      {
        name: "Pending",
        note: "Always allow at the foot of the card; the countdown, Deny and Approve on the tray.",
        render: () => <ApprovalCard title="Overwrite Projects-demo.mp4" description="The export in ~/Movies/Spontaneous" risk="high" expiresIn={42} details={[{ label: "File", value: "Projects-demo.mp4" }, { label: "Length", value: <Timecode value={134} /> }]} />,
      },
      { name: "Approved", note: "Folded to one row in the tray.", render: () => <ApprovalCard title="Replace the recording's audio with the cleaned track" defaultStatus="approved" /> },
      { name: "Denied", note: "Same row with a cross; \"Expired\" when the countdown ran out.", render: () => <ApprovalCard title="Delete 3 unused takes" defaultStatus="denied" /> },
    ],
  },
};
