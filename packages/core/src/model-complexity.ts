import { COMPLEXITY_ROUTER_MODEL_ID } from "@rakazo/contracts";

export type ModelComplexityTier = "fast" | "smart" | "heavy";

export type ComplexityRouterSlots = {
  fast?: string | null;
  smart?: string | null;
  heavy?: string | null;
};

export type ModelComplexityInput = {
  prompt: string;
  historyChars?: number;
  hasImages?: boolean;
  trigger?: string;
};

const HEAVY_PROMPT_CHARS = 2_000;
const SMART_HISTORY_CHARS = 12_000;

const HEAVY_PATTERN =
  /\b(architect(?:ure|ing)|from[ -]?scratch|redesign|migrat(?:e|ing) (?:the |this |our )|entire system|multi-?file refactor)\b/i;
const SMART_PATTERN =
  /\b(implement|refactor|rewrite|debug|compile|typecheck|unit test|write (?:a |the )?(?:plan|spec)|step by step|multi-?step)\b/i;
const CODE_FENCE = /```/;
const CODEISH = /[{};]|<\/?\w|def |function |class |import |select /i;

function nonempty(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === COMPLEXITY_ROUTER_MODEL_ID) return undefined;
  return trimmed;
}

/** Map a request onto Fast / Smart / Heavy without calling a model. */
export function routeModelComplexity(input: ModelComplexityInput): ModelComplexityTier {
  const prompt = input.prompt ?? "";
  if (input.hasImages) return "heavy";
  if (prompt.length >= HEAVY_PROMPT_CHARS) return "heavy";
  if (HEAVY_PATTERN.test(prompt)) return "heavy";

  if (CODE_FENCE.test(prompt) || SMART_PATTERN.test(prompt)) return "smart";
  if (prompt.length >= 200 && CODEISH.test(prompt)) return "smart";
  if ((input.historyChars ?? 0) >= SMART_HISTORY_CHARS) return "smart";

  return "fast";
}

/** Heavy empty → Smart → Fast. Missing Fast means the router is not ready. */
export function pickComplexityRouterSlot(
  tier: ModelComplexityTier,
  slots: ComplexityRouterSlots,
): string | undefined {
  const fast = nonempty(slots.fast);
  const smart = nonempty(slots.smart) ?? fast;
  const heavy = nonempty(slots.heavy) ?? smart;
  if (tier === "heavy") return heavy;
  if (tier === "smart") return smart;
  return fast;
}

/** Turn a candidate model id into the concrete slot when the candidate is Auto. */
export function resolveComplexityRouterModelId(input: {
  candidateId: string;
  purpose?: "run" | "compaction";
  stickyModelId?: string | null;
  slots: ComplexityRouterSlots;
  prompt?: string;
  historyChars?: number;
  hasImages?: boolean;
  trigger?: string;
}): string {
  if (input.candidateId !== COMPLEXITY_ROUTER_MODEL_ID) return input.candidateId;
  const sticky = nonempty(input.stickyModelId);
  if (sticky) return sticky;
  const tier =
    input.purpose === "compaction"
      ? "fast"
      : routeModelComplexity({
          prompt: input.prompt ?? "",
          historyChars: input.historyChars,
          hasImages: input.hasImages,
          trigger: input.trigger,
        });
  return pickComplexityRouterSlot(tier, input.slots) ?? input.candidateId;
}
