import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./auth-error";

describe("authErrorMessage", () => {
  it("maps a dropped network request to an unreachable server", () => {
    expect(
      authErrorMessage({ message: "fetch failed" }, "Could not continue", "Can't reach the server"),
    ).toBe("Can't reach the server");
    expect(
      authErrorMessage(
        { message: "Failed to fetch" },
        "Could not continue",
        "Can't reach the server",
      ),
    ).toBe("Can't reach the server");
  });

  it("keeps a real auth error", () => {
    expect(
      authErrorMessage(
        { message: "Invalid password" },
        "Could not continue",
        "Can't reach the server",
      ),
    ).toBe("Invalid password");
  });

  it("uses the fallback when the client has no message", () => {
    expect(authErrorMessage({}, "Could not continue", "Can't reach the server")).toBe(
      "Could not continue",
    );
  });
});
