/**
 * The single seam between the agent thread and its chat runtime. Components in
 * this folder import primitives from here, never from the package directly, so
 * the runtime can be swapped without touching the thread's components.
 */
export {
  AssistantRuntimeProvider as AgentRuntimeProvider,
  AuiIf as When,
  ComposerPrimitive as Composer,
  MessagePrimitive as Message,
  ThreadPrimitive as Thread,
  useAuiState as useThreadState,
  useExternalStoreRuntime as useAgentStoreRuntime,
} from "@assistant-ui/react";
export type {
  AppendMessage,
  ReasoningMessagePartComponent,
  TextMessagePartComponent,
  ThreadMessageLike as AgentMessage,
  ToolCallMessagePartComponent,
  ToolCallMessagePartProps,
} from "@assistant-ui/react";
