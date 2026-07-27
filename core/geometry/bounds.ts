import type { Bounds3, Vec3 } from "../gcode/types";
import { assertFiniteVec3, isFiniteNumber } from "./tolerance";

/**
 * Bounds hữu hạn dùng cho tập điểm rỗng. Gốc tọa độ là fallback an toàn hơn
 * một sentinel chứa Infinity vì kết quả có thể đi thẳng sang camera/renderer.
 */
export const EMPTY_BOUNDS3: Readonly<Bounds3> = Object.freeze({
  minX: 0,
  minY: 0,
  minZ: 0,
  maxX: 0,
  maxY: 0,
  maxZ: 0,
});

export function boundsForPoint(point: Vec3): Bounds3 {
  assertFiniteVec3(point);
  return {
    minX: point.x,
    minY: point.y,
    minZ: point.z,
    maxX: point.x,
    maxY: point.y,
    maxZ: point.z,
  };
}

export function boundsForPoints(points: Iterable<Vec3>): Bounds3 {
  let bounds: Bounds3 | null = null;
  let index = 0;

  for (const point of points) {
    assertFiniteVec3(point, `Điểm thứ ${index + 1}`);
    bounds = bounds ? includePoint(bounds, point) : boundsForPoint(point);
    index += 1;
  }

  return bounds ?? { ...EMPTY_BOUNDS3 };
}

export function includePoint(bounds: Bounds3, point: Vec3): Bounds3 {
  assertFiniteBounds3(bounds);
  assertFiniteVec3(point);
  return {
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    minZ: Math.min(bounds.minZ, point.z),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
    maxZ: Math.max(bounds.maxZ, point.z),
  };
}

export function mergeBounds(
  first: Bounds3 | null,
  second: Bounds3 | null,
): Bounds3 | null {
  if (!first) {
    return second ? cloneBounds(second) : null;
  }
  if (!second) {
    return cloneBounds(first);
  }

  assertFiniteBounds3(first);
  assertFiniteBounds3(second);
  return {
    minX: Math.min(first.minX, second.minX),
    minY: Math.min(first.minY, second.minY),
    minZ: Math.min(first.minZ, second.minZ),
    maxX: Math.max(first.maxX, second.maxX),
    maxY: Math.max(first.maxY, second.maxY),
    maxZ: Math.max(first.maxZ, second.maxZ),
  };
}

export function cloneBounds(bounds: Bounds3): Bounds3 {
  assertFiniteBounds3(bounds);
  return { ...bounds };
}

export function isFiniteBounds3(value: unknown): value is Bounds3 {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const bounds = value as Partial<Bounds3>;
  return (
    isFiniteNumber(bounds.minX) &&
    isFiniteNumber(bounds.minY) &&
    isFiniteNumber(bounds.minZ) &&
    isFiniteNumber(bounds.maxX) &&
    isFiniteNumber(bounds.maxY) &&
    isFiniteNumber(bounds.maxZ) &&
    bounds.minX <= bounds.maxX &&
    bounds.minY <= bounds.maxY &&
    bounds.minZ <= bounds.maxZ
  );
}

export function assertFiniteBounds3(
  value: unknown,
): asserts value is Bounds3 {
  if (!isFiniteBounds3(value)) {
    throw new RangeError(
      "Bounds phải hữu hạn và mỗi giá trị min không được lớn hơn max.",
    );
  }
}

export function boundsCenter(bounds: Bounds3): Vec3 {
  assertFiniteBounds3(bounds);
  return {
    x: bounds.minX / 2 + bounds.maxX / 2,
    y: bounds.minY / 2 + bounds.maxY / 2,
    z: bounds.minZ / 2 + bounds.maxZ / 2,
  };
}
