import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, isActive, isWorking } from "./run-state.js";

describe("run state machine", () => {
  it("treats queued, leased, and running as working", () => {
    expect(isWorking("queued")).toBe(true);
    expect(isWorking("leased")).toBe(true);
    expect(isWorking("running")).toBe(true);
    expect(isWorking("waiting_input")).toBe(false);
    expect(isWorking("waiting_takeover")).toBe(false);
    expect(isWorking("completed")).toBe(false);
  });

  it("keeps waiting states active without counting them as working", () => {
    expect(isActive("waiting_input")).toBe(true);
    expect(isActive("running")).toBe(true);
    expect(isWorking("waiting_input")).toBe(false);
  });

  it("allows takeover resume onto a lease", () => {
    expect(canTransition("waiting_takeover", "leased")).toBe(true);
    expect(canTransition("waiting_takeover", "running")).toBe(false);
  });

  it("rejects rewriting a completed run", () => {
    expect(() => assertTransition("completed", "running")).toThrow(/illegal/i);
  });

  it("never leaves a terminal state except failed retry", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("completed" as const, "cancelled" as const),
        fc.constantFrom(
          "queued" as const,
          "leased" as const,
          "running" as const,
          "waiting_input" as const,
          "completed" as const,
        ),
        (from, to) => {
          expect(canTransition(from, to)).toBe(false);
        },
      ),
    );
  });
});
