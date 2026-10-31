import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/ui/tokens/tokens.css";
import { DocsApp } from "./DocsApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DocsApp />
  </StrictMode>,
);
