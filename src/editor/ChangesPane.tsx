/**
 * The Changes tab: everything the agent changed in the project, each with Undo
 * (the Agent ledger), and the versions it left behind, any of which you can
 * rewind to (Agent checkpoints).
 */
import { AgentCheckpoints } from "@/ui/organisms/agent-checkpoints";
import { AgentLedger } from "@/ui/organisms/agent-ledger";
import { toast } from "@/ui/organisms/toaster";
import { useChanges } from "./changes";
import styles from "./editor.module.css";

export function ChangesPane() {
  const ledger = useChanges((s) => s.ledger);
  const undone = useChanges((s) => s.undone);
  const checkpoints = useChanges((s) => s.checkpoints);
  const head = useChanges((s) => s.head);
  const { undo, redo, rewind } = useChanges.getState();

  if (!ledger.length && !checkpoints.length) {
    return <p className={styles.emptyNotes}>When the agent applies a plan or a suggestion, every change shows here with Undo, and each run leaves a version you can go back to.</p>;
  }

  const back = (id: string) => {
    const from = useChanges.getState().head;
    const to = checkpoints.find((c) => c.id === id);
    rewind(id);
    toast(`Back to “${to?.title ?? "an earlier version"}”`, from ? { action: { label: "Undo", onClick: () => rewind(from) } } : undefined);
  };

  return (
    <div className={styles.changes}>
      {ledger.length > 0 && (
        <AgentLedger title="Changes" agent="Claude Code" entries={ledger} undone={undone} onUndo={undo} onRedo={redo} />
      )}
      {checkpoints.length > 0 && (
        <AgentCheckpoints title="Versions" task="This session" checkpoints={checkpoints} head={head ?? undefined} onRewind={(c) => back(c.id)} />
      )}
    </div>
  );
}
