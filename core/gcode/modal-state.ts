import {
  createMachineProfile,
  resolveMachineProfile,
} from "./dialects";
import type {
  Axis,
  CoordinateSystem,
  InterpreterOptions,
  ModalStateSnapshot,
  ToolLengthCompensation,
  Vec3,
} from "./types";

const AXES: readonly Axis[] = ["x", "y", "z"];

function zeroVector(): Vec3 {
  return { x: 0, y: 0, z: 0 };
}

function cloneVector(vector: Vec3): Vec3 {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function addVectors(...vectors: readonly Vec3[]): Vec3 {
  return vectors.reduce(
    (result, vector) => ({
      x: result.x + vector.x,
      y: result.y + vector.y,
      z: result.z + vector.z,
    }),
    zeroVector(),
  );
}

function subtractVectors(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  };
}

function mergeAxesKnown(
  current: Record<Axis, boolean>,
  overrides: Partial<Record<Axis, boolean>> = {},
) {
  return {
    x: overrides.x ?? current.x,
    y: overrides.y ?? current.y,
    z: overrides.z ?? current.z,
  };
}

export function cloneModalState(
  state: ModalStateSnapshot,
): ModalStateSnapshot {
  return {
    ...state,
    machinePosition: cloneVector(state.machinePosition),
    workPosition: cloneVector(state.workPosition),
    axesKnown: { ...state.axesKnown },
    workOffset: cloneVector(state.workOffset),
    g92Offset: cloneVector(state.g92Offset),
    g92StoredOffset: cloneVector(state.g92StoredOffset),
    toolLengthCompensation: { ...state.toolLengthCompensation },
    cannedCycle: state.cannedCycle ? { ...state.cannedCycle } : null,
  };
}

export function getActiveG92Offset(state: ModalStateSnapshot): Vec3 {
  return state.g92Suspended ? zeroVector() : cloneVector(state.g92Offset);
}

export function getToolLengthOffsetVector(
  state: ModalStateSnapshot,
): Vec3 {
  return {
    x: 0,
    y: 0,
    z: state.toolLengthCompensation.active
      ? state.toolLengthCompensation.length
      : 0,
  };
}

export function getCoordinateTransformOffset(
  state: ModalStateSnapshot,
): Vec3 {
  return addVectors(
    state.workOffset,
    getActiveG92Offset(state),
    getToolLengthOffsetVector(state),
  );
}

export function workToMachinePosition(
  workPosition: Vec3,
  state: ModalStateSnapshot,
): Vec3 {
  return addVectors(workPosition, getCoordinateTransformOffset(state));
}

export function machineToWorkPosition(
  machinePosition: Vec3,
  state: ModalStateSnapshot,
): Vec3 {
  return subtractVectors(
    machinePosition,
    getCoordinateTransformOffset(state),
  );
}

export function withMachinePosition(
  state: ModalStateSnapshot,
  machinePosition: Vec3,
  axesKnown: Partial<Record<Axis, boolean>> = {},
): ModalStateSnapshot {
  const next = cloneModalState(state);
  next.machinePosition = cloneVector(machinePosition);
  next.workPosition = machineToWorkPosition(machinePosition, next);
  next.axesKnown = mergeAxesKnown(next.axesKnown, axesKnown);
  return next;
}

export function withWorkPosition(
  state: ModalStateSnapshot,
  workPosition: Vec3,
  axesKnown: Partial<Record<Axis, boolean>> = {},
): ModalStateSnapshot {
  const next = cloneModalState(state);
  next.workPosition = cloneVector(workPosition);
  next.machinePosition = workToMachinePosition(workPosition, next);
  next.axesKnown = mergeAxesKnown(next.axesKnown, axesKnown);
  return next;
}

export function withCoordinateSystem(
  state: ModalStateSnapshot,
  coordinateSystem: CoordinateSystem,
  workOffsets: Partial<Record<CoordinateSystem, Vec3>> = {},
): ModalStateSnapshot {
  const next = cloneModalState(state);
  const configuredOffset = workOffsets[coordinateSystem];
  next.coordinateSystem = coordinateSystem;
  next.workOffset = configuredOffset
    ? cloneVector(configuredOffset)
    : coordinateSystem === state.coordinateSystem
      ? cloneVector(state.workOffset)
      : zeroVector();
  next.workPosition = machineToWorkPosition(next.machinePosition, next);
  return next;
}

export function withWorkOffset(
  state: ModalStateSnapshot,
  workOffset: Vec3,
): ModalStateSnapshot {
  const next = cloneModalState(state);
  next.workOffset = cloneVector(workOffset);
  next.workPosition = machineToWorkPosition(next.machinePosition, next);
  return next;
}

