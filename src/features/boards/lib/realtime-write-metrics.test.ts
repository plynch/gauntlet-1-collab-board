import { describe, expect, it } from "vitest";

import {
  createRealtimeWriteMetrics,
  isWriteMetricsDebugEnabled,
} from "@/features/boards/lib/realtime-write-metrics";

describe("realtime write metrics collector", () => {
  it("tracks attempted/skipped/committed counts by channel", () => {
    const metrics = createRealtimeWriteMetrics();

    metrics.markAttempted("cursor");
    metrics.markAttempted("object-position", 3);
    metrics.markSkipped("object-position", 2);
    metrics.markCommitted("object-position");
    metrics.markCommitted("sticky-text", 2);

    const snapshot = metrics.snapshot();

    expect(new Date(snapshot.capturedAt).toISOString()).toBe(
      snapshot.capturedAt,
    );
    expect(snapshot.channels.cursor).toEqual({
      attempted: 1,
      skipped: 0,
      committed: 0,
    });
    expect(snapshot.channels["object-position"]).toEqual({
      attempted: 3,
      skipped: 2,
      committed: 1,
    });
    expect(snapshot.channels["sticky-text"].committed).toBe(2);
    expect(snapshot.totals).toEqual({
      attempted: 4,
      skipped: 2,
      committed: 3,
    });
  });

  it("resets all channels", () => {
    const metrics = createRealtimeWriteMetrics();
    metrics.markAttempted("object-geometry");
    metrics.markSkipped("object-geometry");
    metrics.markCommitted("object-geometry");
    metrics.reset();

    const snapshot = metrics.snapshot();

    expect(snapshot.totals).toEqual({
      attempted: 0,
      skipped: 0,
      committed: 0,
    });
  });
});

describe("isWriteMetricsDebugEnabled", () => {
  it("enables only when flag is exactly 1", () => {
    expect(isWriteMetricsDebugEnabled("1")).toBe(true);
    expect(isWriteMetricsDebugEnabled("0")).toBe(false);
    expect(isWriteMetricsDebugEnabled(undefined)).toBe(false);
  });
});
