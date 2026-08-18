import { memo, useReducer, useRef } from "react";
import { ContactShadows } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";

import { shouldRenderFrame } from "../simulation/render-performance";

type BudgetedContactShadowsProps = {
  x?: number;
  y?: number;
  z?: number;
  scale: number;
  resolution: number;
  opacity: number;
  blur: number;
  far?: number;
  playing: boolean;
  refreshKey: string | null;
  frameIntervalMs: number;
};

/**
 * ContactShadows performs several extra scene passes. Keep its moving-machine
 * shadow, but refresh it at a quality-specific budget instead of every WebGL
 * frame. React.memo also prevents playback props outside this component from
 * resetting drei's one-frame counter.
 */
export const BudgetedContactShadows = memo(function BudgetedContactShadows({
  x = 0,
  y = 0,
  z = 0,
  scale,
  resolution,
  opacity,
  blur,
  far,
  playing,
  frameIntervalMs,
}: BudgetedContactShadowsProps) {
  const [, requestShadowFrame] = useReducer((revision: number) => revision + 1, 0);
  const lastShadowFrameRef = useRef(Number.NEGATIVE_INFINITY);

  useFrame(() => {
    if (!playing) return;
    const timestamp = performance.now();
    if (
      shouldRenderFrame(
        lastShadowFrameRef.current,
        timestamp,
        frameIntervalMs,
      )
    ) {
      lastShadowFrameRef.current = timestamp;
      requestShadowFrame();
    }
  });

  return (
    <ContactShadows
      frames={1}
      resolution={resolution}
      scale={scale}
      position={[x, y, z]}
      opacity={opacity}
      blur={blur}
      far={far}
    />
  );
});
