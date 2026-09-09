import type { AdapterContext, ComputerRef } from "@rakazo/adapter-kit";
import { describe, expect, it } from "vitest";
import { FakeSandboxProvider } from "./fake-sandbox.js";
import { runTeamFileTool } from "./team-computer-tools.js";

const ctx = {
  operationId: "run-1:team",
  traceId: "run-1",
  workspaceId: "ws-1",
  userId: "user-1",
  botId: "bot-1",
  signal: new AbortController().signal,
} satisfies AdapterContext;

async function provisionFake() {
  const sandbox = new FakeSandboxProvider();
  const ref = await sandbox.provision({ botId: "team-ws-1", homePath: "/tmp/team-ws-1" }, ctx);
  return { sandbox, ref };
}

function call(
  sandbox: FakeSandboxProvider,
  ref: ComputerRef,
  name: string,
  args: Record<string, unknown>,
) {
  return runTeamFileTool(sandbox, {
    name,
    args,
    ref,
    ctx,
    botId: "bot-1",
    maxBytes: 200,
  });
}

describe("runTeamFileTool", () => {
  it("round-trips a shared file and keeps the shared/ path verbatim", async () => {
    const { sandbox, ref } = await provisionFake();

    await expect(
      call(sandbox, ref, "team_write_file", { path: "shared/plan.md", content: "the plan" }),
    ).resolves.toEqual({ ok: true, path: "shared/plan.md" });

    // stored on the shared computer under the exact shared/ path
    expect(sandbox.boxes.get(ref.id)?.files.has("shared/plan.md")).toBe(true);

    await expect(call(sandbox, ref, "team_read_file", { path: "shared/plan.md" })).resolves.toEqual(
      { path: "shared/plan.md", content: "the plan" },
    );

    await expect(call(sandbox, ref, "team_list_files", { path: "shared" })).resolves.toEqual({
      path: "shared",
      entries: [{ path: "shared/plan.md", kind: "file", size: 8 }],
    });
  });

  it("namespaces a bare relative path under the calling bot's team folder", async () => {
    const { sandbox, ref } = await provisionFake();

    await call(sandbox, ref, "team_write_file", { path: "draft.md", content: "wip" });

    expect([...(sandbox.boxes.get(ref.id)?.files.keys() ?? [])]).toEqual(["bots/bot-1/draft.md"]);
    await expect(call(sandbox, ref, "team_read_file", { path: "draft.md" })).resolves.toEqual({
      path: "draft.md",
      content: "wip",
    });
  });

  it("runs a shell command on the shared computer", async () => {
    const { sandbox, ref } = await provisionFake();
    await expect(call(sandbox, ref, "team_shell", { command: "echo hi" })).resolves.toEqual({
      stdout: "ran bash -lc echo hi\n",
      stderr: "",
      code: 0,
    });
  });

  it("reports an over-large read instead of returning partial data", async () => {
    const { sandbox, ref } = await provisionFake();
    await call(sandbox, ref, "team_write_file", {
      path: "shared/big.txt",
      content: "x".repeat(400),
    });
    await expect(call(sandbox, ref, "team_read_file", { path: "shared/big.txt" })).resolves.toEqual(
      { error: "file is too large for model context", path: "shared/big.txt" },
    );
  });

  it("rejects an unknown team tool", async () => {
    const { sandbox, ref } = await provisionFake();
    await expect(call(sandbox, ref, "team_teleport", {})).resolves.toEqual({
      error: "unknown team tool team_teleport",
    });
  });
});
