import { useEffect, useState } from "react";

const FPS_SAMPLE_WINDOW_MS = 500;

export function useFpsMeter(): number {
  const [fps, setFps] = useState(60);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let frameCount = 0;
    let windowStart = performance.now();
    let rafId = 0;

    const tick = (timestamp: number) => {
      frameCount += 1;
      const elapsed = timestamp - windowStart;
      if (elapsed >= FPS_SAMPLE_WINDOW_MS) {
        const measuredFps = Math.round((frameCount * 1000) / elapsed);
        setFps(measuredFps);
        frameCount = 0;
        windowStart = timestamp;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return fps;
}
