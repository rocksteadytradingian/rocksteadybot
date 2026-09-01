import { describe, expect, it } from "vitest";
import { resetPasswordTokenFromSearch } from "./reset-password.js";

describe("resetPasswordTokenFromSearch", () => {
  it("reads the Better Auth callback token", () => {
    expect(resetPasswordTokenFromSearch("token=abc123&error=")).toBe("abc123");
    expect(resetPasswordTokenFromSearch("?token=abc123")).toBe("abc123");
    expect(resetPasswordTokenFromSearch("error=INVALID_TOKEN")).toBeNull();
    expect(resetPasswordTokenFromSearch("")).toBeNull();
  });
});
