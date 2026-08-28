import { describe, expect, it } from "vitest";
import { resolvePreviewAllowedHosts, TRYCLOUDFLARE_HOST_SUFFIX } from "./preview-hosts.js";

describe("resolvePreviewAllowedHosts", () => {
  it("defaults to localhost plus the trycloudflare suffix", () => {
    expect(resolvePreviewAllowedHosts({})).toEqual(["localhost", TRYCLOUDFLARE_HOST_SUFFIX]);
  });

  it("includes the deployment host and optional extra names", () => {
    expect(
      resolvePreviewAllowedHosts({
        RAKAZO_HOST: "app.example.com",
        RAKAZO_ALLOWED_HOSTS: " www.example.com , .example.com ",
      }),
    ).toEqual(["app.example.com", TRYCLOUDFLARE_HOST_SUFFIX, "www.example.com", ".example.com"]);
  });

  it("dedupes the deployment host when it is also listed in extras", () => {
    expect(
      resolvePreviewAllowedHosts({
        RAKAZO_HOST: "app.example.com",
        RAKAZO_ALLOWED_HOSTS: "app.example.com,.trycloudflare.com",
      }),
    ).toEqual(["app.example.com", TRYCLOUDFLARE_HOST_SUFFIX]);
  });
});
