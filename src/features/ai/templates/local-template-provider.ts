import type {
  TemplateInstantiateInput,
  TemplateInstantiateOutput,
} from "@/features/ai/types";
import {
  SWOT_TEMPLATE_ID,
  SWOT_TEMPLATE_NAME,
} from "@/features/ai/templates/template-types";
import { buildSwotTemplatePlan } from "@/features/ai/templates/swot-template";

export type TemplateSummary = {
  id: string;
  name: string;
};

const TEMPLATE_CATALOG: TemplateSummary[] = [
  {
    id: SWOT_TEMPLATE_ID,
    name: SWOT_TEMPLATE_NAME,
  },
];

/**
 * Handles list local templates.
 */
export function listLocalTemplates(): TemplateSummary[] {
  return [...TEMPLATE_CATALOG];
}

/**
 * Handles instantiate local template.
 */
export function instantiateLocalTemplate(
  input: TemplateInstantiateInput,
): TemplateInstantiateOutput {
  if (input.templateId !== SWOT_TEMPLATE_ID) {
    throw new Error(`Unsupported template id: ${input.templateId}`);
  }

  return {
    plan: buildSwotTemplatePlan(input),
  };
}
