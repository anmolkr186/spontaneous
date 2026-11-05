import { useEffect } from "react";
import { Link, Scissors, Upload } from "lucide-react";
import { Key } from "@/ui/atoms";
import { Toaster, toast } from "@/ui/organisms/toaster";
import src from "@/ui/organisms/toaster/index.tsx?raw";
import { useScript } from "../demo";
import type { DocEntry } from "../registry";

/** The preview's own stack, so its toasts never show in another Toaster. */
const STACK = "docs-preview";
const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

const send = {
  exportVideo: () => toast.promise(wait(2600), {
    loading: { title: "Exporting 1080p…", description: "Projects-demo.mp4" },
    success: { title: "Exported Projects-demo.mp4", description: "1:32 · 84 MB", action: { label: "Show in Finder", onClick: () => {} } },
    error: "Couldn't export Projects-demo.mp4",
  }, { toaster: STACK }),
  copied: () => toast.success("Copied link", { toaster: STACK }),
  renderFailed: () => {
    const id: string = toast.error("Couldn't render frame 0:42", {
      toaster: STACK,
      description: "The zoom ends after the clip does.",
      duration: 8000,
      action: {
        label: "Retry",
        // Keep the toast and turn it into the retry, in place.
        onClick: (e) => {
          e.preventDefault();
          void toast.promise(wait(1600), { loading: "Rendering frame 0:42…", success: "Rendered frame 0:42", error: "Couldn't render frame 0:42" }, { id, toaster: STACK });
        },
      },
    });
  },
  deleted: () => toast("Deleted 3 takes", { toaster: STACK, action: { label: "Undo", onClick: () => toast.success("Restored 3 takes", { toaster: STACK }) } }),
};

