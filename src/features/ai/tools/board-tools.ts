import type {
  BoardObjectSnapshot,
  BoardToolCall,
  TemplatePlan,
  ViewportBounds,
} from "@/features/ai/types";
import {
  createConnectorTool,
  createFrameTool,
  createGridContainerTool,
} from "@/features/ai/tools/board-tools/create-container-connector-tools";
import {
  createShapeBatchTool,
  createShapeTool,
  createStickyBatchTool,
  createStickyNoteTool,
} from "@/features/ai/tools/board-tools/create-sticky-shape-tools";
import {
  createBoardExecutorState,
  createObject,
  ensureLoadedObjects,
  getBoardState as getBoardStateFromState,
  getObjectsCollection,
  getTargetAreaBounds,
  resolveSelectedObjects,
  sortObjectsByPosition,
  updateObject,
  updateObjectsInBatch,
  type BoardExecutorState,
  type CreateObjectInput,
} from "@/features/ai/tools/board-tools/executor-state";
import { type BoardToolExecutorOptions } from "@/features/ai/tools/board-tools/constants";
import { fitFrameToContentsTool } from "@/features/ai/tools/board-tools/fit-frame-tool";
import {
  alignObjectsTool,
  arrangeObjectsInGridTool,
  distributeObjectsTool,
} from "@/features/ai/tools/board-tools/layout-tools";
import {
  changeColorTool,
  deleteObjectsTool,
  moveObjectTool,
  moveObjectsTool,
  resizeObjectTool,
  updateTextTool,
} from "@/features/ai/tools/board-tools/move-edit-delete-tools";
import { executeTemplatePlanWithExecutor } from "@/features/ai/tools/board-tools/template-executor";

type ExecuteToolResult = {
  tool: BoardToolCall["tool"];
  objectId?: string;
  createdObjectIds?: string[];
  deletedCount?: number;
};

type ToolArgs<T extends BoardToolCall["tool"]> = Extract<
  BoardToolCall,
  { tool: T }
>["args"];

export class BoardToolExecutor {
  private readonly state: BoardExecutorState;

  constructor(options: BoardToolExecutorOptions) {
    this.state = createBoardExecutorState(options);
  }

  private get objectsCollection() {
    return getObjectsCollection(this.state);
  }

  private allocateZIndex = () => {
    const zIndex = this.state.nextZIndex;
    this.state.nextZIndex += 1;
    return zIndex;
  };

  private get createContext() {
    return {
      ensureLoadedObjects: () => ensureLoadedObjects(this.state),
      createObject: (options: CreateObjectInput) => createObject(this.state, options),
      db: this.state.db,
      objectsCollection: this.objectsCollection,
      objectsById: this.state.objectsById,
      allocateZIndex: this.allocateZIndex,
      userId: this.state.userId,
    };
  }

  private get containerContext() {
    return {
      ensureLoadedObjects: () => ensureLoadedObjects(this.state),
      createObject: (options: CreateObjectInput) => createObject(this.state, options),
      objectsById: this.state.objectsById,
      objectsCollection: this.objectsCollection,
      userId: this.state.userId,
      allocateZIndex: this.allocateZIndex,
    };
  }

  private get layoutContext() {
    return {
      resolveSelectedObjects: (objectIds: string[]) =>
        resolveSelectedObjects(this.state, objectIds),
      sortObjectsByPosition,
      updateObjectsInBatch: (
        updates: Array<{ objectId: string; payload: { x?: number; y?: number } }>,
      ) => updateObjectsInBatch(this.state, updates),
    };
  }

  private get editContext() {
    return {
      resolveSelectedObjects: (objectIds: string[]) =>
        resolveSelectedObjects(this.state, objectIds),
      getTargetAreaBounds: (viewportBounds?: ViewportBounds) =>
        getTargetAreaBounds(this.state, viewportBounds),
      updateObjectsInBatch: (
        updates: Array<{ objectId: string; payload: { x?: number; y?: number } }>,
      ) => updateObjectsInBatch(this.state, updates),
      updateObject: (objectId: string, payload: { x?: number; y?: number; width?: number; height?: number; text?: string; color?: string }) =>
        updateObject(this.state, objectId, payload),
      ensureLoadedObjects: () => ensureLoadedObjects(this.state),
      objectsById: this.state.objectsById,
      db: this.state.db,
      objectsCollection: this.objectsCollection,
    };
  }

  async getBoardState(): Promise<BoardObjectSnapshot[]> {
    return getBoardStateFromState(this.state);
  }

  async createStickyNote(args: ToolArgs<"createStickyNote">): Promise<ExecuteToolResult> {
    return createStickyNoteTool(this.createContext, args);
  }

