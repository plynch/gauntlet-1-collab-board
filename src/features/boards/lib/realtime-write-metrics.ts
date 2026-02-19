export type RealtimeWriteChannel =
  | "cursor"
  | "object-position"
  | "object-geometry"
  | "sticky-text";

export type RealtimeWriteCounters = {
  attempted: number;
  skipped: number;
  committed: number;
};

export type RealtimeWriteMetricsSnapshot = {
  capturedAt: string;
  channels: Record<RealtimeWriteChannel, RealtimeWriteCounters>;
  totals: RealtimeWriteCounters;
};

type RealtimeWriteMetricKind = keyof RealtimeWriteCounters;

export type RealtimeWriteMetricsCollector = {
  markAttempted: (channel: RealtimeWriteChannel, count?: number) => void;
  markSkipped: (channel: RealtimeWriteChannel, count?: number) => void;
  markCommitted: (channel: RealtimeWriteChannel, count?: number) => void;
  snapshot: () => RealtimeWriteMetricsSnapshot;
  reset: () => void;
};

const WRITE_CHANNELS: RealtimeWriteChannel[] = [
  "cursor",
  "object-position",
  "object-geometry",
  "sticky-text",
];

/**
 * Creates empty counters.
 */
function createEmptyCounters(): RealtimeWriteCounters {
  return {
    attempted: 0,
    skipped: 0,
    committed: 0,
  };
}

/**
 * Handles normalize count.
 */
function normalizeCount(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
}

/**
 * Creates realtime write metrics.
 */
export function createRealtimeWriteMetrics(): RealtimeWriteMetricsCollector {
  const counters = WRITE_CHANNELS.reduce(
    (result, channel) => {
      result[channel] = createEmptyCounters();
      return result;
    },
    {} as Record<RealtimeWriteChannel, RealtimeWriteCounters>,
  );

  /**
   * Handles mark.
   */
  const mark = (
    channel: RealtimeWriteChannel,
    metricKind: RealtimeWriteMetricKind,
    count = 1,
  ) => {
    counters[channel][metricKind] += normalizeCount(count);
  };

  /**
   * Handles snapshot.
   */
  const snapshot = (): RealtimeWriteMetricsSnapshot => {
    const channels = WRITE_CHANNELS.reduce(
      (result, channel) => {
        result[channel] = {
          attempted: counters[channel].attempted,
          skipped: counters[channel].skipped,
          committed: counters[channel].committed,
        };
        return result;
      },
      {} as Record<RealtimeWriteChannel, RealtimeWriteCounters>,
    );

    const totals = WRITE_CHANNELS.reduce((result, channel) => {
      result.attempted += channels[channel].attempted;
      result.skipped += channels[channel].skipped;
      result.committed += channels[channel].committed;
      return result;
    }, createEmptyCounters());

    return {
      capturedAt: new Date().toISOString(),
      channels,
      totals,
    };
  };

  /**
   * Handles reset.
   */
  const reset = () => {
    WRITE_CHANNELS.forEach((channel) => {
      counters[channel] = createEmptyCounters();
    });
  };

  return {
    markAttempted: (channel, count) => mark(channel, "attempted", count),
    markSkipped: (channel, count) => mark(channel, "skipped", count),
    markCommitted: (channel, count) => mark(channel, "committed", count),
    snapshot,
    reset,
  };
}

/**
 * Returns whether write metrics debug enabled is true.
 */
export function isWriteMetricsDebugEnabled(
  flag = process.env.NEXT_PUBLIC_DEBUG_WRITE_METRICS,
): boolean {
  return flag === "1";
}
