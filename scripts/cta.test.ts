/** Labels, checks and the election for calls to action. Run: npm run test:cta */
import { test } from "node:test";
import assert from "node:assert/strict";
import { answerLabel, approvalLabels, diffLabel, exportLabel, notesLabel, permissionLabel, planLabel, shotLabel } from "../src/ui/cta/derive.ts";
import { checkLabel, resolveLabel } from "../src/ui/cta/validate.ts";
import { elect } from "../src/ui/cta/elect.ts";
import type { Candidate } from "../src/ui/cta/elect.ts";
import { CTA_EXAMPLES } from "../src/ui/agent-ui/catalog.ts";
import type { CtaIntent } from "../src/ui/cta/types.ts";

test("derived labels name what happens", () => {
  assert.equal(notesLabel([{ at: 12.4, intents: ["zoom"] }]), "Apply zoom at 0:12");
  assert.equal(notesLabel([{ at: 42, intents: ["cut"] }]), "Cut at 0:42");
  assert.equal(notesLabel([{ at: 65, intents: ["callout"] }]), "Add callout at 1:05");
  assert.equal(notesLabel([{ at: 12, intents: ["zoom", "speed"] }]), "Apply note at 0:12");
  assert.equal(notesLabel([{ at: 1, intents: ["zoom"] }, { at: 9, intents: ["zoom"] }, { at: 30, intents: ["zoom"] }]), "Apply 3 zooms");
  assert.equal(notesLabel([{ at: 1, intents: ["zoom"] }, { at: 9, intents: ["cut"] }]), "Apply 2 notes");
  assert.equal(planLabel("draft", 5), "Run 5 edits");
  assert.equal(planLabel("draft", 1), "Run 1 edit");
  assert.equal(planLabel("done", 5), "Run again");
  assert.equal(planLabel("failed", 5, 2), "Retry from step 3");
  assert.deepEqual(approvalLabels("mcp__spontaneous__replace_audio"), { approve: "Replace audio", deny: "Keep current" });
  assert.deepEqual(approvalLabels("delete_takes", 3), { approve: "Delete 3 takes", deny: "Keep takes" });
  assert.deepEqual(approvalLabels("unknown_tool"), { approve: "Approve", deny: "Deny" });
  assert.equal(permissionLabel("once"), "Allow once");
  assert.equal(permissionLabel("timed"), "Allow for an hour");
  assert.equal(permissionLabel("timed", 30), "Allow for 30 min");
  assert.equal(permissionLabel("always"), "Always allow");
  assert.equal(diffLabel(4), "Accept 4 changes");
  assert.equal(diffLabel(1), "Accept change");
  assert.equal(answerLabel(3), "Apply as 3 edits");
  assert.equal(shotLabel("Lid Rise"), "Use Lid Rise");
  assert.equal(exportLabel(), "Export 1080p");
});

test("every derived label passes its own checks", () => {
  const cases: [string, Parameters<typeof checkLabel>[1]][] = [
    ["Apply zoom at 0:12", { intent: "run" }], ["Apply 3 zooms", { intent: "run", count: 3 }], ["Run 5 edits", { intent: "run", count: 5 }],
    ["Retry from step 3", { intent: "run" }], ["Replace audio", { intent: "decide", risk: "risky" }], ["Delete 3 takes", { intent: "decide", risk: "destructive", count: 3 }],
    ["Allow for an hour", { intent: "decide" }], ["Always allow", { intent: "decide" }], ["Accept 4 changes", { intent: "review", count: 4 }],
    ["Apply as 3 edits", { intent: "apply", count: 3 }], ["Use Lid Rise", { intent: "apply" }], ["Export 1080p", { intent: "finish" }], ["Keep current", { intent: "dismiss" }],
  ];
  for (const [label, ctx] of cases) assert.deepEqual(checkLabel(label, ctx), { ok: true, label }, label);
});

