import { type PromptSectionInput, planPrompt } from "@rakazo/core";

/**
 * The run's `instructions` string is stitched together from ~two dozen fragments. A few of
 * them — the bot's durable memory, open scratchpad items, the skills catalog, the peer-bot
 * directory — grow with the workspace and can, together, crowd out the window. This budgets
 * that string: the fixed guidance always stays; the elastic parts trim or drop by priority
 * before the total gets out of hand.
 */

/** Elastic instruction fragments rarely approach this; when they do, trimming beats overflow. */
export const INSTRUCTION_TOKEN_BUDGET = 24_000;

export interface InstructionSection {
  name: string;
  text: string | undefined;
  /** Omit for a fixed fragment (never trimmed). A number marks it elastic — lower trims first. */
  priority?: number;
}

export interface AssembledInstructions {
  text: string;
  report: string;
  /** At least one elastic fragment was shortened or dropped. */
  trimmed: boolean;
}

export function assembleInstructions(
  sections: InstructionSection[],
  budget: number = INSTRUCTION_TOKEN_BUDGET,
): AssembledInstructions {
  const present = sections.filter((section): section is InstructionSection & { text: string } =>
    Boolean(section.text?.trim()),
  );
  const plan = planPrompt({
    contextWindow: budget,
    reserveForOutput: 0,
    sections: present.map<PromptSectionInput>((section) => ({
      name: section.name,
      text: section.text,
      priority: section.priority ?? Number.MAX_SAFE_INTEGER,
      required: section.priority === undefined,
    })),
  });
  return {
    text: plan.sections
      .map((section) => section.text)
      .filter(Boolean)
      .join("\n\n"),
    report: plan.report,
    trimmed: plan.sections.some((section) => section.trimmed),
  };
}
