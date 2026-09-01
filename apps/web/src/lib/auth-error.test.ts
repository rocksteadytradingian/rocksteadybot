import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./auth-error";

describe("authErrorMessage", () => {
  it("maps a dropped network request to an unreachable server", () => {
    expect(
      authErrorMessage(
        { message: "fetch failed" },
        "Could not continue",
        "Can't reach the server.",
      ),
    ).toBe("Can't reach the server.");
    expect(
      authErrorMessage(
        { message: "Failed to fetch" },
        "Could not continue",
        "Can't reach the server.",
      ),
    ).toBe("Can't reach the server.");
  });

  it("does not show a Lingui production message id as the error", () => {
    expect(authErrorMessage({ message: "fetch failed" }, "Could not continue", "ROjpWW")).toBe(
      "Could not continue",
    );
    expect(
      authErrorMessage({ message: "ROjpWW" }, "Could not continue", "Can't reach the server."),
    ).toBe("Could not continue");
  });

  it("keeps a real auth error", () => {
    expect(
      authErrorMessage(
        { message: "Invalid password" },
        "Could not continue",
        "Can't reach the server.",
      ),
    ).toBe("Invalid password");
    expect(
      authErrorMessage({ message: "Failed" }, "Could not continue", "Can't reach the server."),
    ).toBe("Failed");
  });

  it("uses the fallback when the client has no message", () => {
    expect(authErrorMessage({}, "Could not continue", "Can't reach the server.")).toBe(
      "Could not continue",
    );
  });
});
