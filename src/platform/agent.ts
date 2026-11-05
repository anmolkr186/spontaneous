import { Channel } from "@tauri-apps/api/core";
import { call } from "./tauri";

/** What the app knows about the user's own Claude Code CLI. It never holds a credential. */
export interface AgentStatus {
  installed: boolean;
  version: string | null;
  loggedIn: boolean;
  subscription: string | null;
}

/** One stream-json event from the CLI, or the `agent_exit` event the host adds when it ends. */
export type AgentEvent = { type: string; [key: string]: unknown };

/** Each is left to the CLI's default when null. `resume` continues an earlier conversation. */
export interface AgentSessionOptions {
  resume: string | null;
  model: string | null;
  effort: string | null;
}

export const agent = {
  status: () => call<AgentStatus>("agent_status"),
  /** Opens Anthropic's sign-in page through the CLI. Resolves when the CLI finishes. */
  login: () => call<void>("agent_login"),
  /** Starts a session whose events arrive in batches. */
  connect: (options: AgentSessionOptions, onEvents: (events: AgentEvent[]) => void) => {
    const onEvent = new Channel<AgentEvent[]>();
    onEvent.onmessage = onEvents;
    return call<void>("agent_connect", { options, onEvent });
  },
  send: (text: string) => call<void>("agent_send", { text }),
  stop: () => call<void>("agent_stop"),
};
