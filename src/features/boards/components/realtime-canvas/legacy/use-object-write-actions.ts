"use client";

import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

import { toBoardErrorMessage } from "@/features/boards/components/realtime-canvas/board-error";
import {
  areContainerMembershipPatchesEqual,
  getMembershipPatchFromObject,
  type ContainerSectionsInfo,
  type ContainerMembershipPatch,
} from "@/features/boards/components/realtime-canvas/use-container-membership";
import {
  areGeometriesClose,
  POSITION_WRITE_STEP,
  roundToStep,
  toConnectorGeometryFromEndpoints,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import type {
  BoardPoint,
  ConnectorDraft,
  ObjectGeometry,
  ObjectWriteOptions,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import type { BoardObject, ConnectorAnchor } from "@/features/boards/types";
import { useObjectPositionBatchWrite } from "@/features/boards/components/realtime-canvas/legacy/use-object-position-batch-write";
import { isConnectorKind } from "@/features/boards/components/realtime-canvas/board-object-helpers";

type WriteMetrics = {
  markAttempted: (
    channel: "object-geometry" | "object-position",
    count?: number,
  ) => void;
  markSkipped: (
    channel: "object-geometry" | "object-position",
    count?: number,
  ) => void;
  markCommitted: (
    channel: "object-geometry" | "object-position",
    count?: number,
  ) => void;
};

type UseObjectWriteActionsProps = {
  boardId: string;
  db: Firestore;
  canEditRef: MutableRefObject<boolean>;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  writeMetricsRef: MutableRefObject<WriteMetrics>;
  lastGeometryWriteByIdRef: MutableRefObject<Map<string, ObjectGeometry>>;
  lastPositionWriteByIdRef: MutableRefObject<Map<string, BoardPoint>>;
  setBoardError: Dispatch<SetStateAction<string | null>>;
  getContainerSectionsInfoById: (
    geometryOverrides?: Record<string, ObjectGeometry>,
  ) => Map<string, ContainerSectionsInfo>;
  resolveContainerMembershipForGeometry: (
    objectId: string,
    geometry: ObjectGeometry,
    containerSectionsInfoById: Map<string, ContainerSectionsInfo>,
  ) => ContainerMembershipPatch | null;
  resolveConnectorEndpoint: (
    objectId: string | null,
    anchor: ConnectorAnchor | null,
    fallbackPoint: BoardPoint,
  ) => {
    connected: boolean;
    objectId: string | null;
    anchor: ConnectorAnchor | null;
    x: number;
    y: number;
  };
};

export function useObjectWriteActions({
  boardId,
  db,
  canEditRef,
  objectsByIdRef,
  writeMetricsRef,
  lastGeometryWriteByIdRef,
  lastPositionWriteByIdRef,
  setBoardError,
  getContainerSectionsInfoById,
  resolveContainerMembershipForGeometry,
  resolveConnectorEndpoint,
}: UseObjectWriteActionsProps) {
  const updateObjectGeometry = useCallback(
    async (
      objectId: string,
      geometry: ObjectGeometry,
      options: ObjectWriteOptions = {},
    ) => {
      const writeMetrics = writeMetricsRef.current;
      writeMetrics.markAttempted("object-geometry");

      if (!canEditRef.current) {
        writeMetrics.markSkipped("object-geometry");
        return;
      }

      const includeUpdatedAt = options.includeUpdatedAt ?? true;
      const force = options.force ?? false;
      const objectItem = objectsByIdRef.current.get(objectId);
      const nextGeometry: ObjectGeometry = {
        x: roundToStep(geometry.x, POSITION_WRITE_STEP),
        y: roundToStep(geometry.y, POSITION_WRITE_STEP),
        width: roundToStep(geometry.width, POSITION_WRITE_STEP),
        height: roundToStep(geometry.height, POSITION_WRITE_STEP),
        rotationDeg:
          objectItem?.type === "gridContainer" ? 0 : geometry.rotationDeg,
      };
      const currentMembership = objectItem
        ? getMembershipPatchFromObject(objectItem)
        : {
            containerId: null,
            containerSectionIndex: null,
            containerRelX: null,
            containerRelY: null,
          };
      const membershipPatchFromOptions =
        options.containerMembershipById?.[objectId];
      const membershipPatch =
        membershipPatchFromOptions ??
        (objectItem &&
        objectItem.type !== "gridContainer" &&
        !isConnectorKind(objectItem.type)
          ? resolveContainerMembershipForGeometry(
              objectId,
              nextGeometry,
              getContainerSectionsInfoById({ [objectId]: nextGeometry }),
            )
          : null);
      const previousGeometry =
        lastGeometryWriteByIdRef.current.get(objectId) ??
        (objectItem
          ? {
              x: objectItem.x,
              y: objectItem.y,
              width: objectItem.width,
              height: objectItem.height,
              rotationDeg: objectItem.rotationDeg,
            }
          : null);
      const hasMembershipChange = membershipPatch
        ? !areContainerMembershipPatchesEqual(
            currentMembership,
            membershipPatch,
          )
        : false;

      if (
        !force &&
        previousGeometry &&
        areGeometriesClose(previousGeometry, nextGeometry) &&
        !hasMembershipChange
      ) {
        writeMetrics.markSkipped("object-geometry");
        return;
      }

      try {
        const payload: Record<string, unknown> = {
          x: nextGeometry.x,
          y: nextGeometry.y,
          width: nextGeometry.width,
          height: nextGeometry.height,
          rotationDeg: nextGeometry.rotationDeg,
        };
        if (membershipPatch && (hasMembershipChange || force)) {
          payload.containerId = membershipPatch.containerId;
          payload.containerSectionIndex = membershipPatch.containerSectionIndex;
          payload.containerRelX = membershipPatch.containerRelX;
          payload.containerRelY = membershipPatch.containerRelY;
        }
        if (includeUpdatedAt) {
          payload.updatedAt = serverTimestamp();
        }

        await updateDoc(doc(db, `boards/${boardId}/objects/${objectId}`), payload);
        lastGeometryWriteByIdRef.current.set(objectId, nextGeometry);
        lastPositionWriteByIdRef.current.set(objectId, {
          x: nextGeometry.x,
          y: nextGeometry.y,
        });
        writeMetrics.markCommitted("object-geometry");
      } catch (error) {
        console.error("Failed to update object transform", error);
        setBoardError(
          toBoardErrorMessage(error, "Failed to update object transform."),
        );
      }
    },
    [
      boardId,
      canEditRef,
      db,
      getContainerSectionsInfoById,
      lastGeometryWriteByIdRef,
      lastPositionWriteByIdRef,
      objectsByIdRef,
      resolveContainerMembershipForGeometry,
      setBoardError,
      writeMetricsRef,
    ],
  );

  const updateConnectorDraft = useCallback(
    async (
      objectId: string,
      draft: ConnectorDraft,
      options: ObjectWriteOptions = {},
    ) => {
      if (!canEditRef.current) {
        return;
      }

      const includeUpdatedAt = options.includeUpdatedAt ?? true;
      const resolvedFrom = resolveConnectorEndpoint(
        draft.fromObjectId,
        draft.fromAnchor,
        { x: draft.fromX, y: draft.fromY },
      );
      const resolvedTo = resolveConnectorEndpoint(
        draft.toObjectId,
        draft.toAnchor,
        { x: draft.toX, y: draft.toY },
      );
      const geometry = toConnectorGeometryFromEndpoints(resolvedFrom, resolvedTo);

      const payload: Record<string, unknown> = {
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        rotationDeg: 0,
        fromObjectId: resolvedFrom.connected ? resolvedFrom.objectId : null,
        toObjectId: resolvedTo.connected ? resolvedTo.objectId : null,
        fromAnchor: resolvedFrom.connected ? resolvedFrom.anchor : null,
        toAnchor: resolvedTo.connected ? resolvedTo.anchor : null,
        fromX: resolvedFrom.x,
        fromY: resolvedFrom.y,
        toX: resolvedTo.x,
        toY: resolvedTo.y,
      };

      if (includeUpdatedAt) {
        payload.updatedAt = serverTimestamp();
      }

      try {
        await updateDoc(doc(db, `boards/${boardId}/objects/${objectId}`), payload);
      } catch (error) {
        console.error("Failed to update connector", error);
        setBoardError(toBoardErrorMessage(error, "Failed to update connector."));
      }
    },
    [boardId, canEditRef, db, resolveConnectorEndpoint, setBoardError],
  );

  const updateObjectPositionsBatch = useObjectPositionBatchWrite({
    boardId,
    db,
    canEditRef,
    objectsByIdRef,
    writeMetricsRef,
    lastGeometryWriteByIdRef,
    lastPositionWriteByIdRef,
    setBoardError,
  });

  return {
    updateObjectGeometry,
    updateConnectorDraft,
    updateObjectPositionsBatch,
  };
}
