import type { Vec3 } from "../gcode/types";
import type { StockSettings, ToolProfile } from "./types";

export type StockZBounds = {
  topZ: number;
  bottomZ: number;
};

export type CutterContactBand = {
  /** Diameter of the swept disk at this cutter-profile height, in mm. */
  diameter: number;
  /** Resulting stock surface Z for this band. */
  z: number;
};

const POINT_EPSILON = 1e-9;
const DEFAULT_PROFILE_BANDS = 12;

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function pointDistance(left: Vec3, right: Vec3): number {
  return Math.hypot(
    right.x - left.x,
    right.y - left.y,
    right.z - left.z,
  );
}

function interpolatePoint(left: Vec3, right: Vec3, ratio: number): Vec3 {
  return {
    x: left.x + (right.x - left.x) * ratio,
    y: left.y + (right.y - left.y) * ratio,
    z: left.z + (right.z - left.z) * ratio,
  };
}

function sampledPathMetrics(points: readonly Vec3[]): {
  cumulative: number[];
  total: number;
} {
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(
      cumulative[index - 1] + pointDistance(points[index - 1], points[index]),
    );
  }
  return { cumulative, total: cumulative[cumulative.length - 1] ?? 0 };
}

function pointAtSampledDistance(
  points: readonly Vec3[],
  cumulative: readonly number[],
  total: number,
  distance: number,
): Vec3 {
  if (distance <= 0) return { ...points[0] };
  if (distance >= total) return { ...points[points.length - 1] };

  for (let index = 1; index < cumulative.length; index += 1) {
    if (distance > cumulative[index]) continue;
    const edgeLength = cumulative[index] - cumulative[index - 1];
    const ratio = edgeLength <= POINT_EPSILON
      ? 0
      : clampProgress(
          (distance - cumulative[index - 1]) / edgeLength,
        );
    return interpolatePoint(points[index - 1], points[index], ratio);
  }
  return { ...points[points.length - 1] };
}

/**
 * Resolves playback progress against the sampled polyline itself. Arc length
 * stored on a segment is analytic and is slightly longer than its chord
 * samples, so using it here can overshoot the final sampled point.
 */
export function pointAtToolpathProgress(
  points: readonly Vec3[],
  progress: number,
): Vec3 {
  if (points.length === 0) return { x: 0, y: 0, z: 0 };
  if (points.length === 1) return { ...points[0] };

  const { cumulative, total } = sampledPathMetrics(points);
  if (total <= POINT_EPSILON) return { ...points[points.length - 1] };
  return pointAtSampledDistance(
    points,
    cumulative,
    total,
    clampProgress(progress) * total,
  );
}

/**
 * Position of the CNC-coordinate overlay inside the stock's centered Three.js
 * group. The stock group is already raised by thickness / 2, so the CNC Z
 * midpoint must be translated with the opposite sign.
 */
export function resolveSolidOverlayPosition(
  stock: StockSettings,
  bounds: StockZBounds,
): [number, number, number] {
  const centerZ = (bounds.topZ + bounds.bottomZ) / 2;
  return [
    -(stock.originX + stock.width / 2),
    -centerZ,
    stock.originY + stock.height / 2,
  ];
}

/** Maps a programmed CNC point to the world axes used by SolidSimulator. */
export function mapCncPointToSolidWorld(
  point: Vec3,
  stock: StockSettings,
  bounds: StockZBounds,
): Vec3 {
  const [offsetX, offsetY, offsetZ] = resolveSolidOverlayPosition(
    stock,
    bounds,
  );
  return {
    x: offsetX + point.x,
    y: stock.thickness / 2 + offsetY + point.z,
    z: offsetZ - point.y,
  };
}

/** Maps CNC XY coordinates to the displacement texture pixel coordinates. */
export function mapCncPointToStockTexture(
  point: Pick<Vec3, "x" | "y">,
  stock: StockSettings,
  resolution: number,
): { x: number; y: number } {
  const width = Math.max(1e-6, stock.width);
  const height = Math.max(1e-6, stock.height);
  return {
    x: ((point.x - stock.originX) / width) * resolution,
    y:
      resolution -
      ((point.y - stock.originY) / height) * resolution,
  };
}

/**
 * Extracts a progress range from a sampled toolpath. Curves therefore remain
 * curves during partial playback instead of being replaced by a straight
 * chord from the arc start to the current point.
 */
export function sliceToolpathPoints(
  points: readonly Vec3[],
  startProgress: number,
  endProgress: number,
): Vec3[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [{ ...points[0] }];

  const start = clampProgress(startProgress);
  const end = clampProgress(endProgress);
  if (end <= start) return [];

  const { cumulative, total } = sampledPathMetrics(points);
  if (total <= POINT_EPSILON) return [{ ...points[points.length - 1] }];

  const startDistance = start * total;
  const endDistance = end * total;
  const sliced = [
    pointAtSampledDistance(points, cumulative, total, startDistance),
  ];
  for (let index = 1; index < points.length - 1; index += 1) {
    if (
      cumulative[index] > startDistance + POINT_EPSILON &&
      cumulative[index] < endDistance - POINT_EPSILON
    ) {
      sliced.push({ ...points[index] });
    }
  }
  const finalPoint = pointAtSampledDistance(
    points,
    cumulative,
    total,
    endDistance,
  );
  if (pointDistance(sliced[sliced.length - 1], finalPoint) > POINT_EPSILON) {
    sliced.push(finalPoint);
  }
  return sliced;
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > POINT_EPSILON ? value : fallback;
}

