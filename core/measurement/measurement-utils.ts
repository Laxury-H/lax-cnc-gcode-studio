import type { Segment, Simulation, StockSettings } from "../simulation/types";

export type MeasurementPoint = {
  x: number;
  y: number;
  z: number;
};

export type MeasurementConstraint = "free" | "x" | "y" | "z" | "xy";

export type SnapKind =
  | "endpoint"
  | "midpoint"
  | "center"
  | "corner"
  | "free";

export type SnapCandidate = {
  id: string;
  point: MeasurementPoint;
  kind: SnapKind;
  label: string;
  priority: number;
};

export type MeasurementSource = "manual" | "stock" | "part";

export interface MeasurementResult {
  id: string;
  label: string;
  start: MeasurementPoint;
  end: MeasurementPoint;
  distance: number;
  delta: MeasurementPoint;
  horizontal: number;
  angleXYDegrees: number;
  inclinationDegrees: number;
  source: MeasurementSource;
}

export interface MeasurementPreset extends MeasurementResult {
  source: "stock" | "part";
}

export type CalculateMeasurementOptions = {
  id?: string;
  label?: string;
  source?: MeasurementSource;
};

export type StockZBounds = {
  topZ: number;
  bottomZ: number;
};

const COORDINATE_PRECISION = 6;
const TOOLPATH_ENDPOINT_PRIORITY = 90;
const TOOLPATH_CENTER_PRIORITY = 80;
const TOOLPATH_MIDPOINT_PRIORITY = 60;
const PART_CORNER_PRIORITY = 110;
const STOCK_CORNER_PRIORITY = 100;
const PART_CENTER_PRIORITY = 75;
const STOCK_CENTER_PRIORITY = 70;
const DIRECTION_EPSILON_MM = 0.0005;

function clonePoint(point: MeasurementPoint): MeasurementPoint {
  return { x: point.x, y: point.y, z: point.z };
}

function isFinitePoint(point: MeasurementPoint): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z)
  );
}

function assertFiniteMeasurementPoints(
  start: MeasurementPoint,
  target: MeasurementPoint,
): void {
  if (!isFinitePoint(start) || !isFinitePoint(target)) {
    throw new TypeError("Measurement points must contain finite X, Y and Z coordinates.");
  }
}

export function resolveStockZBounds(
  simulation: Simulation,
  stock: StockSettings,
): StockZBounds {
  const automaticBottomZero = simulation.bounds.minZ >= -0.1;
  const isBottomZero =
    stock.zZero === "bottom" ||
    (stock.zZero !== "top" && automaticBottomZero);
  return isBottomZero
    ? { topZ: stock.thickness, bottomZ: 0 }
    : { topZ: 0, bottomZ: -stock.thickness };
}

export function constrainMeasurementPoint(
  start: MeasurementPoint,
  target: MeasurementPoint,
  constraint: MeasurementConstraint,
): MeasurementPoint {
  assertFiniteMeasurementPoints(start, target);

  switch (constraint) {
    case "free":
      return clonePoint(target);
    case "x":
      return { x: target.x, y: start.y, z: start.z };
    case "y":
      return { x: start.x, y: target.y, z: start.z };
    case "z":
      return { x: start.x, y: start.y, z: target.z };
    case "xy":
      return { x: target.x, y: target.y, z: start.z };
    default:
      throw new TypeError(`Unsupported measurement constraint: ${String(constraint)}`);
  }
}

export function calculateWorkOrigin(
  machinePosition: MeasurementPoint,
  workPosition: MeasurementPoint,
): MeasurementPoint {
  assertFiniteMeasurementPoints(machinePosition, workPosition);
  return {
    x: machinePosition.x - workPosition.x,
    y: machinePosition.y - workPosition.y,
    z: machinePosition.z - workPosition.z,
  };
}

function coordinateToken(value: number): string {
  const normalized = Object.is(value, -0) ? 0 : value;
  return normalized.toFixed(COORDINATE_PRECISION);
}

function coordinateKey(point: MeasurementPoint): string {
  return [point.x, point.y, point.z].map(coordinateToken).join(":");
}

