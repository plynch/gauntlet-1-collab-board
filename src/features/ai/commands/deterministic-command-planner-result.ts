import type {
  BoardSelectionUpdate,
  BoardToolCall,
  TemplatePlan,
} from "@/features/ai/types";
import type { PlannerInput } from "@/features/ai/commands/deterministic-command-planner-types";

export type DeterministicCommandPlanResult =
  | {
      planned: true;
      intent: string;
      assistantMessage: string;
      plan: TemplatePlan;
      selectionUpdate?: BoardSelectionUpdate;
    }
  | {
      planned: false;
      intent: string;
      assistantMessage: string;
      selectionUpdate?: BoardSelectionUpdate;
    };

export type DeterministicPlanner = (
  input: PlannerInput,
) => DeterministicCommandPlanResult | null;

export function toPlan(options: {
  id: string;
  name: string;
  operations: BoardToolCall[];
}): TemplatePlan {
  return {
    templateId: options.id,
    templateName: options.name,
    operations: options.operations,
  };
}
