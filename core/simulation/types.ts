import type {
  CoordinateSystem,
  Diagnostic,
  DistanceMode,
  InterpretedProgram,
  NormalizedMotion,
  Plane,
  SpindleState,
  Units,
  Vec3,
} from "../gcode/types";

export type StudioMachineProfile = "router-custom" | "iso";

export type ToolType = "flat" | "ball" | "vbit" | "bullnose" | "chamfer" | "facemill";

export type ToolProfile = {
  id: string; // e.g., "1", "25"
  name?: string;
  diameter: number; // mm
  type: ToolType;
  angle?: number; // included angle in degrees, only for V-bits & chamfer
  tipDiameter?: number; // physical flat/tipped-off end diameter in mm
  cornerRadius?: number; // corner radius for bullnose in mm
  fluteLength?: number; // flute length in mm
  stickOut?: number; // stick-out length from collet in mm
  holderDiameter?: number; // tool holder diameter in mm
};

export type MaterialCategory =
  | "hardwood"
  | "mdf_plywood"
  | "aluminum"
  | "acrylic"
  | "softwood";

export type CuttingPreset = {
  id: string;
  material: MaterialCategory;
  name: string;
  toolDiameter: number;
  feedRate: number; // mm/min
  plungeRate: number; // mm/min
  spindleSpeed: number; // RPM
  stepoverPercent: number; // %
  maxStepdown: number; // mm
};

export type StockSettings = {
  width: number;
  height: number;
  thickness: number;
  originX: number;
  originY: number;
  safeZ: number;
  toolDiameter: number; // Default fallback tool diameter
  clearance: number;
  rapidFeed: number;
  zZero?: "auto" | "top" | "bottom";
  tools?: ToolProfile[]; // Array of defined tools
};

export type MotionKind =
  | "rapid"
  | "cut"
  | "arc-cw"
  | "arc-ccw"
  | "drill"
  | "dwell";

export type Segment = {
  id: number;
  motionId: number;
  lineIndex: number;
  lineNumber: number;
  raw: string;
  machineStart: Vec3;
  machineEnd: Vec3;
  start: Vec3;
  end: Vec3;
  workStart: Vec3;
  workEnd: Vec3;
  machineCoordinates: boolean;
  points: Vec3[];
  kind: MotionKind;
  plane: Plane;
  center?: Vec3;
  radius?: number;
  sweepRadians?: number;
  feed: number;
  spindle: number;
  spindleState: SpindleState;
  tool: string;
  coordinateSystem: CoordinateSystem;
  distanceMode: DistanceMode;
  units: Units;
  length: number;
  estimatedDurationMs: number;
  cannedCycleKey?: string;
  cycleInstanceId?: number;
};

export type Part = {
  id: string;
  points: Vec3[];
  /** Simplified sub-millimetre contour used only for spatial analysis. */
  analysisPoints?: Vec3[];
  /** Immediate inner contours belonging to this part. */
  holes?: Vec3[][];
  /** Area-weighted center of the outer contour after subtracting holes. */
  centroid?: Vec3;
  /** Guaranteed in-material point used for readable labels on concave parts. */
  labelPosition?: Vec3;
  labelClearance?: number;
  perimeter?: number;
  sourceLine: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  toolpathWidth: number;
  toolpathHeight: number;
  compensated: boolean;
  area: number;
  nearestGap: number | null;
  edgeGap: number;
};

export type Offcut = {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  area: number;
  label: string;
};

export type PostProcessorType = "ncstudio" | "syntec" | "standard";

export type Simulation = {
  lines: string[];
  segments: Segment[];
  diagnostics: Diagnostic[];
  parts: Part[];
  offcuts: Offcut[];
  cutLength: number;
  rapidLength: number;
  estimatedSeconds: number;
  drillHoles: number;
  bounds: InterpretedProgram["bounds"];
  finalState: {
    position: Vec3;
    workPosition: Vec3;
    feed: number;
    spindle: number;
    tool: string;
    units: Units;
    absolute: boolean;
    spindleOn: boolean;
    plane: Plane;
    coordinateSystem: string;
    feedMode: string;
    coolant: string;
  };
};

export type {
  Diagnostic,
  InterpretedProgram,
  NormalizedMotion,
  Plane,
  SpindleState,
  Units,
  Vec3,
};