function distanceBetween(a: MeasurementPoint, b: MeasurementPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function midpointAlongSegment(segment: Segment): MeasurementPoint {
  const path = segment.points.length >= 2
    ? segment.points
    : [segment.start, segment.end];
  let pathLength = 0;

  for (let index = 1; index < path.length; index += 1) {
    pathLength += distanceBetween(path[index - 1], path[index]);
  }

  if (pathLength <= Number.EPSILON) {
    return {
      x: (segment.start.x + segment.end.x) / 2,
      y: (segment.start.y + segment.end.y) / 2,
      z: (segment.start.z + segment.end.z) / 2,
    };
  }

  let remaining = pathLength / 2;
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const sectionLength = distanceBetween(start, end);
    if (remaining <= sectionLength || index === path.length - 1) {
      const ratio = sectionLength <= Number.EPSILON
        ? 0
        : Math.min(1, remaining / sectionLength);
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
        z: start.z + (end.z - start.z) * ratio,
      };
    }
    remaining -= sectionLength;
  }

  return clonePoint(segment.end);
}

function addCandidate(
  candidates: Map<string, SnapCandidate>,
  candidate: SnapCandidate,
): void {
  if (!isFinitePoint(candidate.point)) return;

  const key = coordinateKey(candidate.point);
  const existing = candidates.get(key);
  if (!existing || candidate.priority > existing.priority) {
    candidates.set(key, {
      ...candidate,
      point: clonePoint(candidate.point),
    });
  }
}

function addCornersAndCenter(
  candidates: Map<string, SnapCandidate>,
  options: {
    idPrefix: string;
    labelPrefix: string;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    z: number;
    cornerPriority: number;
    centerPriority: number;
  },
): void {
  const corners = [
    ["min-x-min-y", "Góc trái dưới", options.minX, options.minY],
    ["max-x-min-y", "Góc phải dưới", options.maxX, options.minY],
    ["max-x-max-y", "Góc phải trên", options.maxX, options.maxY],
    ["min-x-max-y", "Góc trái trên", options.minX, options.maxY],
  ] as const;

  for (const [suffix, label, x, y] of corners) {
    addCandidate(candidates, {
      id: `${options.idPrefix}:corner:${suffix}`,
      point: { x, y, z: options.z },
      kind: "corner",
      label: `${options.labelPrefix} · ${label}`,
      priority: options.cornerPriority,
    });
  }

  addCandidate(candidates, {
    id: `${options.idPrefix}:center`,
    point: {
      x: (options.minX + options.maxX) / 2,
      y: (options.minY + options.maxY) / 2,
      z: options.z,
    },
    kind: "center",
    label: `${options.labelPrefix} · Tâm`,
    priority: options.centerPriority,
  });
}

export function buildMeasurementSnapCandidates(
  simulation: Simulation,
  stock: StockSettings,
  topZ: number,
): SnapCandidate[] {
  const candidates = new Map<string, SnapCandidate>();

  for (const segment of simulation.segments) {
    if (segment.kind === "rapid" || segment.kind === "dwell") continue;

    addCandidate(candidates, {
      id: `segment:${segment.id}:start`,
      point: segment.start,
      kind: "endpoint",
      label: `Đường chạy ${segment.id} · Điểm đầu`,
      priority: TOOLPATH_ENDPOINT_PRIORITY,
    });
    addCandidate(candidates, {
      id: `segment:${segment.id}:end`,
      point: segment.end,
      kind: "endpoint",
      label: `Đường chạy ${segment.id} · Điểm cuối`,
      priority: TOOLPATH_ENDPOINT_PRIORITY,
    });
    addCandidate(candidates, {
      id: `segment:${segment.id}:midpoint`,
      point: midpointAlongSegment(segment),
      kind: "midpoint",
      label: `Đường chạy ${segment.id} · Trung điểm`,
      priority: TOOLPATH_MIDPOINT_PRIORITY,
    });

    if (
      (segment.kind === "arc-cw" || segment.kind === "arc-ccw") &&
      segment.center
    ) {
      addCandidate(candidates, {
        id: `segment:${segment.id}:center`,
        point: segment.center,
        kind: "center",
        label: `Cung ${segment.id} · Tâm`,
        priority: TOOLPATH_CENTER_PRIORITY,
      });
    }
  }

  for (const part of simulation.parts) {
    addCornersAndCenter(candidates, {
      idPrefix: `part:${part.id}`,
      labelPrefix: `Chi tiết ${part.id}`,
      minX: part.minX,
      minY: part.minY,
      maxX: part.maxX,
      maxY: part.maxY,
      z: topZ,
      cornerPriority: PART_CORNER_PRIORITY,
      centerPriority: PART_CENTER_PRIORITY,
    });
  }

  addCornersAndCenter(candidates, {
    idPrefix: "stock",
    labelPrefix: "Phôi",
    minX: stock.originX,
    minY: stock.originY,
    maxX: stock.originX + stock.width,
    maxY: stock.originY + stock.height,
    z: topZ,
    cornerPriority: STOCK_CORNER_PRIORITY,
    centerPriority: STOCK_CENTER_PRIORITY,
  });

  return [...candidates.values()].sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
  );
}

