import { useState } from "react";
import { Captions, FileText, FileVideo, FolderOpen, Image, Mic } from "lucide-react";
import { PermissionRequest } from "@/ui/organisms/permission-request";
import type { PermissionScope } from "@/ui/organisms/permission-request";
import src from "@/ui/organisms/permission-request/index.tsx?raw";
import { AgentSays, DemoPanel, UserSays, useScript } from "../demo";
import type { DocEntry } from "../registry";

const FILES = [
  { id: "mp4", label: "Projects-demo.mp4", meta: "182 MB", icon: <FileVideo /> },
  { id: "srt", label: "Projects-demo.srt", meta: "4 KB", icon: <Captions /> },
  { id: "png", label: "Projects-demo-poster.png", meta: "1.2 MB", icon: <Image /> },
  { id: "txt", label: "Projects-demo-chapters.txt", meta: "1 KB", icon: <FileText /> },
];

function Demo() {
  const [scope, setScope] = useState<PermissionScope>("once");
  const root = useScript([
    { at: 2400, run: () => setScope("timed") },
    { at: 4600, run: () => root.current?.querySelector<HTMLButtonElement>("[data-action='allow']")?.click() },
  ]);
  return (
    <div ref={root}>
      <DemoPanel>
        <UserSays>Export the Projects demo and put it in my Movies folder.</UserSays>
        <AgentSays status="Needs you">
          <PermissionRequest
            action="write to ~/Movies/Spontaneous"
            target="Files · ~/Movies/Spontaneous"
            toolIcon={<FolderOpen />}
            risk="risky"
            reason="The export is ready. I'll write the video, its captions and a poster frame there. Nothing already in the folder gets replaced."
            preview={FILES}
            scope={scope}
            onScopeChange={setScope}
          />
        </AgentSays>
      </DemoPanel>
    </div>
  );
}

