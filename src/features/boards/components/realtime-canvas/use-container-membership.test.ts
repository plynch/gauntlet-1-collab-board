import { renderHook } from "@testing-library/react";
import type { MutableRefObject } from "react";
import { describe, expect, it } from "vitest";

import type { BoardObject, BoardObjectKind } from "@/features/boards/types";
import {
  getGridSectionBoundsFromGeometry,
  toSectionRelativeCoordinate,
} from "@/features/boards/components/realtime-canvas/container-membership-geometry";
import { useContainerMembership } from "@/features/boards/components/realtime-canvas/use-container-membership";

const CONNECTOR_TYPES: BoardObjectKind[] = [
  "connectorUndirected",
  "connectorArrow",
  "connectorBidirectional",
];

function makeObject(
  overrides: Pick<BoardObject, "id" | "type"> & Partial<BoardObject>,
): BoardObject {
  const { id, type, ...rest } = overrides;
  return {
    id,
    type,
    zIndex: 1,
    x: 0,
    y: 0,
    width: 120,
    height: 90,
    rotationDeg: 0,
    color: "#fef3c7",
    text: "",
    updatedAt: null,
    ...rest,
  };
}

function renderContainerMembershipHook(objects: BoardObject[]) {
  const objectsByIdRef = {
    current: new Map(objects.map((objectItem) => [objectItem.id, objectItem])),
  } as MutableRefObject<Map<string, BoardObject>>;

  return renderHook(() =>
    useContainerMembership({
      objectsByIdRef,
      getCurrentObjectGeometry: (objectId) => {
        const objectItem = objectsByIdRef.current.get(objectId);
        if (!objectItem) {
          return null;
        }

        return {
          x: objectItem.x,
          y: objectItem.y,
          width: objectItem.width,
          height: objectItem.height,
          rotationDeg: objectItem.rotationDeg,
        };
      },
      maxRows: 6,
      maxCols: 6,
      defaultGap: 2,
      getDistance: (left, right) =>
        Math.hypot(left.x - right.x, left.y - right.y),
      roundToStep: (value, step) => Math.round(value / step) * step,
      isConnectorKind: (value) => CONNECTOR_TYPES.includes(value),
    }),
  );
}