export function calculateMeasurement(
  start: MeasurementPoint,
  end: MeasurementPoint,
  options: CalculateMeasurementOptions = {},
): MeasurementResult {
  assertFiniteMeasurementPoints(start, end);

  const safeStart = clonePoint(start);
  const safeEnd = clonePoint(end);
  const delta = {
    x: safeEnd.x - safeStart.x,
    y: safeEnd.y - safeStart.y,
    z: safeEnd.z - safeStart.z,
  };
  const horizontal = Math.hypot(delta.x, delta.y);
  const angleXYDegrees = horizontal < DIRECTION_EPSILON_MM
    ? 0
    : (Math.atan2(delta.y, delta.x) * 180) / Math.PI;
  const inclinationDegrees =
    (Math.atan2(delta.z, horizontal) * 180) / Math.PI;

  return {
    id: options.id ?? `measurement:${coordinateKey(safeStart)}:${coordinateKey(safeEnd)}`,
    label: options.label ?? "Đo khoảng cách",
    start: safeStart,
    end: safeEnd,
    distance: Math.hypot(delta.x, delta.y, delta.z),
    delta,
    horizontal,
    angleXYDegrees: Object.is(angleXYDegrees, -0) ? 0 : angleXYDegrees,
    inclinationDegrees: Object.is(inclinationDegrees, -0)
      ? 0
      : inclinationDegrees,
    source: options.source ?? "manual",
  };
}

function calculatePreset(
  start: MeasurementPoint,
  end: MeasurementPoint,
  options: {
    id: string;
    label: string;
    source: MeasurementPreset["source"];
  },
): MeasurementPreset {
  const result = calculateMeasurement(start, end, options);
  return { ...result, source: options.source };
}

export function buildAutomaticMeasurements(
  simulation: Simulation,
  stock: StockSettings,
  topZ: number,
): MeasurementPreset[] {
  const minX = stock.originX;
  const minY = stock.originY;
  const maxX = minX + stock.width;
  const maxY = minY + stock.height;
  const bottomZ = topZ - stock.thickness;
  const presets: MeasurementPreset[] = [
    calculatePreset(
      { x: minX, y: minY, z: topZ },
      { x: maxX, y: minY, z: topZ },
      { id: "stock:width", label: "Chiều rộng phôi", source: "stock" },
    ),
    calculatePreset(
      { x: minX, y: minY, z: topZ },
      { x: minX, y: maxY, z: topZ },
      { id: "stock:length", label: "Chiều dài phôi", source: "stock" },
    ),
    calculatePreset(
      { x: minX, y: minY, z: bottomZ },
      { x: minX, y: minY, z: topZ },
      { id: "stock:thickness", label: "Độ dày phôi", source: "stock" },
    ),
  ];

  for (const part of simulation.parts) {
    presets.push(
      calculatePreset(
        { x: part.minX, y: part.minY, z: topZ },
        { x: part.maxX, y: part.minY, z: topZ },
        {
          id: `part:${part.id}:width`,
          label: `${part.id} · Chiều rộng`,
          source: "part",
        },
      ),
      calculatePreset(
        { x: part.minX, y: part.minY, z: topZ },
        { x: part.minX, y: part.maxY, z: topZ },
        {
          id: `part:${part.id}:length`,
          label: `${part.id} · Chiều dài`,
          source: "part",
        },
      ),
    );
  }

  return presets;
}
