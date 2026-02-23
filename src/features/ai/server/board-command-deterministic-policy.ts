const SAFE_DETERMINISTIC_INTENT_PREFIXES = [
  "create-",
  "move-",
  "clear-board",
  "delete",
  "arrange-",
  "align-",
  "distribute-",
  "fit-frame",
  "resize-",
  "change-color",
  "update-text",
  "select-",
  "unselect",
] as const;

const SAFE_DETERMINISTIC_EXACT_INTENTS = new Set([
  "create-frame",
  "create-sticky",
  "create-sticky-batch",
  "create-sticky-grid",
  "swot-template",
  "add-swot-item",
  "create-journey-map",
  "create-retrospective-board",
  "arrange-grid",
  "arrange-to-side",
  "clear-board",
  "clear-board-empty",
  "move-selected",
  "move-all",
  "distribute-objects",
  "align-objects",
  "fit-frame-to-contents",
  "resize-selected",
  "change-color",
  "update-text",
  "delete-selected",
  "unselect",
  "select-all",
  "select-visible",
]);

function isSafeDeterministicIntent(intent: string): boolean {
  if (SAFE_DETERMINISTIC_EXACT_INTENTS.has(intent)) {
    return true;
  }
  return SAFE_DETERMINISTIC_INTENT_PREFIXES.some((prefix) =>
    intent.startsWith(prefix),
  );
}

export function shouldExecuteDeterministicPlan(
  plannerMode: string,
  intent: string,
): boolean {
  if (plannerMode === "deterministic-only") {
    return true;
  }
  return isSafeDeterministicIntent(intent);
}
