export type Axis = "x" | "y" | "z";
export type AxisWord = "X" | "Y" | "Z";
export type Plane = "XY" | "XZ" | "YZ";
export type Units = "mm" | "inch";
export type DistanceMode = "absolute" | "incremental";
export type FeedMode = "inverse-time" | "units-per-minute";
export type ArcDistanceMode = "absolute" | "incremental";
export type Severity = "error" | "warning" | "info";
export type SpindleState = "off" | "cw" | "ccw";
export type CoolantState = "off" | "mist" | "flood" | "mist-flood";
export type CoordinateSystem = "G54" | "G55" | "G56" | "G57" | "G58" | "G59";
export type RetractMode = "initial" | "r-plane";
export type MotionMode =
  | "G0"
  | "G1"
  | "G2"
  | "G3"
  | "G73"
  | "G80"
  | "G81"
  | "G82"
  | "G83"
  | "G84"
  | "G85"
  | "G86"
  | "G87"
  | "G88"
  | "G89";

export type NormalizedMotionType =
  | "rapid"
  | "linear"
  | "arc-cw"
  | "arc-ccw"
  | "dwell";

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type Bounds3 = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

export type GcodeWord = {
  letter: string;
  value: number;
  raw: string;
  column: number;
  endColumn: number;
};

export type Diagnostic = {
  id: string;
  lineIndex: number;
  sourceLine: number;
  severity: Severity;
  code: string;
  command: string | null;
  message: string;
  rawText: string;
};

export type ParsedBlock = {
  id: number;
  lineIndex: number;
  sourceLine: number;
  rawText: string;
  words: GcodeWord[];
  comments: string[];
  comment: string;
  lineNumber: number | null;
  checksum: number | null;
  computedChecksum: number | null;
  programDelimiter: boolean;
  diagnostics: Diagnostic[];
  stateBefore?: ModalStateSnapshot;
  stateAfter?: ModalStateSnapshot;
};

export type ToolLengthCompensation = {
  active: boolean;
  register: number | null;
  length: number;
};

export type CannedCycleState = {
  code: Exclude<MotionMode, "G0" | "G1" | "G2" | "G3" | "G80">;
  depth: number;
  retractPlane: number;
  peck: number | null;
  dwellMs: number;
  initialPlane: number;
  feed: number;
};

export type ModalStateSnapshot = {
  machinePosition: Vec3;
  workPosition: Vec3;
  axesKnown: Record<Axis, boolean>;
  motionMode: MotionMode;
  plane: Plane;
  units: Units;
  distanceMode: DistanceMode;
  arcDistanceMode: ArcDistanceMode;
  feedMode: FeedMode;
  coordinateSystem: CoordinateSystem;
  workOffset: Vec3;
  g92Offset: Vec3;
  g92StoredOffset: Vec3;
  g92Suspended: boolean;
  toolLengthCompensation: ToolLengthCompensation;
  feed: number;
  spindle: number;
  selectedTool: number | null;
  tool: number | null;
  spindleState: SpindleState;
  coolant: CoolantState;
  retractMode: RetractMode;
  cannedCycle: CannedCycleState | null;
  programEnded: boolean;
};

export type NormalizedMotion = {
  id: number;
  sourceLine: number;
  lineIndex: number;
  rawText: string;
  type: NormalizedMotionType;
  start: Vec3;
  end: Vec3;
  center?: Vec3;
  radius?: number;
  sweepRadians?: number;
  plane: Plane;
  feed?: number;
  spindle?: number;
  tool?: number;
  units: Units;
  distance: number;
  estimatedDurationMs: number;
  cannedCycle?: CannedCycleState["code"];
};

export type ParsedProgram = {
  source: string;
  lines: string[];
  blocks: ParsedBlock[];
  diagnostics: Diagnostic[];
};

export type InterpretedProgram = ParsedProgram & {
  motions: NormalizedMotion[];
  finalState: ModalStateSnapshot;
  bounds: Bounds3;
};

export type MachineProfileId =
  | "generic"
  | "fanuc"
  | "grbl"
  | "mach3"
  | "linuxcnc"
  | "router-custom"
  | "iso";

export type MachineProfile = {
  id: MachineProfileId;
  name: string;
  defaultUnits: Units;
  defaultArcDistanceMode: ArcDistanceMode;
  rapidRate: number;
  toolChangeDurationMs: number;
  spindleStartupDelayMs: number;
  supportedGCodes: ReadonlySet<number>;
  supportedMCodes: ReadonlySet<number>;
  customSpindleOnMCodes: ReadonlySet<number>;
  customToolSelectGCodes: ReadonlySet<number>;
  axisLimits?: Partial<Record<Axis, { min: number; max: number }>>;
  workOffsets: Record<CoordinateSystem, Vec3>;
  toolLengthOffsets: Readonly<Record<number, number>>;
  arcRadiusTolerance: number;
};

export type InterpreterOptions = {
  profile?: MachineProfileId | MachineProfile;
  initialPosition?: Vec3;
  initialAxesKnown?: Partial<Record<Axis, boolean>>;
  workOffsets?: Partial<Record<CoordinateSystem, Vec3>>;
  toolLengthOffsets?: Readonly<Record<number, number>>;
};

export type ArcQuality = {
  chordError: number;
  minSegments: number;
  maxSegments: number;
};
