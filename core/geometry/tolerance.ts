import type { Vec3 } from "../gcode/types";

export type GeometryTolerance = Readonly<{
  absolute: number;
  relative: number;
}>;

export type ToleranceInput =
  | number
  | Partial<GeometryTolerance>
  | GeometryTolerance;

export const DEFAULT_GEOMETRY_TOLERANCE: GeometryTolerance = Object.freeze({
  absolute: 1e-9,
  relative: 1e-12,
});

export const DEFAULT_ARC_RADIUS_TOLERANCE: GeometryTolerance = Object.freeze({
  absolute: 1e-4,
  relative: 1e-6,
});

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isFiniteVec3(value: unknown): value is Vec3 {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const point = value as Partial<Vec3>;
  return (
    isFiniteNumber(point.x) &&
    isFiniteNumber(point.y) &&
    isFiniteNumber(point.z)
  );
}

export function assertFiniteNumber(
  value: unknown,
  label = "Giá trị",
): asserts value is number {
  if (!isFiniteNumber(value)) {
    throw new RangeError(`${label} phải là một số hữu hạn.`);
  }
}

export function assertFiniteVec3(
  value: unknown,
  label = "Điểm",
): asserts value is Vec3 {
  if (!isFiniteVec3(value)) {
    throw new RangeError(`${label} phải có tọa độ X, Y, Z hữu hạn.`);
  }
}

export function normalizeTolerance(
  input: ToleranceInput = DEFAULT_GEOMETRY_TOLERANCE,
): GeometryTolerance | null {
  if (typeof input === "number") {
    return isFiniteNumber(input) && input >= 0
      ? { absolute: input, relative: 0 }
      : null;
  }

  const absolute = input.absolute ?? DEFAULT_GEOMETRY_TOLERANCE.absolute;
  const relative = input.relative ?? DEFAULT_GEOMETRY_TOLERANCE.relative;
  if (
    !isFiniteNumber(absolute) ||
    absolute < 0 ||
    !isFiniteNumber(relative) ||
    relative < 0
  ) {
    return null;
  }

  return { absolute, relative };
}

export function nearlyEqual(
  left: number,
  right: number,
  tolerance: ToleranceInput = DEFAULT_GEOMETRY_TOLERANCE,
): boolean {
  if (!isFiniteNumber(left) || !isFiniteNumber(right)) {
    return false;
  }

  const normalized = normalizeTolerance(tolerance);
  if (!normalized) {
    return false;
  }

  const difference = Math.abs(left - right);
  const scale = Math.max(Math.abs(left), Math.abs(right));
  return (
    difference <= normalized.absolute ||
    difference <= normalized.relative * scale
  );
}

export function clampFinite(
  value: number,
  minimum: number,
  maximum: number,
): number {
  assertFiniteNumber(value);
  assertFiniteNumber(minimum, "Cận dưới");
  assertFiniteNumber(maximum, "Cận trên");
  if (minimum > maximum) {
    throw new RangeError("Cận dưới không được lớn hơn cận trên.");
  }

  return Math.min(maximum, Math.max(minimum, value));
}