  async createStickyBatch(
    args: ToolArgs<"createStickyBatch">,
  ): Promise<ExecuteToolResult> {
    return createStickyBatchTool(this.createContext, args);
  }

  async createShape(args: ToolArgs<"createShape">): Promise<ExecuteToolResult> {
    return createShapeTool(this.createContext, args);
  }

  async createShapeBatch(
    args: ToolArgs<"createShapeBatch">,
  ): Promise<ExecuteToolResult> {
    return createShapeBatchTool(this.createContext, args);
  }

  async createGridContainer(
    args: ToolArgs<"createGridContainer">,
  ): Promise<ExecuteToolResult> {
    return createGridContainerTool(this.containerContext, args);
  }

  async createFrame(args: ToolArgs<"createFrame">): Promise<ExecuteToolResult> {
    return createFrameTool(this.containerContext, args);
  }

  async createConnector(
    args: ToolArgs<"createConnector">,
  ): Promise<ExecuteToolResult> {
    return createConnectorTool(this.containerContext, args);
  }

  async arrangeObjectsInGrid(
    args: ToolArgs<"arrangeObjectsInGrid">,
  ): Promise<ExecuteToolResult> {
    return arrangeObjectsInGridTool(this.layoutContext, args);
  }

  async alignObjects(args: ToolArgs<"alignObjects">): Promise<ExecuteToolResult> {
    return alignObjectsTool(this.layoutContext, args);
  }

  async distributeObjects(
    args: ToolArgs<"distributeObjects">,
  ): Promise<ExecuteToolResult> {
    return distributeObjectsTool(this.layoutContext, args);
  }

  async moveObjects(args: ToolArgs<"moveObjects">): Promise<ExecuteToolResult> {
    return moveObjectsTool(this.editContext, args);
  }

  async moveObject(args: ToolArgs<"moveObject">): Promise<ExecuteToolResult> {
    return moveObjectTool(this.editContext, args);
  }

  async resizeObject(args: ToolArgs<"resizeObject">): Promise<ExecuteToolResult> {
    return resizeObjectTool(this.editContext, args);
  }

  async updateText(args: ToolArgs<"updateText">): Promise<ExecuteToolResult> {
    return updateTextTool(this.editContext, args);
  }

  async changeColor(args: ToolArgs<"changeColor">): Promise<ExecuteToolResult> {
    return changeColorTool(this.editContext, args);
  }

  async deleteObjects(args: ToolArgs<"deleteObjects">): Promise<ExecuteToolResult> {
    return deleteObjectsTool(this.editContext, args);
  }

  async fitFrameToContents(
    args: ToolArgs<"fitFrameToContents">,
  ): Promise<ExecuteToolResult> {
    return fitFrameToContentsTool(this.state, args);
  }

  async executeToolCall(toolCall: BoardToolCall): Promise<ExecuteToolResult> {
    switch (toolCall.tool) {
      case "getBoardState":
        await this.getBoardState();
        return { tool: "getBoardState" };
      case "createStickyNote":
        return this.createStickyNote(toolCall.args);
      case "createStickyBatch":
        return this.createStickyBatch(toolCall.args);
      case "createShape":
        return this.createShape(toolCall.args);
      case "createShapeBatch":
        return this.createShapeBatch(toolCall.args);
      case "createGridContainer":
        return this.createGridContainer(toolCall.args);
      case "createFrame":
        return this.createFrame(toolCall.args);
      case "createConnector":
        return this.createConnector(toolCall.args);
      case "arrangeObjectsInGrid":
        return this.arrangeObjectsInGrid(toolCall.args);
      case "alignObjects":
        return this.alignObjects(toolCall.args);
      case "distributeObjects":
        return this.distributeObjects(toolCall.args);
      case "moveObjects":
        return this.moveObjects(toolCall.args);
      case "moveObject":
        return this.moveObject(toolCall.args);
      case "resizeObject":
        return this.resizeObject(toolCall.args);
      case "updateText":
        return this.updateText(toolCall.args);
      case "changeColor":
        return this.changeColor(toolCall.args);
      case "deleteObjects":
        return this.deleteObjects(toolCall.args);
      case "fitFrameToContents":
        return this.fitFrameToContents(toolCall.args);
      default: {
        const exhaustiveCheck: never = toolCall;
        throw new Error(`Unsupported tool call: ${JSON.stringify(exhaustiveCheck)}`);
      }
    }
  }

  async executeTemplatePlan(plan: TemplatePlan): Promise<{
    results: ExecuteToolResult[];
    createdObjectIds: string[];
  }> {
    return executeTemplatePlanWithExecutor(this, plan);
  }
}
