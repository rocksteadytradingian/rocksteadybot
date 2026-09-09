import type { ComputerRef, SandboxProvider } from "@rakazo/adapter-kit";
import { sandboxCommandTimeoutMs } from "@rakazo/core";

export interface SandboxCommandContext {
  operationId: string;
  traceId: string;
  workspaceId: string;
  userId: string;
  botId?: string;
  runId?: string;
  signal: AbortSignal;
}

/** Drain a sandbox exec stream into a single `{ stdout, stderr, code }` result. */
export async function runSandboxCommand(
  sandbox: Pick<SandboxProvider, "execute">,
  computer: ComputerRef,
  argv: string[],
  cwd: string | undefined,
  context: SandboxCommandContext,
): Promise<{ stdout: string; stderr: string; code: number }> {
  let stdout = "";
  let stderr = "";
  let code = 0;
  for await (const event of sandbox.execute(
    computer,
    { argv, cwd, timeoutMs: sandboxCommandTimeoutMs() },
    context,
  )) {
    if (event.type === "stdout") stdout += event.data;
    if (event.type === "stderr") stderr += event.data;
    if (event.type === "exit") code = event.code;
  }
  return { stdout, stderr, code };
}
