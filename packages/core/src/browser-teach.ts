import type { BrowserTeachAction, TeachRecordingEvent } from "./teach-playbook.js";
import { redactSensitiveText } from "./teach-playbook.js";

/** The action a user took in the browser teach pane. */
export interface BrowserTeachInput {
  kind: BrowserTeachAction;
  ref?: string;
  text?: string;
  url?: string;
  values?: string[];
  submit?: boolean;
  /** For `checkpoint`: what the user says should be true here. */
  expect?: string;
}

/** Element / page facts the api resolves around the action (picked element, page after). */
export interface BrowserTeachContext {
  role?: string;
  name?: string;
  /** URL after the action landed. */
  url: string;
  /** Snapshot hash after the action. */
  hash: string;
}

/** Build the `kind: "browser"` recording event for one taught browser step. */
export function browserTeachEvent(
  input: BrowserTeachInput,
  context: BrowserTeachContext,
): TeachRecordingEvent {
  const base: TeachRecordingEvent = {
    at: new Date().toISOString(),
    kind: "browser",
    action: input.kind,
    url: context.url,
    hash: context.hash,
  };
  if (input.ref) base.ref = input.ref;
  if (context.role) base.role = context.role;
  if (context.name) base.name = context.name;
  if (input.kind === "type") {
    base.text = redactSensitiveText(input.text ?? "");
    if (input.submit) base.submit = true;
  }
  if (input.kind === "select" && input.values) base.values = [...input.values];
  if (input.kind === "checkpoint" && input.expect) base.summary = input.expect.trim();
  return base;
}
