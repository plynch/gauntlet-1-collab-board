import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useContainerMembership } from "@/features/boards/components/realtime-canvas/use-container-membership";
import {
  clampObjectTopLeftToSection,
  getGridSectionBoundsFromGeometry,
  toSectionRelativeCoordinate,
} from "@/features/boards/components/realtime-canvas/container-membership-geometry";
import type { BoardObject } from "@/features/boards/types";
import {
  buildContainerObject,
  CONTAINER_ID,
  getDistance,
  getObjectGeometry,
  GRID_COLS,
  GRID_GAP,
  GRID_ROWS,
  isConnectorKind,
  MIN_CONTAINER_HEIGHT,
  MIN_CONTAINER_WIDTH,
  ObjectGeometry,
  RELATIVE_POSITION_PRESETS,
  roundToStep,
  STICKY_SIZE,
  type LabUser,
  type ResizeState,
} from "@/features/boards/components/swot-resize-lab-model";

export function useSwotResizeLabState() {
  const [user, setUser] = useState<LabUser | null>(null);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [stickySequence, setStickySequence] = useState(0);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const objectsByIdRef = useRef<Map<string, BoardObject>>(new Map());

  const objectsById = useMemo(() => {
    const map = new Map<string, BoardObject>();
    objects.forEach((objectItem) => {
      map.set(objectItem.id, objectItem);
    });
    return map;
  }, [objects]);
  useEffect(() => {
    objectsByIdRef.current = objectsById;
  }, [objectsById]);

  const getCurrentObjectGeometry = useCallback((objectId: string): ObjectGeometry | null => {
    const objectItem = objectsByIdRef.current.get(objectId);
    return objectItem ? getObjectGeometry(objectItem) : null;
  }, []);

  const { getSectionAnchoredObjectUpdatesForContainer } = useContainerMembership({
    objectsByIdRef,
    getCurrentObjectGeometry,
    maxRows: 6,
    maxCols: 6,
    defaultGap: GRID_GAP,
    getDistance,
    roundToStep,
    isConnectorKind,
  });

  const containerObject = objectsById.get(CONTAINER_ID) ?? null;
  const sections = containerObject
    ? getGridSectionBoundsFromGeometry(
        getObjectGeometry(containerObject),
        Math.max(1, containerObject.gridRows ?? GRID_ROWS),
        Math.max(1, containerObject.gridCols ?? GRID_COLS),
        Math.max(0, containerObject.gridGap ?? GRID_GAP),
      )
    : [];
  const stickyObjects = objects
    .filter((objectItem) => objectItem.type === "sticky")
    .sort((left, right) => left.id.localeCompare(right.id));

  const applyContainerResize = useCallback(
    (nextWidthRaw: number, nextHeightRaw: number) => {
      const currentContainer = objectsByIdRef.current.get(CONTAINER_ID);
      if (!currentContainer || currentContainer.type !== "gridContainer") {
        return;
      }

      const nextGeometry: ObjectGeometry = {
        x: currentContainer.x,
        y: currentContainer.y,
        width: Math.max(MIN_CONTAINER_WIDTH, nextWidthRaw),
        height: Math.max(MIN_CONTAINER_HEIGHT, nextHeightRaw),
        rotationDeg: 0,
      };
      const nextRows = Math.max(1, currentContainer.gridRows ?? GRID_ROWS);
      const nextCols = Math.max(1, currentContainer.gridCols ?? GRID_COLS);
      const nextGap = Math.max(0, currentContainer.gridGap ?? GRID_GAP);
      const childUpdates = getSectionAnchoredObjectUpdatesForContainer(
        CONTAINER_ID,
        nextGeometry,
        nextRows,
        nextCols,
        nextGap,
      );

      setObjects((previous) =>
        previous.map((objectItem) => {
          if (objectItem.id === CONTAINER_ID) {
            return { ...objectItem, width: nextGeometry.width, height: nextGeometry.height };
          }
          const nextPosition = childUpdates.positionByObjectId[objectItem.id];
          const nextMembership = childUpdates.membershipByObjectId[objectItem.id];
          if (!nextPosition || !nextMembership) {
            return objectItem;
          }
          return {
            ...objectItem,
            x: nextPosition.x,
            y: nextPosition.y,
            containerId: nextMembership.containerId,
            containerSectionIndex: nextMembership.containerSectionIndex,
            containerRelX: nextMembership.containerRelX,
            containerRelY: nextMembership.containerRelY,
          };
        }),
      );
    },
    [getSectionAnchoredObjectUpdatesForContainer],
  );

  const handleResizePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0 || !containerObject) {
      return;
    }
    event.preventDefault();
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialWidth: containerObject.width,
      initialHeight: containerObject.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizePointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - resizeState.startX;
    const deltaY = event.clientY - resizeState.startY;
    applyContainerResize(
      resizeState.initialWidth + deltaX,
      resizeState.initialHeight + deltaY,
    );
  };

  const handleResizePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }
    resizeStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const createSwot = () => {
    setObjects([buildContainerObject()]);
    setStickySequence(0);
  };

  const addStickyToSection = (sectionIndex: number) => {
    const currentContainer = objectsByIdRef.current.get(CONTAINER_ID);
    if (!currentContainer || currentContainer.type !== "gridContainer") {
      return;
    }
    const rows = Math.max(1, currentContainer.gridRows ?? GRID_ROWS);
    const cols = Math.max(1, currentContainer.gridCols ?? GRID_COLS);
    const gap = Math.max(0, currentContainer.gridGap ?? GRID_GAP);
    const allSections = getGridSectionBoundsFromGeometry(
      getObjectGeometry(currentContainer),
      rows,
      cols,
      gap,
    );
    const section = allSections[sectionIndex];
    if (!section) {
      return;
    }

    const existingInSection = Array.from(objectsByIdRef.current.values()).filter(
      (objectItem) =>
        objectItem.type === "sticky" &&
        objectItem.containerSectionIndex === sectionIndex,
    ).length;
    const preset =
      RELATIVE_POSITION_PRESETS[existingInSection % RELATIVE_POSITION_PRESETS.length];
    const sectionWidth = Math.max(1, section.right - section.left);
    const sectionHeight = Math.max(1, section.bottom - section.top);
    const preferredTopLeft = {
      x: section.left + preset.x * sectionWidth - STICKY_SIZE.width / 2,
      y: section.top + preset.y * sectionHeight - STICKY_SIZE.height / 2,
    };
    const clampedTopLeft = clampObjectTopLeftToSection(
      section,
      STICKY_SIZE,
      preferredTopLeft,
    );
    const center = {
      x: clampedTopLeft.x + STICKY_SIZE.width / 2,
      y: clampedTopLeft.y + STICKY_SIZE.height / 2,
    };
    const rel = toSectionRelativeCoordinate(center, section);
    const nextId = `sticky-${stickySequence + 1}`;
    setStickySequence((previous) => previous + 1);
    setObjects((previous) => [
      ...previous,
      {
        id: nextId,
        type: "sticky",
        zIndex: 10 + previous.length,
        x: clampedTopLeft.x,
        y: clampedTopLeft.y,
        width: STICKY_SIZE.width,
        height: STICKY_SIZE.height,
        rotationDeg: 0,
        color: "#fde68a",
        text: `S${sectionIndex + 1}-${existingInSection + 1}`,
        containerId: CONTAINER_ID,
        containerSectionIndex: sectionIndex,
        containerRelX: rel.x,
        containerRelY: rel.y,
        updatedAt: null,
      },
    ]);
  };

  return {
    user,
    setUser,
    sections,
    containerObject,
    stickyObjects,
    createSwot,
    addStickyToSection,
    handleResizePointerDown,
    handleResizePointerMove,
    handleResizePointerUp,
  };
}
