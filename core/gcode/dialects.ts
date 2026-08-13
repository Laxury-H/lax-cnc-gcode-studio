import type {
  Axis,
  CoordinateSystem,
  MachineProfile,
  MachineProfileId,
  Vec3,
} from "./types";

const COORDINATE_SYSTEMS: readonly CoordinateSystem[] = [
  "G54",
  "G55",
  "G56",
  "G57",
  "G58",
  "G59",
];

const COMMON_G_CODES = [
  0, 1, 2, 3, 4, 17, 18, 19, 20, 21, 40, 43, 49, 53, 54, 55, 56, 57, 58, 59,
  80, 81, 82, 83, 90, 91, 90.1, 91.1, 92, 92.1, 92.2, 92.3, 93, 94, 98,
  99,
] as const;

const COMMON_M_CODES = [2, 3, 4, 5, 6, 7, 8, 9, 30] as const;

const EMPTY_NUMBERS: readonly number[] = [];

function zeroVector(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

export function createZeroWorkOffsets(): Record<CoordinateSystem, Vec3> {
  return {
    G54: zeroVector(),
    G55: zeroVector(),
    G56: zeroVector(),
    G57: zeroVector(),
    G58: zeroVector(),
    G59: zeroVector(),
  };
}

function cloneWorkOffsets(
  source: Record<CoordinateSystem, Vec3>,
): Record<CoordinateSystem, Vec3> {
  return Object.fromEntries(
    COORDINATE_SYSTEMS.map((coordinateSystem) => [
      coordinateSystem,
      { ...source[coordinateSystem] },
    ]),
  ) as Record<CoordinateSystem, Vec3>;
}

export type MachineProfileOverrides = Partial<
  Omit<MachineProfile, "workOffsets" | "toolLengthOffsets">
> & {
  workOffsets?: Partial<Record<CoordinateSystem, Vec3>>;
  toolLengthOffsets?: Readonly<Record<number, number>>;
};

export function createMachineProfile(
  base: MachineProfile,
  overrides: MachineProfileOverrides = {},
): MachineProfile {
  const workOffsets = cloneWorkOffsets(base.workOffsets);
  for (const coordinateSystem of COORDINATE_SYSTEMS) {
    const override = overrides.workOffsets?.[coordinateSystem];
    if (override) workOffsets[coordinateSystem] = { ...override };
  }

  return {
    ...base,
    ...overrides,
    supportedGCodes: new Set(
      overrides.supportedGCodes ?? base.supportedGCodes,
    ),
    supportedMCodes: new Set(
      overrides.supportedMCodes ?? base.supportedMCodes,
    ),
    customSpindleOnMCodes: new Set(
      overrides.customSpindleOnMCodes ?? base.customSpindleOnMCodes,
    ),
    customToolSelectGCodes: new Set(
      overrides.customToolSelectGCodes ?? base.customToolSelectGCodes,
    ),
    axisLimits: overrides.axisLimits
      ? Object.fromEntries(
          Object.entries(overrides.axisLimits).map(([axis, limits]) => [
            axis,
            limits ? { ...limits } : limits,
          ]),
        ) as Partial<Record<Axis, { min: number; max: number }>>
      : base.axisLimits
        ? Object.fromEntries(
            Object.entries(base.axisLimits).map(([axis, limits]) => [
              axis,
              limits ? { ...limits } : limits,
            ]),
          ) as Partial<Record<Axis, { min: number; max: number }>>
        : undefined,
    workOffsets,
    toolLengthOffsets: {
      ...base.toolLengthOffsets,
      ...overrides.toolLengthOffsets,
    },
  };
}

function baseProfile(
  id: MachineProfileId,
  name: string,
  options: {
    rapidRate: number;
    supportedGCodes?: readonly number[];
    supportedMCodes?: readonly number[];
    arcRadiusTolerance?: number;
  },
): MachineProfile {
  return {
    id,
    name,
    defaultUnits: "mm",
    defaultArcDistanceMode: "incremental",
    rapidRate: options.rapidRate,
    toolChangeDurationMs: 10_000,
    spindleStartupDelayMs: 0,
    dwellPUnit: "seconds",
    supportedGCodes: new Set(options.supportedGCodes ?? COMMON_G_CODES),
    supportedMCodes: new Set(options.supportedMCodes ?? COMMON_M_CODES),
    customSpindleOnMCodes: new Set(EMPTY_NUMBERS),
    customToolSelectGCodes: new Set(EMPTY_NUMBERS),
    workOffsets: createZeroWorkOffsets(),
    toolLengthOffsets: {},
    arcRadiusTolerance: options.arcRadiusTolerance ?? 0.01,
  };
}

export const GENERIC_PROFILE = baseProfile(
  "generic",
  "Generic CNC Router",
  { rapidRate: 8_000 },
);

export const FANUC_PROFILE = createMachineProfile(GENERIC_PROFILE, {
  id: "fanuc",
  name: "Fanuc-style",
  rapidRate: 10_000,
  toolChangeDurationMs: 12_000,
  dwellPUnit: "milliseconds",
});

export const GRBL_PROFILE = createMachineProfile(GENERIC_PROFILE, {
  id: "grbl",
  name: "GRBL",
  rapidRate: 5_000,
  toolChangeDurationMs: 0,
  supportedGCodes: new Set([
    0, 1, 2, 3, 4, 17, 18, 19, 20, 21, 53, 54, 55, 56, 57, 58, 59, 90,
    91, 91.1, 92, 92.1, 93, 94,
  ]),
  supportedMCodes: new Set([0, 1, 2, 3, 4, 5, 7, 8, 9, 30]),
});

export const MACH3_PROFILE = createMachineProfile(GENERIC_PROFILE, {
  id: "mach3",
  name: "Mach3",
  rapidRate: 8_000,
  supportedGCodes: new Set([
    ...COMMON_G_CODES,
    28, 40, 41, 42, 61, 64, 73, 84, 85, 86, 87, 88, 89,
  ]),
});

export const LINUXCNC_PROFILE = createMachineProfile(GENERIC_PROFILE, {
  id: "linuxcnc",
  name: "LinuxCNC",
  rapidRate: 10_000,
  supportedGCodes: new Set([
    ...COMMON_G_CODES,
    28, 40, 41, 42, 61, 64, 73, 84, 85, 86, 87, 88, 89,
  ]),
});

export const ROUTER_CUSTOM_PROFILE = createMachineProfile(GENERIC_PROFILE, {
  id: "router-custom",
  name: "Router 3 trục · Custom",
  customSpindleOnMCodes: new Set([33]),
  customToolSelectGCodes: new Set([600]),
  supportedGCodes: new Set([...COMMON_G_CODES, 600]),
  supportedMCodes: new Set([...COMMON_M_CODES, 33, 73, 83]),
});

export const ISO_PROFILE = createMachineProfile(FANUC_PROFILE, {
  id: "iso",
  name: "ISO / Fanuc cơ bản",
});

export const MACHINE_PROFILE_BASES = {
  iso: "fanuc",
  "router-custom": "generic",
} as const satisfies Partial<Record<MachineProfileId, MachineProfileId>>;

export const MACHINE_PROFILES: Readonly<
  Record<MachineProfileId, MachineProfile>
> = {
  generic: GENERIC_PROFILE,
  fanuc: FANUC_PROFILE,
  grbl: GRBL_PROFILE,
  mach3: MACH3_PROFILE,
  linuxcnc: LINUXCNC_PROFILE,
  "router-custom": ROUTER_CUSTOM_PROFILE,
  iso: ISO_PROFILE,
};

export function resolveMachineProfile(
  profile: MachineProfileId | MachineProfile = "generic",
) {
  return typeof profile === "string"
    ? MACHINE_PROFILES[profile] ?? GENERIC_PROFILE
    : profile;
}

export function isGCodeSupported(profile: MachineProfile, code: number) {
  return profile.supportedGCodes.has(code);
}

export function isMCodeSupported(profile: MachineProfile, code: number) {
  return profile.supportedMCodes.has(code);
}
