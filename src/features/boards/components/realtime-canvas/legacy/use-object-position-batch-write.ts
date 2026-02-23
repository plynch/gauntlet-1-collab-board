"use client";

import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

import { toBoardErrorMessage } from "@/features/boards/components/realtime-canvas/board-error";
import {
  areContainerMembershipPatchesEqual,
  getMembershipPatchFromObject,
} from "@/features/boards/components/realtime-canvas/use-container-membership";
import {
  arePointsClose,
  toWritePoint,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import { POSITION_WRITE_EPSILON } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type {
  BoardPoint,
  ObjectGeometry,
  ObjectWriteOptions,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import type { BoardObject } from "@/features/boards/types";

type WriteMetrics = {
  markAttempted: (channel: "object-position", count?: number) => void;
  markSkipped: (channel: "object-position", count?: number) => void;
  markCommitted: (channel: "object-position", count?: number) => void;
};

type UseObjectPositionBatchWriteProps = {
  boardId: string;
  db: Firestore;
  canEditRef: MutableRefObject<boolean>;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  writeMetricsRef: MutableRefObject<WriteMetrics>;
  lastGeometryWriteByIdRef: MutableRefObject<Map<string, ObjectGeometry>>;
  lastPositionWriteByIdRef: MutableRefObject<Map<string, BoardPoint>>;
  setBoardError: Dispatch<SetStateAction<string | null>>;
};

export function useObjectPositionBatchWrite({
  boardId,
  db,
  canEditRef,
  objectsByIdRef,
  writeMetricsRef,
  lastGeometryWriteByIdRef,
  lastPositionWriteByIdRef,
  setBoardError,
}: UseObjectPositionBatchWriteProps) {
  return useCallback(
    async (
      nextPositionsById: Record<string, BoardPoint>,
      options: ObjectWriteOptions = {},
    ) => {
      const entries = Object.entries(nextPositionsById);
      if (entries.length === 0) {
        return;
      }

      const writeMetrics = writeMetricsRef.current;
      writeMetrics.markAttempted("object-position", entries.length);

      if (!canEditRef.current) {
        writeMetrics.markSkipped("object-position", entries.length);
        return;
      }

      const includeUpdatedAt = options.includeUpdatedAt ?? false;
      const force = options.force ?? false;
      const membershipPatches = options.containerMembershipById ?? {};

      try {
        const batch = writeBatch(db);
        const writeEntries: Array<[string, BoardPoint]> = [];
        let skippedCount = 0;

        entries.forEach(([objectId, position]) => {
          const nextPosition = toWritePoint(position);
          const objectItem = objectsByIdRef.current.get(objectId);
          const previousPosition =
            lastPositionWriteByIdRef.current.get(objectId) ??
            (objectItem ? { x: objectItem.x, y: objectItem.y } : null);
          const currentMembership = objectItem
            ? getMembershipPatchFromObject(objectItem)
            : {
                containerId: null,
                containerSectionIndex: null,
                containerRelX: null,
                containerRelY: null,
              };
          const nextMembershipPatch = membershipPatches[objectId];
          const hasMembershipChange = nextMembershipPatch
            ? !areContainerMembershipPatchesEqual(
                currentMembership,
                nextMembershipPatch,
              )
            : false;

          if (
            !force &&
            previousPosition &&
            arePointsClose(previousPosition, nextPosition, POSITION_WRITE_EPSILON) &&
            !hasMembershipChange
          ) {
            skippedCount += 1;
            return;
          }

          const updatePayload: Record<string, unknown> = {
            x: nextPosition.x,
            y: nextPosition.y,
          };
          if (nextMembershipPatch && (hasMembershipChange || force)) {
            updatePayload.containerId = nextMembershipPatch.containerId;
            updatePayload.containerSectionIndex =
              nextMembershipPatch.containerSectionIndex;
            updatePayload.containerRelX = nextMembershipPatch.containerRelX;
            updatePayload.containerRelY = nextMembershipPatch.containerRelY;
          }
          if (includeUpdatedAt) {
            updatePayload.updatedAt = serverTimestamp();
          }

          batch.update(doc(db, `boards/${boardId}/objects/${objectId}`), updatePayload);
          writeEntries.push([objectId, nextPosition]);
        });

        if (skippedCount > 0) {
          writeMetrics.markSkipped("object-position", skippedCount);
        }
        if (writeEntries.length === 0) {
          return;
        }

        await batch.commit();
        writeMetrics.markCommitted("object-position", writeEntries.length);
        writeEntries.forEach(([objectId, position]) => {
          lastPositionWriteByIdRef.current.set(objectId, position);
          const previousGeometry = lastGeometryWriteByIdRef.current.get(objectId);
          if (previousGeometry) {
            lastGeometryWriteByIdRef.current.set(objectId, {
              ...previousGeometry,
              x: position.x,
              y: position.y,
            });
          }
        });
      } catch (error) {
        console.error("Failed to update object positions", error);
        setBoardError(
          toBoardErrorMessage(error, "Failed to update object positions."),
        );
      }
    },
    [
      boardId,
      canEditRef,
      db,
      lastGeometryWriteByIdRef,
      lastPositionWriteByIdRef,
      objectsByIdRef,
      setBoardError,
      writeMetricsRef,
    ],
  );
}
