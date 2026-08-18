import { useCallback, useEffect, useRef } from "react";
import { PerformanceMonitor } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";

import {
  renderPerformanceProfile,
  shouldRenderFrame,
  type RenderQuality,
} from "../simulation/render-performance";

type AdaptiveSimulationDprProps = {
  quality: RenderQuality;
  playing: boolean;
  cursor: number;
  segmentProgress: number;
};

export function AdaptiveSimulationDpr({
  quality,
  playing,
  cursor,
  segmentProgress,
}: AdaptiveSimulationDprProps) {
  const setDpr = useThree((state) => state.setDpr);
  const gl = useThree((state) => state.gl);
  const profile = renderPerformanceProfile(quality);
  const rendererRef = useRef(gl);
  const lastShadowFrameRef = useRef(Number.NEGATIVE_INFINITY);

  const applyFactor = useCallback(
    (factor: number) => {
      const deviceDpr = window.devicePixelRatio || 1;
      const maximum =
        quality === "high"
          ? profile.dpr[1]
          : Math.min(deviceDpr, profile.dpr[1]);
      const minimum = Math.min(maximum, profile.dpr[0]);
      const safeFactor = Math.max(0, Math.min(1, factor));
      setDpr(minimum + (maximum - minimum) * safeFactor);
    },
    [profile, quality, setDpr],
  );

  useEffect(() => applyFactor(1), [applyFactor]);

  useEffect(() => {
    rendererRef.current = gl;
    const shadowMap = rendererRef.current.shadowMap;
    const previousAutoUpdate = shadowMap.autoUpdate;
    shadowMap.autoUpdate = false;
    shadowMap.needsUpdate = true;
    return () => {
      shadowMap.autoUpdate = previousAutoUpdate;
      shadowMap.needsUpdate = true;
    };
  }, [gl]);

  useEffect(() => {
    if (!playing) rendererRef.current.shadowMap.needsUpdate = true;
  }, [cursor, playing, segmentProgress]);

  useFrame(() => {
    if (!playing) return;
    const timestamp = performance.now();
    if (
      shouldRenderFrame(
        lastShadowFrameRef.current,
        timestamp,
        profile.stockTextureFrameIntervalMs,
      )
    ) {
      lastShadowFrameRef.current = timestamp;
      rendererRef.current.shadowMap.needsUpdate = true;
    }
  });

  return quality === "high" ? null : (
    <PerformanceMonitor
      factor={1}
      flipflops={4}
      onChange={({ factor }) => applyFactor(factor)}
      onFallback={() => applyFactor(0)}
    />
  );
}