export const entry: DocEntry = {
  id: "permission-request",
  name: "PermissionRequest",
  layer: "Organisms",
  category: "Agent",
  order: 70,
  isNew: true,
  description: "The agent asks for one specific right: who wants it, why in its own words, and exactly what will happen. You allow it once, for an hour or always, and the card folds to one line with the time left and Revoke.",
  demo: () => <Demo />,
  usage: `import { PermissionRequest } from "@/ui/organisms/permission-request";

<PermissionRequest
  action="read your microphone track"
  target="Projects demo · Microphone"
  toolIcon={<Mic />}
  risk="safe"
  reason="I need the raw track to find the pauses between sentences. I won't change it."
  preview={[{ id: "mic", label: "Microphone.wav", meta: "84 MB", icon: <AudioLines /> }]}
  onDecisionChange={(d) => agent.grant("read_audio", d)}
/>

// Destructive: Allow becomes a danger key and Always is left out
<PermissionRequest
  action="overwrite Projects-demo.mp4"
  target="Files · ~/Movies/Spontaneous"
  toolIcon={<FileVideo />}
  risk="destructive"
  reason="You asked for a shorter cut under the same name."
  scopes={["once"]}
  onDecisionChange={answer}
/>`,
  source: src,
  sourcePath: "src/ui/organisms/permission-request/index.tsx",
  props: [
    { name: "cta", type: "CtaProposal", description: "Labels the agent proposed. Shown when they pass the CTA checks; otherwise the label derived from context." },
    { name: "agent", type: "{ name, model?, avatar? } = Claude Code", description: "Who asks. The avatar defaults to the app's mark." },
    { name: "action", type: "string", description: "What it wants to do, read after \"wants to\": \"write to ~/Movies/Spontaneous\"." },
    { name: "target", type: "string", description: "Where, shown under the title with toolIcon." },
    { name: "toolIcon", type: "ReactNode", description: "The tool's icon next to the target." },
    { name: "risk", type: "\"safe\" | \"risky\" | \"destructive\" = \"risky\"", description: "Risky and destructive carry a tag; destructive also turns Allow into a danger key and leaves out Always." },
    { name: "reason", type: "string", description: "The agent's own words on why it needs this. Shown on a rule, like quoted reasoning." },
    { name: "preview", type: "{ id, label, meta?, icon? }[]", description: "Exactly what will happen: files, tracks, recipients. meta sits on the right (\"182 MB\")." },
    { name: "previewTitle", type: "string = \"What will happen\"", description: "Heading of the preview." },
    { name: "previewLimit", type: "number = 3", description: "Rows shown before \"+N more\"." },
    { name: "scopes", type: "(\"once\" | \"timed\" | \"always\")[]", description: "The choices of how long. One choice hides the switcher." },
    { name: "scope / defaultScope / onScopeChange", type: "PermissionScope = \"once\"", description: "Controlled or uncontrolled choice of how long." },
    { name: "duration", type: "number = 60", description: "Minutes a timed grant holds. Labels follow: \"For an hour\", \"For 30 minutes\"." },
    { name: "decision / defaultDecision", type: "{ allow, scope, at, until? } | null", description: "Controlled or uncontrolled decision; null while it waits." },
    { name: "onDecisionChange", type: "(decision | null) => void", description: "Allow, Deny, and null for Revoke, Change or Ask again." },
    { name: "now", type: "number", description: "The clock for the time left, epoch ms. Without it the line ticks every second while a timed grant runs." },
  ],
  composedOf: ["Tray", "Fold", "Mark", "Tag", "Switcher", "Key", "Kbd", "RollText"],
  whenToUse: [
    "The agent hits something it isn't allowed to do yet and asks for that one right: read the mic track, write to a folder, use screen recording, post to Slack.",
    "Granting a right for a while instead of forever: once, for an hour, or always.",
    "Anywhere people should see the files, tracks or recipients before they say yes.",
  ],
  whenNot: [
    "Approving one specific edit before it runs (replace this audio, delete these takes): use ApprovalCard.",
    "Deciding in general how much the agent may do on its own: use AutonomyDial.",
    "The macOS permission prompt itself (screen recording, microphone): that is the system's dialog; this card only explains why the agent wants it.",
  ],
  keyboard: [
    ["↵", "Allows with the chosen scope while focus is in the card (other keys in the card press themselves)."],
    ["Esc", "Denies."],
    ["← →", "Picks how long."],
    ["Tab", "Moves through the more toggle, the scope, Deny and Allow."],
  ],
  a11y: [
    "While it waits the card is a dialog labelled by its sentence (\"Claude Code wants to write to ~/Movies/Spontaneous\") and described by the reason.",
    "How long is a radio group; the Allow key names the choice (\"Allow for an hour\").",
    "The preview is a labelled section; \"+1 more\" is a button with aria-expanded.",
    "The decided line is a status, so it is read once (\"Allowed for an hour\", \"Denied\"); focus moves to it if it was in the card.",
  ],
  motion: [
    "The preview rows rise out of a 2px blur a beat (60ms) apart; \"+N more\" folds the rest open and they rise the same way.",
    "Changing how long rolls the Allow label to the new words while the key glides to its new width; the switcher's key glides between choices.",
    "A decision blurs the card out and the tray glides down to one line; the check or cross pops in on the one spring allowed to bounce, then draws itself.",
    "A timed grant's bar fills to its share, then drains on its own clock until it runs out; the time left ticks once a second in the time face.",
    "Reduced motion: everything switches at once; the bar steps once a second instead of draining.",
  ],
  details: {
    limit: "One right per card. Three risk levels; only destructive changes the Allow key.",
    variants: [
      { name: "Safe", when: "Reading something of yours without changing it: the mic track, the transcript. No tag." },
      { name: "Risky", when: "Writing outside the project or using a system right: a folder, screen recording, Slack. Neutral tag." },
      { name: "Destructive", when: "Replacing or deleting something you can't get back. Rec tag, danger key, no Always." },
    ],
    states: [
      {
        name: "Destructive",
        note: "Allow is a danger key; Always is gone.",
        render: () => <PermissionRequest action="overwrite Projects-demo.mp4" target="Files · ~/Movies/Spontaneous" toolIcon={<FileVideo />} risk="destructive" reason="You asked for a shorter cut under the same name." />,
      },
      {
        name: "Allowed for an hour",
        note: "Folded to one line with the time left and a draining bar.",
        render: () => <PermissionRequest action="read your microphone track" toolIcon={<Mic />} risk="safe" defaultDecision={{ allow: true, scope: "timed", at: Date.now() - 6 * 60000, until: Date.now() + 54 * 60000 }} />,
      },
      { name: "Denied", note: "A cross, and Change to answer again.", render: () => <PermissionRequest action="send the export to Slack" defaultDecision={{ allow: false, scope: "once", at: Date.now() }} /> },
    ],
  },
};