describe("use-container-membership", () => {
  it("preserves child relative placement during container drag when unclamped", () => {
    const container = makeObject({
      id: "container-1",
      type: "gridContainer",
      zIndex: 1,
      x: 100,
      y: 100,
      width: 420,
      height: 300,
      gridRows: 2,
      gridCols: 2,
      gridGap: 2,
    });
    const currentSections = getGridSectionBoundsFromGeometry(
      {
        x: container.x,
        y: container.y,
        width: container.width,
        height: container.height,
      },
      2,
      2,
      2,
    );
    const sourceSection = currentSections[0];
    const stickyWidth = 170;
    const stickyHeight = 130;
    const centerRelative = { x: 0.06, y: 0.08 };
    const stickyCenterX =
      sourceSection.left +
      centerRelative.x * (sourceSection.right - sourceSection.left);
    const stickyCenterY =
      sourceSection.top +
      centerRelative.y * (sourceSection.bottom - sourceSection.top);

    const sticky = makeObject({
      id: "sticky-1",
      type: "sticky",
      width: stickyWidth,
      height: stickyHeight,
      x: stickyCenterX - stickyWidth / 2,
      y: stickyCenterY - stickyHeight / 2,
      containerId: container.id,
      containerSectionIndex: 0,
      containerRelX: centerRelative.x,
      containerRelY: centerRelative.y,
    });

    const { result } = renderContainerMembershipHook([container, sticky]);
    const nextContainerGeometry = {
      x: container.x + 180,
      y: container.y + 90,
      width: container.width,
      height: container.height,
      rotationDeg: 0,
    };
    const nextSection = getGridSectionBoundsFromGeometry(
      {
        x: nextContainerGeometry.x,
        y: nextContainerGeometry.y,
        width: nextContainerGeometry.width,
        height: nextContainerGeometry.height,
      },
      2,
      2,
      2,
    )[0];
    const expectedCenterX =
      nextSection.left +
      centerRelative.x * (nextSection.right - nextSection.left);
    const expectedCenterY =
      nextSection.top +
      centerRelative.y * (nextSection.bottom - nextSection.top);
    const expectedTopLeft = {
      x: expectedCenterX - stickyWidth / 2,
      y: expectedCenterY - stickyHeight / 2,
    };

    const clampedUpdate = result.current.getSectionAnchoredObjectUpdatesForContainer(
      container.id,
      nextContainerGeometry,
      2,
      2,
      2,
    );
    const unclampedUpdate =
      result.current.getSectionAnchoredObjectUpdatesForContainer(
        container.id,
        nextContainerGeometry,
        2,
        2,
        2,
        {
          clampToSectionBounds: false,
          includeObjectsInNextBounds: false,
        },
      );

    expect(unclampedUpdate.positionByObjectId[sticky.id]).toEqual(
      expectedTopLeft,
    );
    expect(unclampedUpdate.positionByObjectId[sticky.id]!.x).toBeLessThan(
      nextSection.left,
    );
    expect(unclampedUpdate.positionByObjectId[sticky.id]!.y).toBeLessThan(
      nextSection.top,
    );

    expect(clampedUpdate.positionByObjectId[sticky.id]!.x).toBeGreaterThanOrEqual(
      nextSection.left,
    );
    expect(clampedUpdate.positionByObjectId[sticky.id]!.y).toBeGreaterThanOrEqual(
      nextSection.top,
    );

    const nextMembership = unclampedUpdate.membershipByObjectId[sticky.id];
    expect(nextMembership).toBeDefined();
    expect(nextMembership!.containerId).toBe(container.id);
    expect(nextMembership!.containerSectionIndex).toBe(0);
    expect(nextMembership!.containerRelX).toBeCloseTo(centerRelative.x, 3);
    expect(nextMembership!.containerRelY).toBeCloseTo(centerRelative.y, 3);
  });

  it("does not capture unrelated objects when include-next-bounds is disabled", () => {
    const container = makeObject({
      id: "container-1",
      type: "gridContainer",
      zIndex: 1,
      x: 100,
      y: 100,
      width: 420,
      height: 300,
      gridRows: 2,
      gridCols: 2,
      gridGap: 2,
    });
    const unrelated = makeObject({
      id: "shape-1",
      type: "rect",
      x: 620,
      y: 220,
      width: 120,
      height: 90,
      containerId: null,
      containerSectionIndex: null,
      containerRelX: null,
      containerRelY: null,
    });

    const { result } = renderContainerMembershipHook([container, unrelated]);
    const nextContainerGeometry = {
      x: 520,
      y: 140,
      width: container.width,
      height: container.height,
      rotationDeg: 0,
    };

    const defaultUpdate = result.current.getSectionAnchoredObjectUpdatesForContainer(
      container.id,
      nextContainerGeometry,
      2,
      2,
      2,
    );
    const dragSafeUpdate =
      result.current.getSectionAnchoredObjectUpdatesForContainer(
        container.id,
        nextContainerGeometry,
        2,
        2,
        2,
        {
          includeObjectsInNextBounds: false,
        },
      );

    expect(defaultUpdate.positionByObjectId[unrelated.id]).toBeDefined();
    expect(defaultUpdate.membershipByObjectId[unrelated.id]?.containerId).toBe(
      container.id,
    );
    expect(dragSafeUpdate.positionByObjectId[unrelated.id]).toBeUndefined();
    expect(dragSafeUpdate.membershipByObjectId[unrelated.id]).toBeUndefined();

    const nextSections = getGridSectionBoundsFromGeometry(
      {
        x: nextContainerGeometry.x,
        y: nextContainerGeometry.y,
        width: nextContainerGeometry.width,
        height: nextContainerGeometry.height,
      },
      2,
      2,
      2,
    );
    const targetSection = nextSections[0];
    const nextPosition = defaultUpdate.positionByObjectId[unrelated.id]!;
    const nextCenter = {
      x: nextPosition.x + unrelated.width / 2,
      y: nextPosition.y + unrelated.height / 2,
    };
    const relative = toSectionRelativeCoordinate(nextCenter, targetSection);
    expect(relative.x).toBeGreaterThanOrEqual(0);
    expect(relative.x).toBeLessThanOrEqual(1);
    expect(relative.y).toBeGreaterThanOrEqual(0);
    expect(relative.y).toBeLessThanOrEqual(1);
  });
});
