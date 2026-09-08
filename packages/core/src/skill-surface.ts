/**
 * Where a taught skill runs.
 *
 * - `computer` — the bot's sandbox computer (the only surface today).
 * - `browser`  — a real, logged-in browser on the user's machine. The driver for this
 *   arrives in a later phase; until then a browser skill degrades to its written playbook.
 */
export type SkillSurface = "computer" | "browser";

export const SKILL_SURFACES: readonly SkillSurface[] = ["computer", "browser"];

/** Narrow a stored or loosely typed value to a known surface (defaults to the sandbox computer). */
export function skillSurface(value: string | null | undefined): SkillSurface {
  return value === "browser" ? "browser" : "computer";
}

/**
 * Appended to a skill run prompt when the skill was recorded in the browser but this
 * deployment has no browser driver to replay it. The run still proceeds from the written
 * playbook; the model is told not to expect a step-for-step match with the recording.
 */
export function browserSurfaceUnavailableNote(): string {
  return [
    "This skill was recorded in a browser, but no browser is available on this deployment.",
    "Follow the written playbook instead of the recording, and verify each step yourself.",
  ].join(" ");
}
