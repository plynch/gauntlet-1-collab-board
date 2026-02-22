type CacheEntry = {
  routeKey: string;
  result: unknown;
};

export type DirtyConnectorEntry = {
  connectorId: string;
  priority: boolean;
  hasCachedRoute: boolean;
};

const routeCache = new Map<string, CacheEntry>();
let budgetCursor = 0;

export function getCachedRoute(
  connectorId: string,
  routeKey: string,
): unknown | null {
  const entry = routeCache.get(connectorId);
  if (!entry || entry.routeKey !== routeKey) {
    return null;
  }
  return entry.result;
}

export function setCachedRoute(
  connectorId: string,
  routeKey: string,
  result: unknown,
): void {
  routeCache.set(connectorId, {
    routeKey,
    result,
  });
}

export function cleanupRouteCache(activeConnectorIds: Set<string>): void {
  routeCache.forEach((_entry, connectorId) => {
    if (!activeConnectorIds.has(connectorId)) {
      routeCache.delete(connectorId);
    }
  });
}

function roundRobinPick<T>(items: T[], count: number): T[] {
  if (items.length === 0 || count <= 0) {
    return [];
  }

  const offset = budgetCursor % items.length;
  const picked: T[] = [];
  for (let index = 0; index < count; index += 1) {
    picked.push(items[(offset + index) % items.length]!);
  }

  budgetCursor = (offset + count) % items.length;
  return picked;
}

export function selectConnectorsForRecompute(
  entries: DirtyConnectorEntry[],
  budget: number,
): Set<string> {
  const selected = new Set<string>();
  if (entries.length === 0) {
    return selected;
  }

  entries.forEach((entry) => {
    if (!entry.hasCachedRoute || entry.priority) {
      selected.add(entry.connectorId);
    }
  });

  const remainingBudget = Math.max(0, budget - selected.size);
  if (remainingBudget <= 0) {
    return selected;
  }

  const refreshCandidates = entries.filter(
    (entry) => entry.hasCachedRoute && !selected.has(entry.connectorId),
  );
  roundRobinPick(refreshCandidates, remainingBudget).forEach((entry) => {
    selected.add(entry.connectorId);
  });

  return selected;
}