function clampCutZ(z: number, bounds: StockZBounds): number {
  return Math.max(bounds.bottomZ, Math.min(bounds.topZ, z));
}

function cutterProfileHeight(tool: ToolProfile, radius: number): number {
  const cutterRadius = finitePositive(tool.diameter, 1) / 2;
  const clampedRadius = Math.max(0, Math.min(cutterRadius, radius));

  if (tool.type === "ball") {
    return cutterRadius - Math.sqrt(
      Math.max(0, cutterRadius ** 2 - clampedRadius ** 2),
    );
  }
  if (tool.type === "vbit") {
    const angle = Math.max(1, Math.min(179, tool.angle ?? 90));
    return clampedRadius / Math.tan((angle * Math.PI) / 360);
  }
  return 0;
}

/**
 * Width of the cutter that actually intersects the stock surface. Flat mills
 * engage their full diameter immediately; ball noses and V-bits widen with
 * penetration depth and are capped by the configured cutter diameter.
 */
export function resolveCutterContactDiameter(
  tool: ToolProfile,
  tipZ: number,
  bounds: StockZBounds,
): number {
  const diameter = finitePositive(tool.diameter, 1);
  const cutterRadius = diameter / 2;
  const penetration = bounds.topZ - tipZ;
  if (!Number.isFinite(tipZ) || penetration < -POINT_EPSILON) return 0;
  if (tool.type === "flat") return diameter;
  if (penetration <= POINT_EPSILON) return 0;

  if (tool.type === "ball") {
    if (penetration >= cutterRadius) return diameter;
    return 2 * Math.sqrt(
      Math.max(0, 2 * cutterRadius * penetration - penetration ** 2),
    );
  }

  const angle = Math.max(1, Math.min(179, tool.angle ?? 90));
  const contactRadius = penetration * Math.tan((angle * Math.PI) / 360);
  return 2 * Math.min(cutterRadius, Math.max(0, contactRadius));
}

/**
 * Builds concentric cutter-profile bands for the displacement map. Painting
 * the widest/shallowest band first and progressively narrower/deeper bands
 * approximates the curved bottom of a ball mill and the angled wall of a
 * V-bit instead of treating every cutter as a flat full-diameter cylinder.
 */
export function buildCutterContactBands(
  tool: ToolProfile,
  tipZ: number,
  bounds: StockZBounds,
  requestedBandCount = DEFAULT_PROFILE_BANDS,
): CutterContactBand[] {
  const contactDiameter = resolveCutterContactDiameter(tool, tipZ, bounds);
  if (contactDiameter <= POINT_EPSILON) return [];
  if (tool.type === "flat") {
    return [{ diameter: contactDiameter, z: clampCutZ(tipZ, bounds) }];
  }

  const bandCount = Math.max(2, Math.min(32, Math.round(requestedBandCount)));
  const contactRadius = contactDiameter / 2;
  const bands: CutterContactBand[] = [];
  for (let band = bandCount; band >= 1; band -= 1) {
    const radius = contactRadius * (band / bandCount);
    const profileZ = tipZ + cutterProfileHeight(tool, radius);
    bands.push({
      diameter: radius * 2,
      z: clampCutZ(profileZ, bounds),
    });
  }
  return bands;
}

export function normalizeToolId(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().replace(/^T\s*/i, "");
  return /^\d+$/.test(normalized)
    ? String(Number.parseInt(normalized, 10))
    : normalized.toUpperCase();
}

export function resolveSegmentTool(
  stock: StockSettings,
  segmentTool: string | null | undefined,
): ToolProfile | undefined {
  const requested = normalizeToolId(segmentTool);
  return (
    stock.tools?.find(
      (tool) => normalizeToolId(tool.id) === requested,
    ) ?? stock.tools?.[0]
  );
}

export function stockRemovalRenderKey(
  stock: StockSettings,
  resolution: number,
  bounds: StockZBounds,
): string {
  const tools = (stock.tools ?? [])
    .map(
      (tool) =>
        `${normalizeToolId(tool.id)}:${tool.diameter}:${tool.type}:${tool.angle ?? ""}`,
    )
    .join(",");
  return [
    resolution,
    stock.width,
    stock.height,
    stock.thickness,
    stock.originX,
    stock.originY,
    stock.toolDiameter,
    bounds.topZ,
    bounds.bottomZ,
    tools,
  ].join("|");
}

export function depthIntensity(
  z: number,
  bounds: StockZBounds,
): number {
  const range = Math.max(0.01, bounds.topZ - bounds.bottomZ);
  const ratio = (z - bounds.bottomZ) / range;
  return Math.round(Math.max(0, Math.min(1, ratio)) * 255);
}
