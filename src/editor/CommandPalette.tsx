/**
 * ⌘K over the editor: the Command menu in a dialog, with only commands that
 * really work here. Anything typed that matches nothing goes to the agent.
 */
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { History, MessageSquare, Play, Redo2, StickyNote, Undo2, ZoomIn, LayoutPanelLeft } from "lucide-react";
import { Mark } from "@/ui/atoms";
import { CommandMenu } from "@/ui/organisms/command-menu";
import type { CommandGroup } from "@/ui/organisms/command-menu";
import { notesLabel } from "@/ui/cta";
import { isTauri } from "@/platform/tauri";
import { useAgent } from "./agent";
import { formatTime } from "./model";
import { useEditor } from "./store";
import styles from "./editor.module.css";

function useGroups(): CommandGroup[] {
  const notes = useEditor((s) => s.project.notes);
  const open = notes.filter((n) => n.status === "open");
  const mode = useEditor((s) => s.mode);
  const planNotes = isTauri ? (open.length === 1 ? "Plan the open note" : `Plan ${open.length} open notes`) : notesLabel(open);
  return [
    {
      id: "suggestions",
      label: "Suggestions",
      commands: [
        ...(open.length ? [{ id: "apply-notes", label: planNotes, icon: <StickyNote />, keywords: ["notes", "apply", "plan"] }] : []),
        { id: "zoom-here", label: "Add a zoom at the playhead", icon: <ZoomIn />, keywords: ["zoom", "push in"] },
        { id: "demo", label: "Play a demo run", icon: <Play />, keywords: ["demo", "tour", "agent"] },
        { id: "ask", label: "Ask the agent…", icon: <Mark size={14} title="" />, keywords: ["claude", "agent"] },
      ],
    },
    {
      id: "edit",
      label: "Edit",
      commands: [
        { id: "undo", label: "Undo", icon: <Undo2 />, keys: ["⌘", "Z"] },
        { id: "redo", label: "Redo", icon: <Redo2 />, keys: ["⇧", "⌘", "Z"] },
      ],
    },
    {
      id: "go",
      label: "Go to",
      commands: [
        { id: "side-agent", label: "Agent", icon: <MessageSquare /> },
        { id: "side-notes", label: "Notes", icon: <StickyNote /> },
        { id: "side-changes", label: "Changes", icon: <History /> },
        { id: "mode", label: mode === "lite" ? "Switch to Studio" : "Switch to Lite", icon: <LayoutPanelLeft /> },
      ],
    },
  ];
}

/** Runs a command. Returns the sentence shown in the menu's footer. */
function run(id: string, query?: string): string | void {
  const editor = useEditor.getState();
  const agent = useAgent.getState();
  const show = (side: "agent" | "notes" | "changes") => { if (!editor.panels.right) editor.togglePanel("right"); editor.setSide(side); };
  switch (id) {
    case "apply-notes": agent.applyNotes(); show("agent"); return "Sent your open notes to the agent";
    case "zoom-here": {
      const t = editor.time;
      editor.addZoom({ start: Math.max(0, t - 0.8), end: Math.min(editor.project.duration, t + 3.2), scale: 1.6, target: { x: 0.5, y: 0.5 }, author: "user" });
      return `Added a zoom at ${formatTime(t)}`;
    }
    case "demo": agent.playDemo(); show("agent"); return "Playing a demo run";
    case "ask": if (query?.trim()) { agent.send(query.trim()); show("agent"); return "Asked the agent"; } show("agent"); return;
    case "undo": editor.undo(); return "Undone";
    case "redo": editor.redo(); return "Redone";
    case "side-agent": show("agent"); return;
    case "side-notes": show("notes"); return;
    case "side-changes": show("changes"); return;
    case "mode": editor.setMode(editor.mode === "lite" ? "studio" : "lite"); return;
  }
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const groups = useGroups();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.paletteOverlay} />
        <Dialog.Content className={styles.palette} aria-describedby={undefined}>
          <Dialog.Title className="visually-hidden">Commands</Dialog.Title>
          <CommandMenu groups={groups} autoFocus onClose={() => setOpen(false)}
            onRun={(id, query) => {
              const said = run(id, query);
              // A beat so the run's check and sentence show before the menu closes.
              window.setTimeout(() => setOpen(false), 420);
              return said;
            }} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
