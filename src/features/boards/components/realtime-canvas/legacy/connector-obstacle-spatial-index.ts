import type {
  ConnectorRoutingObstacle,
  ObjectBounds,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";

type SpatialIndex = {
  query(bounds: ObjectBounds): ConnectorRoutingObstacle[];
};

const BOUNDS_SIGNATURE_STEP = 8;

function toCellRange(value: number, cellSize: number): number {
  return Math.floor(value / cellSize);
}

function toCellKey(cellX: number, cellY: number): string {
  return `${cellX}:${cellY}`;
}

function normalizeBounds(bounds: ObjectBounds): ObjectBounds {
  return {
    left: Math.min(bounds.left, bounds.right),
    right: Math.max(bounds.left, bounds.right),
    top: Math.min(bounds.top, bounds.bottom),
    bottom: Math.max(bounds.top, bounds.bottom),
  };
}

function getBoundsCellKeys(bounds: ObjectBounds, cellSize: number): string[] {
  const normalized = normalizeBounds(bounds);
  const minCellX = toCellRange(normalized.left, cellSize);
  const maxCellX = toCellRange(normalized.right, cellSize);
  const minCellY = toCellRange(normalized.top, cellSize);
  const maxCellY = toCellRange(normalized.bottom, cellSize);
  const keys: string[] = [];

  for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      keys.push(toCellKey(cellX, cellY));
    }
  }

  return keys;
}

export function createConnectorObstacleSpatialIndex(
  obstacles: ConnectorRoutingObstacle[],
  cellSize: number,
): SpatialIndex {
  if (obstacles.length === 0 || cellSize <= 0) {
    return {
      query: () => [],
    };
  }

  const cells = new Map<string, number[]>();
  obstacles.forEach((obstacle, index) => {
    const cellKeys = getBoundsCellKeys(obstacle.bounds, cellSize);
    cellKeys.forEach((cellKey) => {
      const existing = cells.get(cellKey);
      if (existing) {
        existing.push(index);
        return;
      }
      cells.set(cellKey, [index]);
    });
  });

  return {
    query(bounds: ObjectBounds): ConnectorRoutingObstacle[] {
      const keys = getBoundsCellKeys(bounds, cellSize);
      if (keys.length === 0) {
        return [];
      }

      const indexSet = new Set<number>();
      keys.forEach((key) => {
        const cellIndices = cells.get(key);
        if (!cellIndices) {
          return;
        }
        cellIndices.forEach((index) => {
          indexSet.add(index);
        });
      });

      if (indexSet.size === 0) {
        return [];
      }

      return Array.from(indexSet).map((index) => obstacles[index]!).filter(Boolean);
    },
  };
}

function toQuantized(value: number): number {
  return Math.round(value / BOUNDS_SIGNATURE_STEP);
}

export function buildObstacleSignature(
  obstacles: ConnectorRoutingObstacle[],
): string {
  if (obstacles.length === 0) {
    return "none";
  }

  return obstacles
    .map((obstacle) => {
      const normalized = normalizeBounds(obstacle.bounds);
      return [
        obstacle.objectId,
        toQuantized(normalized.left),
        toQuantized(normalized.top),
        toQuantized(normalized.right),
        toQuantized(normalized.bottom),
      ].join(":");
    })
    .sort()
    .join("|");
}
