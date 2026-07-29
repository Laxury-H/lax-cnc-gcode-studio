import type {
  Diagnostic,
  InterpretedProgram,
  NormalizedMotion,
  Plane,
  Units,
  Vec3,
} from "../gcode/types";

export type StudioMachineProfile = "router-custom" | "iso";

export type ToolProfile = {
  id: string; // e.g., "1", "25"
  diameter: number; // mm
  type: "flat" | "ball" | "vbit";
  angle?: number; // degrees, only for vbit
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
  start: Vec3;
  end: Vec3;
  points: Vec3[];
  kind: MotionKind;
  plane: Plane;
  center?: Vec3;
  radius?: number;
  sweepRadians?: number;
  feed: number;
  spindle: number;
  tool: string;
  units: Units;
  length: number;
  estimatedDurationMs: number;
  cannedCycleKey?: string;
  cycleInstanceId?: number;
};

export type Part = {
  id: string;
  points: Vec3[];
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
  motions: NormalizedMotion[];
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
  Units,
  Vec3,
};