test("agent labels are checked", () => {
  const reject = (label: string, ctx: Parameters<typeof checkLabel>[1]) => assert.equal(checkLabel(label, ctx).ok, false, label);
  reject("Confirm", { intent: "decide" });
  reject("OK", { intent: "decide" });
  reject("Apply", { intent: "run" });
  reject("Apply 5 notes", { intent: "run", count: 3 });
  reject("Delete!", { intent: "decide", risk: "destructive" });
  reject("Delete", { intent: "decide", risk: "destructive" });
  reject("Apply all of the open notes now", { intent: "run" });
  reject("apply 3 notes", { intent: "run", count: 3 });
  reject("Export 1080p", { intent: "run" });
  reject("Looks good 🎉", { intent: "review" });
  reject("Tightening the intro…", { intent: "run" });
  assert.deepEqual(resolveLabel("Tighten the intro", "Run 4 edits", { intent: "run", count: 4 }), { label: "Tighten the intro", source: "agent" });
  assert.deepEqual(resolveLabel("Confirm", "Replace audio", { intent: "decide" }), { label: "Replace audio", source: "derived", rejected: "Doesn't say what happens" });
  assert.deepEqual(resolveLabel(undefined, "Run 4 edits", { intent: "run" }), { label: "Run 4 edits", source: "derived" });
});

test("stacked asks are answered in order", () => {
  const c = (id: string, region: string, intent: Candidate["intent"], seq: number, enabled = true): Candidate => ({ id, region, intent, seq, enabled });
  assert.deepEqual([...elect([c("replace", "panel", "decide", 1), c("delete", "panel", "decide", 2)])], ["replace"]);
  assert.deepEqual([...elect([c("delete", "panel", "decide", 2)])], ["delete"]);
  assert.deepEqual([...elect([c("plan", "panel", "run", 1), c("replace", "panel", "decide", 3), c("delete", "panel", "decide", 4)])], ["replace"]);
});

test("one primary per region, by intent, newest on a tie", () => {
  const c = (id: string, region: string, intent: Candidate["intent"], seq: number, enabled = true): Candidate => ({ id, region, intent, seq, enabled });
  assert.deepEqual([...elect([c("send", "panel", "run", 1), c("approve", "panel", "decide", 2)])], ["approve"]);
  assert.deepEqual([...elect([c("plan", "panel", "run", 1), c("send", "panel", "run", 2)])], ["send"]);
  assert.deepEqual([...elect([c("apply", "notes", "run", 1, false), c("deny", "notes", "dismiss", 2)])], []);
  const both = elect([c("apply", "notes", "run", 1), c("send", "panel", "run", 2)]);
  assert.ok(both.has("apply") && both.has("send"));
});

test("export waits for the work", () => {
  const c = (id: string, region: string, intent: Candidate["intent"], seq: number, enabled = true): Candidate => ({ id, region, intent, seq, enabled });
  assert.ok(!elect([c("export", "titlebar", "finish", 1), c("apply", "notes", "run", 2)]).has("export"));
  assert.ok(!elect([c("export", "titlebar", "finish", 1), c("approve", "panel", "decide", 2)]).has("export"));
  assert.ok(elect([c("export", "titlebar", "finish", 1), c("apply", "notes", "run", 2, false)]).has("export"));
  assert.ok(elect([c("export", "titlebar", "finish", 1), c("accept", "panel", "review", 2)]).has("export"));
});

test("the examples agents are given hold up", () => {
  for (const [intent, good, bad] of CTA_EXAMPLES) {
    for (const label of good.split(" · ")) assert.equal(checkLabel(label, { intent: intent as CtaIntent }).ok, true, `${intent}: ${label}`);
    for (const label of bad.split(" · ")) assert.equal(checkLabel(label, { intent: intent as CtaIntent }).ok, false, `${intent}: ${label}`);
  }
  for (const [label, intent] of [["Tighten the walkthrough", "run"], ["Replace audio", "decide"], ["Allow saving here", "decide"], ["Keep the shorter one", "review"], ["Use Lid Rise first", "apply"], ["Apply as 2 edits", "apply"]] as const) {
    assert.equal(checkLabel(label, { intent }).ok, true, label);
  }
});
