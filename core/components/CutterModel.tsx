import type { ToolProfile } from "../simulation/types";
import { resolveVBitGeometry } from "../simulation/stock-removal-coordinates";

type CutterModelProps = {
  tool: ToolProfile;
  minimumLength: number;
  color: string;
  segments?: number;
};

export function resolveCutterModelLength(
  tool: ToolProfile,
  minimumLength: number,
): number {
  if (tool.type !== "vbit") return minimumLength;
  return Math.max(
    minimumLength,
    resolveVBitGeometry(tool).taperHeight + Math.max(8, tool.diameter),
  );
}

/**
 * Shared physical cutter model. Its tip is always at local Y=0 and the body
 * extends toward +Y, so Solid and Machine views cannot drift geometrically.
 */
export function CutterModel({
  tool,
  minimumLength,
  color,
  segments = 32,
}: CutterModelProps) {
  const diameter = Math.max(0.1, tool.diameter);
  const radius = diameter / 2;
  const length = resolveCutterModelLength(tool, minimumLength);
  const material = (
    <meshStandardMaterial
      color={color}
      metalness={0.92}
      roughness={0.16}
    />
  );

  if (tool.type === "vbit") {
    const geometry = resolveVBitGeometry(tool);
    const taperHeight = Math.max(0.001, geometry.taperHeight);
    const shankHeight = Math.max(0.001, length - taperHeight);
    return (
      <group>
        <mesh position={[0, taperHeight / 2, 0]} castShadow>
          <cylinderGeometry
            args={[
              geometry.radius,
              geometry.tipRadius,
              taperHeight,
              segments,
            ]}
          />
          {material}
        </mesh>
        <mesh position={[0, taperHeight + shankHeight / 2, 0]} castShadow>
          <cylinderGeometry
            args={[geometry.radius, geometry.radius, shankHeight, segments]}
          />
          {material}
        </mesh>
      </group>
    );
  }

  if (tool.type === "ball") {
    const shaftHeight = Math.max(0.001, length - radius);
    return (
      <group>
        <mesh position={[0, radius, 0]} castShadow>
          <sphereGeometry args={[radius, segments, Math.max(12, segments / 2)]} />
          {material}
        </mesh>
        <mesh position={[0, radius + shaftHeight / 2, 0]} castShadow>
          <cylinderGeometry args={[radius, radius, shaftHeight, segments]} />
          {material}
        </mesh>
      </group>
    );
  }

  return (
    <mesh position={[0, length / 2, 0]} castShadow>
      <cylinderGeometry args={[radius, radius, length, segments]} />
      {material}
    </mesh>
  );
}
