import type { Plane, Vec3 } from "../gcode/types";
import {
  assertFiniteNumber,
  assertFiniteVec3,
  isFiniteNumber,
  nearlyEqual,
  type ToleranceInput,
} from "./tolerance";

export function cloneVec3(point: Vec3): Vec3 {
  assertFiniteVec3(point);
  return { x: point.x, y: point.y, z: point.z };
}

export function addVec3(left: Vec3, right: Vec3): Vec3 {
  assertFiniteVec3(left, "Điểm thứ nhất");
  assertFiniteVec3(right, "Điểm thứ hai");
  return finiteResult(
    {
      x: left.x + right.x,
      y: left.y + right.y,
      z: left.z + right.z,
    },
    "Tổng hai vector",
  );
}

export function subtractVec3(left: Vec3, right: Vec3): Vec3 {
  assertFiniteVec3(left, "Điểm thứ nhất");
  assertFiniteVec3(right, "Điểm thứ hai");
  return finiteResult(
    {
      x: left.x - right.x,
      y: left.y - right.y,
      z: left.z - right.z,
    },
    "Hiệu hai vector",
  );
}

export function scaleVec3(point: Vec3, factor: number): Vec3 {
  assertFiniteVec3(point);
  assertFiniteNumber(factor, "Hệ số");
  return finiteResult(
    {
      x: point.x * factor,
      y: point.y * factor,
      z: point.z * factor,
    },
    "Vector sau khi nhân",
  );
}

export function lerpVec3(start: Vec3, end: Vec3, ratio: number): Vec3 {
  assertFiniteVec3(start, "Điểm đầu");
  assertFiniteVec3(end, "Điểm cuối");
  assertFiniteNumber(ratio, "Tỷ lệ nội suy");

  // Dạng này tránh tràn số do tính (end - start) trước khi nhân.
  const inverse = 1 - ratio;
  return finiteResult(
    {
      x: inverse * start.x + ratio * end.x,
      y: inverse * start.y + ratio * end.y,
      z: inverse * start.z + ratio * end.z,
    },
    "Điểm nội suy",
  );
}

export function distance3D(start: Vec3, end: Vec3): number {
  assertFiniteVec3(start, "Điểm đầu");
  assertFiniteVec3(end, "Điểm cuối");
  return finiteDistance(
    Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z),
  );
}

export function distance2D(
  start: Vec3,
  end: Vec3,
  plane: Plane = "XY",
): number {
  assertFiniteVec3(start, "Điểm đầu");
  assertFiniteVec3(end, "Điểm cuối");

  switch (plane) {
    case "XY":
      return finiteDistance(Math.hypot(end.x - start.x, end.y - start.y));
    case "XZ":
      return finiteDistance(Math.hypot(end.z - start.z, end.x - start.x));
    case "YZ":
      return finiteDistance(Math.hypot(end.y - start.y, end.z - start.z));
  }
}

export function polylineLength(
  points: readonly Vec3[],
  closePath = false,
): number {
  if (points.length === 0) {
    return 0;
  }

  points.forEach((point, index) =>
    assertFiniteVec3(point, `Điểm thứ ${index + 1}`),
  );

  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance3D(points[index - 1], points[index]);
    if (!isFiniteNumber(total)) {
      throw new RangeError("Chiều dài đường gấp khúc vượt giới hạn số hữu hạn.");
    }
  }

  if (closePath && points.length > 1) {
    total += distance3D(points[points.length - 1], points[0]);
    if (!isFiniteNumber(total)) {
      throw new RangeError("Chiều dài đường gấp khúc vượt giới hạn số hữu hạn.");
    }
  }

  return total;
}

export function sameVec3(
  left: Vec3,
  right: Vec3,
  tolerance?: ToleranceInput,
): boolean {
  return (
    nearlyEqual(left.x, right.x, tolerance) &&
    nearlyEqual(left.y, right.y, tolerance) &&
    nearlyEqual(left.z, right.z, tolerance)
  );
}

function finiteDistance(value: number): number {
  if (!isFiniteNumber(value)) {
    throw new RangeError("Khoảng cách vượt giới hạn số hữu hạn.");
  }
  return value;
}

function finiteResult(point: Vec3, label: string): Vec3 {
  if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y) || !isFiniteNumber(point.z)) {
    throw new RangeError(`${label} vượt giới hạn số hữu hạn.`);
  }
  return point;
}
