import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/ui/tokens/tokens.css";
import { trackInputModality } from "@/ui/tokens/input-modality";
import { Editor } from "@/editor/Editor";
import { isTauri } from "@/platform/tauri";

// The desktop window draws traffic lights over the top-left of the page.
if (isTauri) document.documentElement.dataset.native = "";

trackInputModality();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Editor />
  </StrictMode>,
);

// Fade the boot splash two frames after first paint (the Monocode trick).
requestAnimationFrame(() => requestAnimationFrame(() => {
  const boot = document.getElementById("boot");
  if (!boot) return;
  boot.dataset.done = "";
  setTimeout(() => boot.remove(), 300);
}));
