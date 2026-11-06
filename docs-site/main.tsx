import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/ui/tokens/tokens.css";
import { trackInputModality } from "@/ui/tokens/input-modality";
import { DocsApp } from "./DocsApp";

trackInputModality();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DocsApp />
  </StrictMode>,
);
