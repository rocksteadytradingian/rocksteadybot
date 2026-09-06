import type {
  AdapterContext,
  ComputerObservation,
  RedactionPolicy,
  RedactionRegion,
  ScreenRedactor,
} from "@rakazo/adapter-kit";
import { redactionEnabled, redactionSummary } from "@rakazo/contracts";
import { readWorkspaceRedactionPolicy } from "@rakazo/db";
import { BoxFillScreenRedactor } from "./box-fill-redactor.js";
import { createOcrRegionDetector, type OcrEngine } from "./ocr-region-detector.js";

/** The executor's screen-redaction dependency: one redactor plus the per-workspace policy. */
export interface ScreenRedaction {
  redactor: ScreenRedactor;
  policyFor(workspaceId: string): Promise<RedactionPolicy>;
}

export interface CreateScreenRedactionOptions {
  /** Use this redactor as-is; overrides `ocr`. */
  redactor?: ScreenRedactor;
  /** When given (and no explicit `redactor`), box-fill uses this engine to locate regions. */
  ocr?: OcrEngine;
}

/**
 * Wire a ScreenRedaction from the database: `policyFor` reads the workspace's stored policy;
 * `redactor` is a {@link BoxFillScreenRedactor}. Text scrubbing works with no options at all;
 * pass an `ocr` engine to turn on image box-fill. For `createRunExecutor({ screenRedaction })`.
 */
export function createScreenRedaction(
  prisma: Parameters<typeof readWorkspaceRedactionPolicy>[0],
  options: CreateScreenRedactionOptions = {},
): ScreenRedaction {
  const redactor =
    options.redactor ??
    new BoxFillScreenRedactor(
      options.ocr ? { detect: createOcrRegionDetector(options.ocr), ocr: true } : {},
    );
  return {
    redactor,
    policyFor: (workspaceId) => readWorkspaceRedactionPolicy(prisma, workspaceId),
  };
}

export interface RedactedObservation {
  observation: ComputerObservation;
  regions: RedactionRegion[];
  /** Short note for the tool result, e.g. `redacted 2 regions (EMAIL)`. Empty when nothing changed. */
  note: string;
}

/**
 * Run a computer observation through a ScreenRedactor before it reaches a model.
 *
 * `frameId` is preserved as the ORIGINAL frame's hash — redaction must not change it, so the
 * "screen unchanged" de-dupe and any lookup-by-id keep working. Fail-open: if the redactor
 * throws, the untouched observation is returned and the error logged, never a half-scrubbed frame.
 */
export async function redactObservation(
  observation: ComputerObservation,
  redactor: ScreenRedactor,
  policy: RedactionPolicy,
  context: AdapterContext,
): Promise<RedactedObservation> {
  if (!redactionEnabled(policy)) return { observation, regions: [], note: "" };
  try {
    const { image, regions } = await redactor.redactFrame(
      {
        image: observation.image,
        mimeType: observation.mimeType,
        width: observation.width,
        height: observation.height,
      },
      policy,
      context,
    );
    const title = observation.activeWindow?.title;
    const redactedTitle = title ? await redactor.redactText(title, policy, context) : title;
    const activeWindow =
      observation.activeWindow && redactedTitle !== title
        ? { ...observation.activeWindow, title: redactedTitle }
        : observation.activeWindow;
    return {
      observation: { ...observation, image, activeWindow },
      regions,
      note: redactionSummary(regions),
    };
  } catch (error) {
    console.error(
      `screen redaction failed for frame ${observation.frameId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { observation, regions: [], note: "" };
  }
}
