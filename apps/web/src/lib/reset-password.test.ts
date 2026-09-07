import { describe, expect, it } from "vitest";
import {
  passwordResetProofFromLocation,
  resetPasswordBody,
  resetPasswordTokenFromSearch,
} from "./reset-password.js";

describe("resetPasswordTokenFromSearch", () => {
  it("reads the Better Auth callback token", () => {
    expect(resetPasswordTokenFromSearch("token=abc123&error=")).toBe("abc123");
    expect(resetPasswordTokenFromSearch("?token=abc123")).toBe("abc123");
    expect(resetPasswordTokenFromSearch("error=INVALID_TOKEN")).toBeNull();
    expect(resetPasswordTokenFromSearch("")).toBeNull();
  });
});

describe("passwordResetProofFromLocation", () => {
  it("prefers a Supabase recovery token hash", () => {
    expect(passwordResetProofFromLocation("token_hash=recov&type=recovery", "")).toEqual({
      method: "supabase-hash",
      tokenHash: "recov",
    });
  });

  it("reads a Supabase access token from the URL hash", () => {
    expect(
      passwordResetProofFromLocation("", "#access_token=jwt-token&type=recovery&expires_in=3600"),
    ).toEqual({ method: "supabase-access", accessToken: "jwt-token" });
  });

  it("falls back to the Better Auth token", () => {
    expect(passwordResetProofFromLocation("token=abc123", "")).toEqual({
      method: "better-auth",
      token: "abc123",
    });
  });
});

describe("resetPasswordBody", () => {
  it("sends the matching proof field", () => {
    expect(resetPasswordBody({ method: "better-auth", token: "abc" }, "new-password-12")).toEqual({
      newPassword: "new-password-12",
      token: "abc",
    });
    expect(
      resetPasswordBody({ method: "supabase-hash", tokenHash: "hash" }, "new-password-12"),
    ).toEqual({ newPassword: "new-password-12", tokenHash: "hash" });
    expect(
      resetPasswordBody({ method: "supabase-access", accessToken: "jwt" }, "new-password-12"),
    ).toEqual({ newPassword: "new-password-12", accessToken: "jwt" });
  });
});