function Demo() {
  useEffect(() => { toast.dismiss(); return () => toast.dismiss(); }, []);
  const root = useScript([
    { at: 500, run: send.exportVideo },
    { at: 1700, run: send.copied },
    { at: 4300, run: send.renderFailed },
    { at: 6200, run: send.deleted },
  ]);
  return (
    <div ref={root} style={{ position: "relative", width: "100%", height: 360 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Key size="sm" onClick={send.exportVideo}><Upload />Export</Key>
        <Key size="sm" onClick={send.copied}><Link />Copy link</Key>
        <Key size="sm" onClick={send.renderFailed}>Render frame</Key>
        <Key size="sm" onClick={send.deleted}><Scissors />Delete takes</Key>
      </div>
      <Toaster inline id={STACK} duration={6000} />
    </div>
  );
}

export const entry: DocEntry = {
  id: "toaster",
  name: "Toaster",
  layer: "Organisms",
  category: "Feedback",
  order: 10,
  isNew: true,
  description: "Short confirmations from anywhere: call toast() and one Toaster draws a stack in the corner. Exports and renders go through toast.promise, which turns rays into a drawn check or cross while the text crossfades in place.",
  demo: () => <Demo />,
  usage: `import { Toaster, toast } from "@/ui/organisms/toaster";

// Once, at the root of the editor window
<Toaster position="bottom-right" />

// Anywhere
toast.success("Copied link");
toast("Deleted 3 takes", { action: { label: "Undo", onClick: restoreTakes } });
toast.error("Couldn't render frame 0:42", { action: { label: "Retry", onClick: rerender } });

toast.promise(exportVideo(project), {
  loading: "Exporting 1080p…",
  success: (file) => ({ title: \`Exported \${file.name}\`, action: { label: "Show in Finder", onClick: () => reveal(file) } }),
  error: "Couldn't export",
});`,
  source: src,
  sourcePath: "src/ui/organisms/toaster/index.tsx",
  props: [
    { name: "position", type: "\"top-left\" | \"top-center\" | \"top-right\" | \"bottom-left\" | \"bottom-center\" | \"bottom-right\"", description: "Corner or edge the stack sits in; new toasts come in from that edge. Default bottom-right." },
    { name: "inline", type: "boolean", description: "Position inside the nearest positioned ancestor instead of the window." },
    { name: "id", type: "string", description: "Shows only toasts sent with { toaster: id }, for a second, separate stack." },
    { name: "duration", type: "number = 4000", description: "Default ms on screen. Each toast can override it; Infinity keeps it open." },
    { name: "visibleToasts", type: "number = 3", description: "Toasts shown at once. Older ones wait, timers paused, until there's room." },
    { name: "expand", type: "boolean", description: "Keep the stack fanned out instead of only on hover and focus." },
    { name: "offset", type: "number", description: "Distance from the edges in px. Default 24, 20 inline." },
    { name: "gap", type: "number = 10", description: "Space between toasts when fanned out." },
    { name: "hotkey", type: "string | null = \"F8\"", description: "Key that focuses the newest toast. null turns it off." },
    { name: "hairline", type: "boolean = true", description: "A 1px line along the bottom that runs down with the timer and stops while held." },
    { name: "closeButton", type: "boolean = true", description: "A close key on hover and focus; always shown on touch screens." },
    { name: "label", type: "string = \"Notifications\"", description: "Names the region; the hotkey is added (\"Notifications (F8)\")." },
    { name: "toast(title, options?)", type: "(ReactNode, ToastOptions) => ToastId", description: "A plain toast. Also toast.success, toast.error, toast.info and toast.loading. Times in string titles (\"0:42\") are set in the time face." },
    { name: "toast.promise(work, messages, options?)", type: "(Promise<T> | () => Promise<T>, { loading, success, error }) => Promise<T>", description: "A loading toast that turns into success or error. Each message is a title, { title, description, action } or a function of the result." },
    { name: "toast.dismiss(id?)", type: "(ToastId?) => void", description: "Closes one toast, or all of them without an id." },
    { name: "ToastOptions", type: "{ id?, description?, action?, duration?, toaster?, onDismiss? }", description: "Pass an existing id to update that toast in place. action.onClick closes the toast unless it calls event.preventDefault()." },
  ],
  composedOf: ["Dock material", "StatusGlyph", "Swap", "Key", "IconKey"],
  whenToUse: [
    "Confirming an action in a few words: Copied link, Deleted 3 takes (with Undo), Saved.",
    "Work people started and want to hear back from: exports, renders, imports finishing in the background (toast.promise).",
    "Errors that don't block editing and can be retried later: a frame that didn't render, a sync that failed.",
  ],
  whenNot: [
    "Anything the person must read or decide on. Ask in an AskCard or a dialog.",
    "What the agent did to the project. That belongs in the AgentThread, where each edit has its Undo.",
    "Long-running progress with detail, like importing files. Use the Dropzone rows or a progress panel.",
  ],
  keyboard: [
    ["F8", "Moves focus to the newest toast and fans the stack out."],
    ["Tab", "Goes from toast to toast, through their action and close keys."],
    ["Esc", "Closes the focused toast and moves focus to the next one; after the last, focus returns where it was."],
  ],
  a11y: [
    "The stack is a labelled region (\"Notifications (F8)\"); every toast is focusable.",
    "New and updated toasts are read out once in a polite status region; errors go to an alert region so they come first.",
    "Timers pause while the pointer or keyboard focus is in the stack and while the window is hidden, so nothing vanishes mid-read.",
    "Swiping is never the only way out: there is Esc and a named close key. Toasts waiting for room are inert.",
    "Icons are decorative; color is limited to the success and error marks, and the words say what happened.",
  ],
  motion: [
    "New toasts lift in from the edge out of a 2px blur on a no-bounce spring (400ms); the ones behind step back, shrink 5% each and peek out 9px.",
    "Pointing at the stack or focusing it fans it out into a list: every toast is measured, and positions and heights glide on the same spring.",
    "Promise toasts: the rays shrink away as a ring pops in and a check or cross draws itself; the text crossfades through a blur and the slab glides to its new height.",
    "Closing fades the toast and sinks it 6px in 180ms while the rest move up. A swipe past 64px (or a flick) throws it out that way; shorter swipes rubber-band back.",
    "A 1px hairline runs down with the timer and stops while the stack is held.",
    "Reduced motion: toasts appear, move and leave without travel or blur, and the hairline is hidden.",
  ],
};
