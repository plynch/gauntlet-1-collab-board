import { BOARD_AI_CREATE_TOOLS } from "@/features/ai/board-tool-schema/create-tools";
import { BOARD_AI_EDIT_TOOLS } from "@/features/ai/board-tool-schema/edit-tools";
import { BOARD_AI_LAYOUT_TOOLS } from "@/features/ai/board-tool-schema/layout-tools";

export const BOARD_AI_TOOLS = [
  ...BOARD_AI_CREATE_TOOLS,
  ...BOARD_AI_LAYOUT_TOOLS,
  ...BOARD_AI_EDIT_TOOLS,
];
