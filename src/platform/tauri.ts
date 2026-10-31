import { invoke } from "@tauri-apps/api/core";

/** True inside the Tauri webview; false in a plain browser (docs site, tests). */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Invoke a Rust command, or resolve to `fallback` when running in a browser. */
export async function call<T>(command: string, args?: Record<string, unknown>, fallback?: T): Promise<T | undefined> {
  if (!isTauri) return fallback;
  return invoke<T>(command, args);
}
