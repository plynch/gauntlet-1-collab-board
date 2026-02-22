import type { BoardObjectSnapshot } from "@/features/ai/types";

export type PlannerInput = {
  message: string;
  boardState: BoardObjectSnapshot[];
  selectedObjectIds: string[];
  viewportBounds?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
};
