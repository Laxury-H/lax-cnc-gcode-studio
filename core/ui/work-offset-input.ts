import type { Axis, CoordinateSystem, Vec3 } from "../gcode/types";

export const MAX_WORK_OFFSET_INPUT = 1_000_000;

const COORDINATE_SYSTEMS = [
  "G54",
  "G55",
  "G56",
  "G57",
  "G58",
  "G59",
] as const satisfies readonly CoordinateSystem[];

const AXES = ["x", "y", "z"] as const satisfies readonly Axis[];

export type WorkOffsetInputDraft = Record<
  CoordinateSystem,
  Record<Axis, string>
>;

export function createWorkOffsetInputDraft(
  workOffsets: Record<CoordinateSystem, Vec3>,
): WorkOffsetInputDraft {
  return Object.fromEntries(
    COORDINATE_SYSTEMS.map((coordinateSystem) => [
      coordinateSystem,
      Object.fromEntries(
        AXES.map((axis) => [axis, String(workOffsets[coordinateSystem][axis])]),
      ),
    ]),
  ) as WorkOffsetInputDraft;
}

/**
 * Parses a completed offset field without interfering with intermediate text
 * such as "-", "1." or "-0," while the operator is still typing.
 */
export function parseWorkOffsetInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(
      normalized,
    )
  ) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > MAX_WORK_OFFSET_INPUT) {
    return null;
  }
  return Object.is(parsed, -0) ? 0 : parsed;
}

export function parseWorkOffsetInputDraft(
  draft: WorkOffsetInputDraft,
): Record<CoordinateSystem, Vec3> | null {
  const parsed = {} as Record<CoordinateSystem, Vec3>;
  for (const coordinateSystem of COORDINATE_SYSTEMS) {
    const vector = {} as Vec3;
    for (const axis of AXES) {
      const value = parseWorkOffsetInput(draft[coordinateSystem][axis]);
      if (value === null) return null;
      vector[axis] = value;
    }
    parsed[coordinateSystem] = vector;
  }
  return parsed;
}
