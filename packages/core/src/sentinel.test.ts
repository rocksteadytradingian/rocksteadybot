import { describe, expect, it } from "vitest";
import { evaluateSentinel, parseWindowMs, type SentinelState } from "./sentinel.js";

const T0 = new Date("2026-09-07T12:00:00.000Z");
const at = (msFromT0: number) => new Date(T0.getTime() + msFromT0);
const state = (ok: boolean, value: string, sinceMs = 0): SentinelState => ({
  ok,
  value,
  since: at(sinceMs).toISOString(),
});

describe("evaluateSentinel — becomes-true", () => {
  it("fires on the rising edge only", () => {
    const first = evaluateSentinel({
      trigger: "becomes-true",
      observation: { ok: true, value: "red" },
      now: T0,
    });
    expect(first.fire).toBe(true);

    const stillTrue = evaluateSentinel({
      trigger: "becomes-true",
      previous: first.nextState,
      observation: { ok: true, value: "red" },
      now: at(1000),
    });
    expect(stillTrue.fire).toBe(false);

    const backTrue = evaluateSentinel({
      trigger: "becomes-true",
      previous: { ...first.nextState, ok: false },
      observation: { ok: true, value: "red" },
      now: at(2000),
    });
    expect(backTrue.fire).toBe(true);
  });
});

describe("evaluateSentinel — changes", () => {
  it("fires whenever the observed value differs, never on the first sample", () => {
    const first = evaluateSentinel({
      trigger: "changes",
      observation: { ok: true, value: "12 items" },
      now: T0,
    });
    expect(first.fire).toBe(false);

    const changed = evaluateSentinel({
      trigger: "changes",
      previous: first.nextState,
      observation: { ok: true, value: "13 items" },
      now: at(1000),
    });
    expect(changed.fire).toBe(true);
    expect(changed.nextState.since).toBe(at(1000).toISOString());
  });
});

describe("evaluateSentinel — stays-true-for", () => {
  const windowMs = 15 * 60_000;

  it("arms a follow-up while the window is not yet elapsed", () => {
    const first = evaluateSentinel({
      trigger: "stays-true-for",
      windowMs,
      observation: { ok: true, value: "backed up" },
      now: T0,
    });
    expect(first.fire).toBe(false);
    expect(first.armFollowUpAt).toEqual(at(windowMs));
  });

  it("fires once the condition has held for the whole window", () => {
    const held = state(true, "backed up", 0);
    const ripe = evaluateSentinel({
      trigger: "stays-true-for",
      windowMs,
      previous: held,
      observation: { ok: true, value: "backed up" },
      now: at(windowMs + 1),
    });
    expect(ripe.fire).toBe(true);
  });

  it("resets the timer when the condition drops", () => {
    const held = state(true, "backed up", 0);
    const dropped = evaluateSentinel({
      trigger: "stays-true-for",
      windowMs,
      previous: held,
      observation: { ok: false, value: "clear" },
      now: at(windowMs + 1),
    });
    expect(dropped.fire).toBe(false);
    expect(dropped.nextState.since).toBe(at(windowMs + 1).toISOString());
  });
});

describe("parseWindowMs", () => {
  it("parses units and rejects junk", () => {
    expect(parseWindowMs("15m")).toBe(900_000);
    expect(parseWindowMs("2h")).toBe(7_200_000);
    expect(parseWindowMs("90 s")).toBe(90_000);
    expect(parseWindowMs("1d")).toBe(86_400_000);
    expect(parseWindowMs("soon")).toBeNull();
    expect(parseWindowMs("10")).toBeNull();
  });
});
