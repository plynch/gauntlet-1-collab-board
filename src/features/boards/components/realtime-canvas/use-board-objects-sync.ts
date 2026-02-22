"use client";

import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";

import { getFirebaseClientDb } from "@/lib/firebase/client";
import { toBoardObject } from "@/features/boards/components/realtime-canvas/board-doc-parsers";
import type { BoardObject } from "@/features/boards/types";
import {
  BOARD_SCENE_CANVAS_PARSER_OPTIONS,
  type BoardObjectParserOptions,
} from "@/features/boards/components/realtime-canvas/board-scene-utils";

type UseBoardObjectsResult = {
  objects: BoardObject[];
  objectsById: Map<string, BoardObject>;
  objectsRef: React.RefObject<BoardObject[]>;
  loadingError: string | null;
  setLoadingError: (error: string | null) => void;
};

const parserOptions: BoardObjectParserOptions = BOARD_SCENE_CANVAS_PARSER_OPTIONS;

export function useBoardObjectsSync(boardId: string): UseBoardObjectsResult {
  const db = getFirebaseClientDb();

  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const objectsRef = useRef<BoardObject[]>([]);

  const boardObjectById = useMemo(() => {
    const index = new Map<string, BoardObject>();
    for (const objectItem of objects) {
      index.set(objectItem.id, objectItem);
    }
    return index;
  }, [objects]);

  useEffect(() => {
    const boardQuery = query(
      collection(db, "boards", boardId, "objects"),
      orderBy("zIndex", "asc"),
    );
    const unsubscribe = onSnapshot(
      boardQuery,
      (snapshot) => {
        const next = snapshot.docs
          .map((snapshotItem) =>
            toBoardObject(snapshotItem.id, snapshotItem.data(), parserOptions),
          )
          .filter((item): item is BoardObject => item !== null)
          .sort((left, right) => left.zIndex - right.zIndex);

        setObjects(next);
        objectsRef.current = next;
        setLoadingError(null);
      },
      () => {
        setLoadingError("Failed to sync objects.");
      },
    );

    return () => unsubscribe();
  }, [boardId, db]);

  return {
    objects,
    objectsById: boardObjectById,
    objectsRef,
    loadingError,
    setLoadingError,
  };
}
