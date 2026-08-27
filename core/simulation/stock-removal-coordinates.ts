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

export type VBitGeometry = {
  diameter: number;
  radius: number;
  angle: number;
  halfAngleRadians: number;
  tipDiameter: number;
  tipRadius: number;
  taperHeight: number;
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

/**
 * Z plane used by the 3D toolpath guide. The actual cutter keeps its programmed
 * depth, while this guide is lifted just above the stock so deep paths remain
 * readable before material has been removed.
 */
export function resolveToolpathOverlayZ(
  stock: StockSettings,
  bounds: StockZBounds,
): number {
  const surfaceLift = Math.max(
    0.5,
    Math.min(1.2, stock.thickness * 0.04),
  );
  return bounds.topZ + surfaceLift;
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

/**
 * Resolves the physical cutting part of a V-bit. Both true pointed cutters
 * (tipDiameter = 0) and commercially common tipped-off engraving cutters are
 * represented by the same truncated-cone model.
 */
export function resolveVBitGeometry(tool: ToolProfile): VBitGeometry {
  const diameter = finitePositive(tool.diameter, 1);
  const radius = diameter / 2;
  const angle = Math.max(1, Math.min(179, tool.angle ?? 90));
  const halfAngleRadians = (angle * Math.PI) / 360;
  const requestedTipDiameter = Number.isFinite(tool.tipDiameter)
    ? Math.max(0, tool.tipDiameter ?? 0)
    : 0;
  const tipDiameter = Math.min(diameter, requestedTipDiameter);
  const tipRadius = tipDiameter / 2;
  return {
    diameter,
    radius,
    angle,
    halfAngleRadians,
    tipDiameter,
    tipRadius,
    taperHeight:
      (radius - tipRadius) / Math.max(POINT_EPSILON, Math.tan(halfAngleRadians)),
  };
}

export function resolveCutterProfileHeight(
  tool: ToolProfile,
  radius: number,
): number {
  const cutterRadius = finitePositive(tool.diameter, 1) / 2;
  const clampedRadius = Math.max(0, Math.min(cutterRadius, radius));

  if (tool.type === "ball") {
    return cutterRadius - Math.sqrt(
      Math.max(0, cutterRadius ** 2 - clampedRadius ** 2),
    );
  }
  if (tool.type === "vbit" || tool.type === "chamfer") {
    const geometry = resolveVBitGeometry(tool);
    return Math.max(0, clampedRadius - geometry.tipRadius) /
      Math.tan(geometry.halfAngleRadians);
  }
  if (tool.type === "bullnose") {
    const cr = Math.min(cutterRadius, finitePositive(tool.cornerRadius ?? 1, 1));
    const flatRadius = Math.max(0, cutterRadius - cr);
    if (clampedRadius <= flatRadius) return 0;
    const offset = clampedRadius - flatRadius;
    return cr - Math.sqrt(Math.max(0, cr ** 2 - offset ** 2));
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
  if (tool.type === "flat" || tool.type === "facemill") return diameter;
  if (penetration <= POINT_EPSILON) {
    if (tool.type === "vbit" || tool.type === "chamfer") {
      return resolveVBitGeometry(tool).tipDiameter;
    }
    return 0;
  }

  if (tool.type === "ball") {
    if (penetration >= cutterRadius) return diameter;
    return 2 * Math.sqrt(
      Math.max(0, 2 * cutterRadius * penetration - penetration ** 2),
    );
  }

  if (tool.type === "bullnose") {
    const cr = Math.min(cutterRadius, finitePositive(tool.cornerRadius ?? 1, 1));
    const flatRadius = Math.max(0, cutterRadius - cr);
    if (penetration >= cr) return diameter;
    const cornerOffset = Math.sqrt(Math.max(0, 2 * cr * penetration - penetration ** 2));
    return 2 * (flatRadius + cornerOffset);
  }

  const geometry = resolveVBitGeometry(tool);
  const contactRadius = geometry.tipRadius +
    penetration * Math.tan(geometry.halfAngleRadians);
  return 2 * Math.min(cutterRadius, Math.max(geometry.tipRadius, contactRadius));
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
  if (tool.type === "flat" || tool.type === "facemill") {
    return [{ diameter: contactDiameter, z: clampCutZ(tipZ, bounds) }];
  }

  const bandCount = Math.max(2, Math.min(48, Math.round(requestedBandCount)));
  const contactRadius = contactDiameter / 2;
  const bands: CutterContactBand[] = [];
  const tipRadius = (tool.type === "vbit" || tool.type === "chamfer")
    ? resolveVBitGeometry(tool).tipRadius
    : tool.type === "bullnose"
      ? Math.max(0, contactRadius - Math.min(contactRadius, finitePositive(tool.cornerRadius ?? 1, 1)))
      : 0;
  const hasFlatTip = tipRadius > POINT_EPSILON;
  const profileBandCount = hasFlatTip ? bandCount - 1 : bandCount;
  const profileSpan = Math.max(0, contactRadius - tipRadius);

  for (let band = profileBandCount; band >= 1; band -= 1) {
    const outerRatio = band / profileBandCount;
    const innerRatio = (band - 1) / profileBandCount;
    const outerRadius = tipRadius + profileSpan * outerRatio;
    const innerRadius = tipRadius + profileSpan * innerRatio;
    // Sample just inside each annular band so its full physical width is
    // painted. The final pointed band is stamped at the exact tool-tip depth.
    const sampleRadius = !hasFlatTip && band === 1
      ? 0
      : (outerRadius + innerRadius) / 2;
    const profileZ = tipZ + resolveCutterProfileHeight(tool, sampleRadius);
    bands.push({
      diameter: outerRadius * 2,
      z: clampCutZ(profileZ, bounds),
    });
  }

  if (hasFlatTip) {
    bands.push({
      diameter: tipRadius * 2,
      z: clampCutZ(tipZ, bounds),
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
        `${normalizeToolId(tool.id)}:${tool.diameter}:${tool.type}:${tool.angle ?? ""}:${tool.tipDiameter ?? ""}`,
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

/**
 * Visible colour of freshly exposed material. Unlike the old shader threshold,
 * this remains clearly different from the stock face even for a 0.1-0.2 mm
 * engraving on thick sheet material; physical depth still comes exclusively
 * from the heightmap.
 */
export function cutSurfaceColor(
  z: number,
  bounds: StockZBounds,
): string {
  const range = Math.max(0.01, bounds.topZ - bounds.bottomZ);
  const depthRatio = Math.max(
    0,
    Math.min(1, (bounds.topZ - z) / range),
  );
  const shade = Math.pow(depthRatio, 0.55);
  // Render the groove as a shadowed exposed wall. Keeping every cut colour
  // below the stock albedo lets the canvas use a monotonic darken blend, so a
  // later shallow pass cannot visually refill a deeper pocket.
  const shallow = [178, 124, 73] as const;
  const deep = [68, 39, 22] as const;
  const channel = (index: number) =>
    Math.round(shallow[index] + (deep[index] - shallow[index]) * shade);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

export const MATERIAL_CUTTING_PRESETS: readonly import("./types").CuttingPreset[] = [
  {
    id: "wood-rough-6mm",
    material: "hardwood",
    name: "Gỗ Tự Nhiên / Hardwood · Dao 6mm Phá thô",
    toolDiameter: 6,
    feedRate: 2400,
    plungeRate: 800,
    spindleSpeed: 18000,
    stepoverPercent: 45,
    maxStepdown: 3.0,
  },
  {
    id: "wood-finish-3mm",
    material: "hardwood",
    name: "Gỗ Tự Nhiên / Hardwood · Dao 3mm Tinh",
    toolDiameter: 3,
    feedRate: 1800,
    plungeRate: 600,
    spindleSpeed: 20000,
    stepoverPercent: 20,
    maxStepdown: 1.5,
  },
  {
    id: "mdf-cut-6mm",
    material: "mdf_plywood",
    name: "MDF / Plywood · Dao 6mm Cắt đứt",
    toolDiameter: 6,
    feedRate: 3200,
    plungeRate: 1000,
    spindleSpeed: 18000,
    stepoverPercent: 50,
    maxStepdown: 6.0,
  },
  {
    id: "alu-pocket-4mm",
    material: "aluminum",
    name: "Nhôm 6061 / Aluminum · Dao 4mm Phay rãnh",
    toolDiameter: 4,
    feedRate: 900,
    plungeRate: 300,
    spindleSpeed: 15000,
    stepoverPercent: 35,
    maxStepdown: 0.8,
  },
  {
    id: "acrylic-cut-4mm",
    material: "acrylic",
    name: "Nhựa Mica / Acrylic · Dao 4mm Cắt bóng",
    toolDiameter: 4,
    feedRate: 1600,
    plungeRate: 500,
    spindleSpeed: 16000,
    stepoverPercent: 40,
    maxStepdown: 2.0,
  },
];