export function withG92Offset(
  state: ModalStateSnapshot,
  offset: Vec3,
  options: { store?: boolean; suspended?: boolean } = {},
): ModalStateSnapshot {
  const next = cloneModalState(state);
  next.g92Offset = cloneVector(offset);
  if (options.store !== false) next.g92StoredOffset = cloneVector(offset);
  next.g92Suspended = options.suspended ?? false;
  next.workPosition = machineToWorkPosition(next.machinePosition, next);
  return next;
}

export function setG92FromWorkPosition(
  state: ModalStateSnapshot,
  desiredWorkPosition: Partial<Vec3>,
): ModalStateSnapshot {
  const toolLengthOffset = getToolLengthOffsetVector(state);
  // G92 replaces the active global offset. Axes omitted from this command
  // return to zero rather than inheriting an older G92 value.
  const offset = zeroVector();

  for (const axis of AXES) {
    const desired = desiredWorkPosition[axis];
    if (desired === undefined) continue;
    offset[axis] =
      state.machinePosition[axis] -
      state.workOffset[axis] -
      toolLengthOffset[axis] -
      desired;
  }

  return withG92Offset(state, offset, { store: true, suspended: false });
}

export function clearG92Offset(
  state: ModalStateSnapshot,
): ModalStateSnapshot {
  const next = cloneModalState(state);
  next.g92Offset = zeroVector();
  next.g92StoredOffset = zeroVector();
  next.g92Suspended = false;
  next.workPosition = machineToWorkPosition(next.machinePosition, next);
  return next;
}

export function suspendG92Offset(
  state: ModalStateSnapshot,
): ModalStateSnapshot {
  const next = cloneModalState(state);
  next.g92Suspended = true;
  next.workPosition = machineToWorkPosition(next.machinePosition, next);
  return next;
}

export function restoreG92Offset(
  state: ModalStateSnapshot,
): ModalStateSnapshot {
  const next = cloneModalState(state);
  next.g92Offset = cloneVector(next.g92StoredOffset);
  next.g92Suspended = false;
  next.workPosition = machineToWorkPosition(next.machinePosition, next);
  return next;
}

export function withToolLengthCompensation(
  state: ModalStateSnapshot,
  compensation: ToolLengthCompensation,
): ModalStateSnapshot {
  const next = cloneModalState(state);
  next.toolLengthCompensation = { ...compensation };
  next.workPosition = machineToWorkPosition(next.machinePosition, next);
  return next;
}

export function cancelToolLengthCompensation(
  state: ModalStateSnapshot,
): ModalStateSnapshot {
  return withToolLengthCompensation(state, {
    active: false,
    register: null,
    length: 0,
  });
}

export function createInitialModalState(
  options: InterpreterOptions = {},
): ModalStateSnapshot {
  const baseProfile = resolveMachineProfile(options.profile);
  const profile = createMachineProfile(baseProfile, {
    workOffsets: options.workOffsets,
    toolLengthOffsets: options.toolLengthOffsets,
  });
  const machinePosition = cloneVector(
    options.initialPosition ?? zeroVector(),
  );
  const initialPositionIsKnown = options.initialPosition !== undefined;
  const axesKnown = {
    x: options.initialAxesKnown?.x ?? initialPositionIsKnown,
    y: options.initialAxesKnown?.y ?? initialPositionIsKnown,
    z: options.initialAxesKnown?.z ?? initialPositionIsKnown,
  };

  const state: ModalStateSnapshot = {
    machinePosition,
    workPosition: zeroVector(),
    axesKnown,
    motionMode: "G0",
    plane: "XY",
    units: profile.defaultUnits,
    distanceMode: "absolute",
    arcDistanceMode: profile.defaultArcDistanceMode,
    feedMode: "units-per-minute",
    coordinateSystem: "G54",
    workOffset: cloneVector(profile.workOffsets.G54),
    g92Offset: zeroVector(),
    g92StoredOffset: zeroVector(),
    g92Suspended: false,
    toolLengthCompensation: {
      active: false,
      register: null,
      length: 0,
    },
    feed: 0,
    spindle: 0,
    selectedTool: null,
    tool: null,
    spindleState: "off",
    coolant: "off",
    retractMode: "initial",
    cannedCycle: null,
    programEnded: false,
  };
  state.workPosition = machineToWorkPosition(machinePosition, state);
  return state;
}

export const workToMachine = workToMachinePosition;
export const machineToWork = machineToWorkPosition;
export const updateMachinePosition = withMachinePosition;
export const updateWorkPosition = withWorkPosition;
export const selectCoordinateSystem = withCoordinateSystem;
