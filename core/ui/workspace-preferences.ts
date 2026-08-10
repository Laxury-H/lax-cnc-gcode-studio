import type {
  StockSettings,
  StudioMachineProfile,
  ToolProfile,
} from "../simulation/types";
import type { CoordinateSystem, Vec3 } from "../gcode/types";

export type SimulationQuality = "low" | "medium" | "high";

export type WorkspacePreferences = {
  version: 1;
  profile: StudioMachineProfile;
  stock: StockSettings;
  speed: number;
  quality: SimulationQuality;
  showRapids: boolean;
  machineSound: boolean;
  finishSound: boolean;
  workOffsets: Record<CoordinateSystem, Vec3>;
};

export const WORKSPACE_PREFERENCES_KEY = "lax_cnc_workspace_preferences";

type AllowedSpeed = 0.5 | 1 | 2 | 5 | 10 | 20;

const SPEEDS = new Set<AllowedSpeed>([
  0.5,
  1,
  2,
  5,
  10,
  20,
]);
const PROFILES = new Set<StudioMachineProfile>(["router-custom", "iso"]);
const QUALITIES = new Set<SimulationQuality>(["low", "medium", "high"]);
const Z_ZERO_VALUES = new Set<NonNullable<StockSettings["zZero"]>>([
  "auto",
  "top",
  "bottom",
]);
const TOOL_TYPES = new Set<ToolProfile["type"]>(["flat", "ball", "vbit"]);
const COORDINATE_SYSTEMS = [
  "G54",
  "G55",
  "G56",
  "G57",
  "G58",
  "G59",
] as const satisfies readonly CoordinateSystem[];

const MAX_TOOLS = 256;
const MAX_TOOL_ID_LENGTH = 64;
const MAX_WORK_OFFSET = 1_000_000;

type NumericRule = {
  min: number;
  max: number;
  minInclusive?: boolean;
  maxInclusive?: boolean;
};

const STOCK_NUMERIC_RULES = {
  width: { min: 0, max: 1_000_000 },
  height: { min: 0, max: 1_000_000 },
  thickness: { min: 0, max: 10_000 },
  originX: { min: -1_000_000, max: 1_000_000, minInclusive: true },
  originY: { min: -1_000_000, max: 1_000_000, minInclusive: true },
  safeZ: { min: -1_000_000, max: 1_000_000, minInclusive: true },
  toolDiameter: { min: 0, max: 1_000 },
  clearance: { min: 0, max: 1_000_000, minInclusive: true },
  rapidFeed: { min: 0, max: 10_000_000 },
} as const satisfies Record<
  | "width"
  | "height"
  | "thickness"
  | "originX"
  | "originY"
  | "safeZ"
  | "toolDiameter"
  | "clearance"
  | "rapidFeed",
  NumericRule
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedNumber(value: unknown, rule: NumericRule): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const meetsMinimum = rule.minInclusive
    ? value >= rule.min
    : value > rule.min;
  const meetsMaximum = rule.maxInclusive === false
    ? value < rule.max
    : value <= rule.max;
  return meetsMinimum && meetsMaximum ? value : null;
}

function parseTool(value: unknown): ToolProfile | null {
  if (!isRecord(value)) return null;

  if (typeof value.id !== "string") return null;
  const id = value.id.trim();
  if (!id || id.length > MAX_TOOL_ID_LENGTH) return null;

  if (typeof value.type !== "string" || !TOOL_TYPES.has(value.type as ToolProfile["type"])) {
    return null;
  }

  const diameter = boundedNumber(value.diameter, {
    min: 0,
    max: 1_000,
  });
  if (diameter === null) return null;

  let angle: number | undefined;
  if (value.angle !== undefined) {
    const parsedAngle = boundedNumber(value.angle, {
      min: 0,
      max: 180,
      maxInclusive: false,
    });
    if (parsedAngle === null) return null;
    angle = parsedAngle;
  }

  return {
    id,
    diameter,
    type: value.type as ToolProfile["type"],
    ...(angle === undefined ? {} : { angle }),
  };
}

