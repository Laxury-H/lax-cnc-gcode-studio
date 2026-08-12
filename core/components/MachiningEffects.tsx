import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type MachiningEffectsProps = {
  position: [number, number, number];
  active: boolean;
  toolDiameter: number;
  quality?: "low" | "medium" | "high";
};

type ChipSeed = {
  angle: number;
  phase: number;
  radius: number;
  speed: number;
  lift: number;
};

const CHIP_COUNTS = {
  low: 10,
  medium: 24,
  high: 42,
} as const;

/**
 * Small deterministic chip cloud shown only while the cutter intersects the
 * stock. It deliberately avoids random state so playback, scrubbing and tests
 * remain repeatable.
 */
export function MachiningEffects({
  position,
  active,
  toolDiameter,
  quality = "medium",
}: MachiningEffectsProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const count = CHIP_COUNTS[quality];
  const safeDiameter = Math.max(0.5, toolDiameter);
  const seeds = useMemo<ChipSeed[]>(
    () =>
      Array.from({ length: count }, (_, index) => {
        const normalized = (index + 0.5) / count;
        return {
          angle: normalized * Math.PI * 8.73,
          phase: (normalized * 3.17) % 1,
          radius: 0.55 + ((index * 37) % 17) / 20,
          speed: 0.8 + ((index * 19) % 13) / 10,
          lift: 0.7 + ((index * 29) % 11) / 8,
        };
      }),
    [count],
  );
  const geometry = useMemo(() => {
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(count * 3), 3),
    );
    return result;
  }, [count]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    if (!active || !pointsRef.current) return;
    const time = clock.elapsedTime;
    const attribute = pointsRef.current.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    for (let index = 0; index < count; index += 1) {
      const seed = seeds[index];
      const phase = (time * seed.speed + seed.phase) % 1;
      const radius = safeDiameter * seed.radius * (0.35 + phase * 1.8);
      attribute.setXYZ(
        index,
        Math.cos(seed.angle + time * 2.1) * radius,
        Math.sin(seed.angle + time * 2.1) * radius,
        safeDiameter * (0.15 + phase * seed.lift * 2.2),
      );
    }
    attribute.needsUpdate = true;
  });

  if (!active) return null;

  return (
    <group position={position}>
      <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
        <pointsMaterial
          color="#f2c57f"
          size={Math.max(0.35, safeDiameter * 0.14)}
          sizeAttenuation
          transparent
          opacity={0.82}
          depthWrite={false}
        />
      </points>
      <mesh position={[0, 0, 0.025]}>
        <ringGeometry
          args={[
            Math.max(0.25, safeDiameter * 0.42),
            Math.max(0.5, safeDiameter * 0.78),
            32,
          ]}
        />
        <meshBasicMaterial
          color="#d8a35d"
          transparent
          opacity={0.16}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
