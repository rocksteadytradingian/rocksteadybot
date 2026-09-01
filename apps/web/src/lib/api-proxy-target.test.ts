import { describe, expect, it } from "vitest";
import { previewAllowedHosts, resolveApiProxyTarget } from "./api-proxy-target";

describe("resolveApiProxyTarget", () => {
  it("uses the explicit Compose target", () => {
    expect(resolveApiProxyTarget({ API_PROXY_TARGET: "http://api:3100" }, false)).toBe(
      "http://api:3100",
    );
  });

  it("defaults to the Compose API hostname inside Docker", () => {
    expect(resolveApiProxyTarget({}, true)).toBe("http://api:3100");
  });

  it("defaults to loopback on the host", () => {
    expect(resolveApiProxyTarget({}, false)).toBe("http://127.0.0.1:3100");
  });
});

describe("previewAllowedHosts", () => {
  it("accepts both localhost and 127.0.0.1", () => {
    expect(previewAllowedHosts("localhost")).toEqual(
      expect.arrayContaining(["localhost", "127.0.0.1"]),
    );
  });
});