function parseStock(value: unknown): StockSettings | null {
  if (!isRecord(value)) return null;

  const numericValues: Partial<Record<keyof typeof STOCK_NUMERIC_RULES, number>> = {};
  for (const key of Object.keys(STOCK_NUMERIC_RULES) as Array<
    keyof typeof STOCK_NUMERIC_RULES
  >) {
    const parsed = boundedNumber(value[key], STOCK_NUMERIC_RULES[key]);
    if (parsed === null) return null;
    numericValues[key] = parsed;
  }

  let zZero: StockSettings["zZero"];
  if (value.zZero !== undefined) {
    if (
      typeof value.zZero !== "string" ||
      !Z_ZERO_VALUES.has(value.zZero as NonNullable<StockSettings["zZero"]>)
    ) {
      return null;
    }
    zZero = value.zZero as NonNullable<StockSettings["zZero"]>;
  }

  let tools: ToolProfile[] | undefined;
  if (value.tools !== undefined) {
    if (!Array.isArray(value.tools) || value.tools.length > MAX_TOOLS) {
      return null;
    }

    const ids = new Set<string>();
    tools = [];
    for (const candidate of value.tools) {
      const tool = parseTool(candidate);
      if (!tool || ids.has(tool.id)) return null;
      ids.add(tool.id);
      tools.push(tool);
    }
  }

  return {
    width: numericValues.width!,
    height: numericValues.height!,
    thickness: numericValues.thickness!,
    originX: numericValues.originX!,
    originY: numericValues.originY!,
    safeZ: numericValues.safeZ!,
    toolDiameter: numericValues.toolDiameter!,
    clearance: numericValues.clearance!,
    rapidFeed: numericValues.rapidFeed!,
    ...(zZero === undefined ? {} : { zZero }),
    ...(tools === undefined ? {} : { tools }),
  };
}

function zeroVector(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

export function createZeroWorkspaceWorkOffsets(): Record<
  CoordinateSystem,
  Vec3
> {
  return {
    G54: zeroVector(),
    G55: zeroVector(),
    G56: zeroVector(),
    G57: zeroVector(),
    G58: zeroVector(),
    G59: zeroVector(),
  };
}

export function cloneWorkspaceWorkOffsets(
  workOffsets: Record<CoordinateSystem, Vec3>,
): Record<CoordinateSystem, Vec3> {
  return Object.fromEntries(
    COORDINATE_SYSTEMS.map((coordinateSystem) => [
      coordinateSystem,
      { ...workOffsets[coordinateSystem] },
    ]),
  ) as Record<CoordinateSystem, Vec3>;
}

function parseWorkOffsets(
  value: unknown,
): Record<CoordinateSystem, Vec3> | null {
  // Version 1 originally had no persisted work-offset field. Keep those saved
  // workspaces valid and migrate them to an explicit, independent zero vector
  // for every supported coordinate system.
  if (value === undefined) return createZeroWorkspaceWorkOffsets();
  if (!isRecord(value)) return null;

  const workOffsets = createZeroWorkspaceWorkOffsets();
  const rule: NumericRule = {
    min: -MAX_WORK_OFFSET,
    max: MAX_WORK_OFFSET,
    minInclusive: true,
  };

  for (const coordinateSystem of COORDINATE_SYSTEMS) {
    const candidate = value[coordinateSystem];
    if (!isRecord(candidate)) return null;

    const x = boundedNumber(candidate.x, rule);
    const y = boundedNumber(candidate.y, rule);
    const z = boundedNumber(candidate.z, rule);
    if (x === null || y === null || z === null) return null;

    workOffsets[coordinateSystem] = { x, y, z };
  }

  return workOffsets;
}

function normalizePreferences(value: unknown): WorkspacePreferences | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (
    typeof value.profile !== "string" ||
    !PROFILES.has(value.profile as StudioMachineProfile)
  ) {
    return null;
  }
  if (typeof value.speed !== "number" || !SPEEDS.has(value.speed as AllowedSpeed)) {
    return null;
  }
  if (
    typeof value.quality !== "string" ||
    !QUALITIES.has(value.quality as SimulationQuality)
  ) {
    return null;
  }
  if (
    typeof value.showRapids !== "boolean" ||
    typeof value.machineSound !== "boolean" ||
    typeof value.finishSound !== "boolean"
  ) {
    return null;
  }

  const stock = parseStock(value.stock);
  if (!stock) return null;
  const workOffsets = parseWorkOffsets(value.workOffsets);
  if (!workOffsets) return null;

  return {
    version: 1,
    profile: value.profile as StudioMachineProfile,
    stock,
    speed: value.speed,
    quality: value.quality as SimulationQuality,
    showRapids: value.showRapids,
    machineSound: value.machineSound,
    finishSound: value.finishSound,
    workOffsets,
  };
}

export function cloneStockSettings(stock: StockSettings): StockSettings {
  return {
    ...stock,
    ...(stock.tools
      ? { tools: stock.tools.map((tool) => ({ ...tool })) }
      : {}),
  };
}

export function parseWorkspacePreferences(
  raw: string | null | undefined,
): WorkspacePreferences | null {
  if (typeof raw !== "string") return null;

  try {
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function serializeWorkspacePreferences(
  preferences: WorkspacePreferences,
): string {
  const normalized = normalizePreferences(preferences);
  if (!normalized) {
    throw new TypeError("Invalid workspace preferences");
  }
  return JSON.stringify(normalized);
}
