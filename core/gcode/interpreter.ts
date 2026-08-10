import { arcBounds, resolveArc } from "../geometry/arc";
import {
  boundsForPoint,
  boundsForPoints,
  mergeBounds,
} from "../geometry/bounds";
import { distance3D } from "../geometry/line";
import {
  createDiagnostic,
  formatGcodeCommand,
  mergeDiagnostics,
} from "./diagnostics";
import {
  createMachineProfile,
  isGCodeSupported,
  isMCodeSupported,
  resolveMachineProfile,
} from "./dialects";
import {
  cancelToolLengthCompensation,
  clearG92Offset,
  cloneModalState,
  createInitialModalState,
  getCoordinateTransformOffset,
  machineToWorkPosition,
  restoreG92Offset,
  setG92FromWorkPosition,
  suspendG92Offset,
  withCoordinateSystem,
  withMachinePosition,
  withToolLengthCompensation,
} from "./modal-state";
import { parseProgram } from "./parser";
import type {
  Axis,
  AxisWord,
  Bounds3,
  CannedCycleState,
  CoordinateSystem,
  Diagnostic,
  GcodeWord,
  InterpretedProgram,
  InterpreterOptions,
  MachineProfile,
  ModalStateSnapshot,
  MotionMode,
  NormalizedMotion,
  NormalizedMotionType,
  ParsedBlock,
  Plane,
  Vec3,
} from "./types";

const AXES = ["x", "y", "z"] as const satisfies readonly Axis[];
const AXIS_WORDS = {
  x: "X",
  y: "Y",
  z: "Z",
} as const satisfies Record<Axis, AxisWord>;
const WORD_AXES = {
  X: "x",
  Y: "y",
  Z: "z",
} as const satisfies Record<AxisWord, Axis>;
const MOTION_CODES = new Set([
  0, 1, 2, 3, 73, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89,
]);
const CANNED_CODES = new Set([73, 81, 82, 83, 84, 85, 86, 87, 88, 89]);
const SUPPORTED_WORDS = new Set([
  "N",
  "G",
  "M",
  "X",
  "Y",
  "Z",
  "I",
  "J",
  "K",
  "R",
  "F",
  "S",
  "T",
  "H",
  "P",
  "Q",
  "L",
]);

type InterpreterContext = {
  profile: MachineProfile;
  state: ModalStateSnapshot;
  motions: NormalizedMotion[];
  bounds: Bounds3 | null;
  sawUnits: boolean;
  sawDistanceMode: boolean;
  nextCycleInstanceId: number;
};

type CyclePlane = {
  locationAxes: readonly [Axis, Axis];
  drillAxis: Axis;
};

export function interpretGcode(
  source: string,
  options: InterpreterOptions = {},
): InterpretedProgram {
  const parsed = parseProgram(source);
  const baseProfile = resolveMachineProfile(options.profile);
  const profile = createMachineProfile(baseProfile, {
    workOffsets: options.workOffsets,
    toolLengthOffsets: options.toolLengthOffsets,
  });
  const context: InterpreterContext = {
    profile,
    state: createInitialModalState({ ...options, profile }),
    motions: [],
    bounds: null,
    sawUnits: false,
    sawDistanceMode: false,
    nextCycleInstanceId: 0,
  };

  for (const block of parsed.blocks) {
    interpretBlock(block, context);
  }

  if (!context.sawUnits) {
    parsed.blocks[0]?.diagnostics.push(
      blockDiagnostic(
        parsed.blocks[0],
        "warning",
        "UNITS_NOT_SET",
        null,
        "Chương trình chưa khai báo G20/G21; đang tạm hiểu là milimét.",
      ),
    );
  }
  if (!context.sawDistanceMode) {
    parsed.blocks[0]?.diagnostics.push(
      blockDiagnostic(
        parsed.blocks[0],
        "warning",
        "DISTANCE_NOT_SET",
        null,
        "Chương trình chưa khai báo G90/G91; đang tạm hiểu là tuyệt đối.",
      ),
    );
  }

  const diagnostics = mergeDiagnostics(
    ...parsed.blocks.map((block) => {
      block.diagnostics = mergeDiagnostics(block.diagnostics);
      return block.diagnostics;
    }),
  );
  const bounds =
    context.bounds ?? boundsForPoint(context.state.machinePosition);

  return {
    ...parsed,
    diagnostics,
    motions: context.motions,
    finalState: cloneModalState(context.state),
    bounds,
  };
}

function interpretBlock(
  block: ParsedBlock,
  context: InterpreterContext,
): void {
  block.stateBefore = cloneModalState(context.state);
  if (
    block.programDelimiter ||
    block.words.length === 0 ||
    context.state.programEnded
  ) {
    block.stateAfter = cloneModalState(context.state);
    return;
  }

  const gWords = wordsFor(block, "G");
  const mWords = wordsFor(block, "M");
  const gCodes = gWords.map((word) => word.value);
  const mCodes = mWords.map((word) => word.value);
  const motionConflict = block.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === "MODAL_CONFLICT" &&
      (diagnostic.command ?? "").match(/\bG(?:0|1|2|3|7[3]|8\d)\b/i),
  );

  reportDuplicateWords(block);
  reportUnsupportedWords(block);
  reportUnsupportedCommands(block, context.profile, gWords, mWords);

  applyUnitsAndModes(block, context, gCodes);
  const scale = unitScale(context.state);
  applyScalarWords(block, context, scale);
  applyMachineState(block, context, gCodes, mCodes);
  applyCoordinateAndToolState(block, context, gCodes);

  if (gCodes.includes(92)) {
    applyG92(block, context, scale);
    finishBlock(block, context, mCodes);
    return;
  }
  if (gCodes.includes(92.1)) {
    context.state = clearG92Offset(context.state);
  } else if (gCodes.includes(92.2)) {
    context.state = suspendG92Offset(context.state);
  } else if (gCodes.includes(92.3)) {
    context.state = restoreG92Offset(context.state);
  }

  const dwellWord = gCodes.includes(4) ? lastWord(block, "P") : undefined;
  if (gCodes.includes(4)) {
    if (!dwellWord || dwellWord.value < 0) {
      block.diagnostics.push(
        blockDiagnostic(
          block,
          "error",
          "INVALID_DWELL",
          "G4",
          "G4 cần giá trị P không âm, tính bằng giây.",
        ),
      );
    } else {
      appendDwell(block, context, dwellWord.value * 1000);
    }
  }

  const explicitMotionCode = lastCode(gCodes, MOTION_CODES);
  if (explicitMotionCode !== undefined) {
    context.state.motionMode = motionMode(explicitMotionCode);
    if ([0, 1, 2, 3, 80].includes(explicitMotionCode)) {
      context.state.cannedCycle = null;
    }
  }

  if (motionConflict) {
    finishBlock(block, context, mCodes);
    return;
  }

  const activeMotionCode = Number(context.state.motionMode.slice(1));
  if (activeMotionCode === 80) {
    if (hasAxisWords(block)) {
      block.diagnostics.push(
        blockDiagnostic(
          block,
          "error",
          "AXIS_WITH_G80",
          "G80",
          "Không được lập trình trục khi G80 đang hủy chu trình khoan.",
        ),
      );
    }
  } else if (
    CANNED_CODES.has(activeMotionCode) &&
    (explicitMotionCode !== undefined || hasAxisWords(block))
  ) {
    interpretCannedCycle(block, context, activeMotionCode, scale);
  } else if (
    [0, 1, 2, 3].includes(activeMotionCode) &&
    (hasAxisWords(block) || hasArcDefinition(block))
  ) {
    interpretTravel(
      block,
      context,
      activeMotionCode,
      scale,
      gCodes.includes(53),
    );
  } else if (gCodes.includes(53)) {
    block.diagnostics.push(
      blockDiagnostic(
        block,
        "error",
        "G53_WITHOUT_LINEAR_MOTION",
        "G53",
        "G53 chỉ hợp lệ trên cùng block với G0 hoặc G1.",
      ),
    );
  }

  finishBlock(block, context, mCodes);
}

function applyUnitsAndModes(
  block: ParsedBlock,
  context: InterpreterContext,
  gCodes: readonly number[],
): void {
  if (gCodes.includes(20)) {
    context.state.units = "inch";
    context.sawUnits = true;
  } else if (gCodes.includes(21)) {
    context.state.units = "mm";
    context.sawUnits = true;
  }
  if (gCodes.includes(90)) {
    context.state.distanceMode = "absolute";
    context.sawDistanceMode = true;
  } else if (gCodes.includes(91)) {
    context.state.distanceMode = "incremental";
    context.sawDistanceMode = true;
  }
  if (gCodes.includes(90.1)) {
    context.state.arcDistanceMode = "absolute";
  } else if (gCodes.includes(91.1)) {
    context.state.arcDistanceMode = "incremental";
  }
  if (gCodes.includes(17)) context.state.plane = "XY";
  else if (gCodes.includes(18)) context.state.plane = "XZ";
  else if (gCodes.includes(19)) context.state.plane = "YZ";
  if (gCodes.includes(93)) context.state.feedMode = "inverse-time";
  else if (gCodes.includes(94)) context.state.feedMode = "units-per-minute";
  if (gCodes.includes(98)) context.state.retractMode = "initial";
  else if (gCodes.includes(99)) context.state.retractMode = "r-plane";

  const coordinateCode = gCodes.find((code) => code >= 54 && code <= 59);
  if (coordinateCode !== undefined) {
    const coordinateSystem = `G${coordinateCode}` as CoordinateSystem;
    context.state = withCoordinateSystem(
      context.state,
      coordinateSystem,
      context.profile.workOffsets,
    );
  }

}

function applyScalarWords(
  block: ParsedBlock,
  context: InterpreterContext,
  scale: number,
): void {
  const feedWord = lastWord(block, "F");
  const spindleWord = lastWord(block, "S");
  const toolWord = lastWord(block, "T");
  if (feedWord) {
    context.state.feed =
      context.state.feedMode === "inverse-time"
        ? feedWord.value
        : feedWord.value * scale;
  }
  if (spindleWord) {
    context.state.spindle = spindleWord.value;
  }
  if (toolWord) {
    context.state.selectedTool = Math.trunc(toolWord.value);
    if (context.state.tool === null) {
      context.state.tool = context.state.selectedTool;
    }
  }
}

function applyMachineState(
  block: ParsedBlock,
  context: InterpreterContext,
  gCodes: readonly number[],
  mCodes: readonly number[],
): void {
  if (
    mCodes.includes(3) ||
    context.profile.customSpindleOnMCodes.has(3)
  ) {
    context.state.spindleState = "cw";
  }
  if (mCodes.includes(4)) context.state.spindleState = "ccw";
  if (
    mCodes.some((code) =>
      context.profile.customSpindleOnMCodes.has(code),
    )
  ) {
    context.state.spindleState = "cw";
  }
  if (mCodes.includes(5)) context.state.spindleState = "off";

  const mist = mCodes.includes(7);
  const flood = mCodes.includes(8);
  if (mCodes.includes(9)) {
    context.state.coolant = "off";
  } else if (mist && flood) {
    context.state.coolant = "mist-flood";
  } else if (mist) {
    context.state.coolant =
      context.state.coolant === "flood" ? "mist-flood" : "mist";
  } else if (flood) {
    context.state.coolant =
      context.state.coolant === "mist" ? "mist-flood" : "flood";
  }

  const customToolSelect = gCodes.some((code) =>
    context.profile.customToolSelectGCodes.has(code),
  );
  if (customToolSelect && context.state.selectedTool !== null) {
    context.state.tool = context.state.selectedTool;
  }
  if (mCodes.includes(6)) {
    if (context.state.selectedTool === null) {
      block.diagnostics.push(
        blockDiagnostic(
          block,
          "warning",
          "TOOL_NOT_SELECTED",
          "M6",
          "M6 được gọi khi chưa có giá trị T chọn dao.",
        ),
      );
    } else {
      context.state.tool = context.state.selectedTool;
    }
    if (context.profile.toolChangeDurationMs > 0) {
      appendDwell(block, context, context.profile.toolChangeDurationMs);
    }
  }
}

function applyCoordinateAndToolState(
  block: ParsedBlock,
  context: InterpreterContext,
  gCodes: readonly number[],
): void {
  if (gCodes.includes(49)) {
    context.state = cancelToolLengthCompensation(context.state);
  } else if (gCodes.includes(43)) {
    const hWord = lastWord(block, "H");
    if (!hWord || !Number.isInteger(hWord.value) || hWord.value < 0) {
      block.diagnostics.push(
        blockDiagnostic(
          block,
          "error",
          "INVALID_TOOL_LENGTH_REGISTER",
          "G43",
          "G43 cần thanh ghi H là số nguyên không âm.",
        ),
      );
    } else {
      const register = Math.trunc(hWord.value);
      const configuredLength =
        context.profile.toolLengthOffsets[register];
      context.state = withToolLengthCompensation(context.state, {
        active: true,
        register,
        length: configuredLength ?? 0,
      });
      if (configuredLength === undefined) {
        block.diagnostics.push(
          blockDiagnostic(
            block,
            "info",
            "TOOL_LENGTH_UNKNOWN",
            `H${register}`,
            `Chưa có chiều dài cho H${register}; đang dùng giá trị 0 mm.`,
          ),
        );
      }
    }
  }
}

function applyG92(
  block: ParsedBlock,
  context: InterpreterContext,
  scale: number,
): void {
  const desired: Partial<Vec3> = {};
  for (const axis of AXES) {
    const word = lastWord(block, AXIS_WORDS[axis]);
    if (word) desired[axis] = word.value * scale;
  }
  if (Object.keys(desired).length === 0) {
    block.diagnostics.push(
      blockDiagnostic(
        block,
        "error",
        "G92_MISSING_AXIS",
        "G92",
        "G92 cần ít nhất một giá trị trục X, Y hoặc Z.",
      ),
    );
    return;
  }
  context.state = setG92FromWorkPosition(context.state, desired);
}

function interpretTravel(
  block: ParsedBlock,
  context: InterpreterContext,
  motionCode: number,
  scale: number,
  machineCoordinates: boolean,
): void {
  if (machineCoordinates && ![0, 1].includes(motionCode)) {
    block.diagnostics.push(
      blockDiagnostic(
        block,
        "error",
        "G53_INVALID_MOTION",
        "G53",
        "G53 chỉ được dùng với chuyển động G0 hoặc G1.",
      ),
    );
    return;
  }

  const start = { ...context.state.machinePosition };
  const touchedAxes = axisWords(block).map((word) => WORD_AXES[word.letter]);
  const unknownAxes = touchedAxes.filter(
    (axis) => !context.state.axesKnown[axis],
  );
  const target = resolveTravelTarget(
    block,
    context.state,
    scale,
    machineCoordinates,
  );

  if (!finiteVector(target)) {
    block.diagnostics.push(
      blockDiagnostic(
        block,
        "error",
        "NON_FINITE_TARGET",
        formatGcodeCommand("G", motionCode),
        "Tọa độ đích không hữu hạn; block không được dựng hình.",
      ),
    );
    return;
  }

  if (unknownAxes.length > 0) {
    const nextKnown = Object.fromEntries(
      touchedAxes.map((axis) => [axis, true]),
    ) as Partial<Record<Axis, boolean>>;
    context.state = withMachinePosition(context.state, target, nextKnown);
    if (motionCode !== 0) {
      block.diagnostics.push(
        blockDiagnostic(
          block,
          "error",
          "UNKNOWN_START_POSITION",
          formatGcodeCommand("G", motionCode),
          `Chưa biết vị trí đầu của trục ${unknownAxes
            .map((axis) => axis.toUpperCase())
            .join("/")}; không dựng đường giả từ gốc.`,
        ),
      );
    }
    return;
  }

  if (motionCode === 2 || motionCode === 3) {
    interpretArc(block, context, start, target, motionCode, scale);
    return;
  }

  const length = distance3D(start, target);
  context.state = withMachinePosition(
    context.state,
    target,
    touchedAxesKnown(touchedAxes),
  );
  if (length === 0) return;
  const type: NormalizedMotionType =
    motionCode === 0 ? "rapid" : "linear";
  if (type === "linear") validateFeed(block, context);
  appendMotion(block, context, {
    type,
    start,
    end: target,
    machineCoordinates,
    distance: length,
    estimatedDurationMs: estimateDuration(type, length, context),
  });
}

function interpretArc(
  block: ParsedBlock,
  context: InterpreterContext,
  start: Vec3,
  target: Vec3,
  motionCode: number,
  scale: number,
): void {
  const center: Partial<Record<"I" | "J" | "K", number>> = {};
  const transform = getCoordinateTransformOffset(context.state);
  const centerAxes = {
    I: "x",
    J: "y",
    K: "z",
  } as const;
  for (const letter of ["I", "J", "K"] as const) {
    const word = lastWord(block, letter);
    if (!word) continue;
    const value = word.value * scale;
    center[letter] =
      context.state.arcDistanceMode === "absolute"
        ? value + transform[centerAxes[letter]]
        : value;
  }
  const radiusWord = lastWord(block, "R");
  const planeWords = centerWordsForPlane(context.state.plane);
  if (
    context.state.arcDistanceMode === "absolute" &&
    Object.keys(center).length > 0 &&
    planeWords.some((word) => center[word] === undefined)
  ) {
    block.diagnostics.push(
      blockDiagnostic(
        block,
        "error",
        "ARC_ABSOLUTE_CENTER_INCOMPLETE",
        formatGcodeCommand("G", motionCode),
        `G90.1 trên mặt phẳng ${context.state.plane} cần đủ ${planeWords.join("/")}.`,
      ),
    );
    return;
  }

  const resolved = resolveArc({
    start,
    end: target,
    plane: context.state.plane,
    clockwise: motionCode === 2,
    center,
    radius:
      radiusWord === undefined ? undefined : radiusWord.value * scale,
    centerMode: context.state.arcDistanceMode,
    radiusTolerance: context.profile.arcRadiusTolerance,
  });
  if (!resolved.ok) {
    block.diagnostics.push(
      blockDiagnostic(
        block,
        "error",
        resolved.code,
        formatGcodeCommand("G", motionCode),
        resolved.message,
      ),
    );
    return;
  }

  validateFeed(block, context);
  context.state = withMachinePosition(
    context.state,
    target,
    touchedAxesKnown(axisWords(block).map((word) => WORD_AXES[word.letter])),
  );
  appendMotion(
    block,
    context,
    {
      type: motionCode === 2 ? "arc-cw" : "arc-ccw",
      start,
      end: target,
      center: resolved.center,
      radius: resolved.radius,
      sweepRadians: resolved.sweepRadians,
      distance: resolved.length,
      estimatedDurationMs: estimateDuration(
        "linear",
        resolved.length,
        context,
      ),
    },
    arcBounds(resolved),
  );
}

function interpretCannedCycle(
  block: ParsedBlock,
  context: InterpreterContext,
  cycleCode: number,
  scale: number,
): void {
  const cyclePlane = cyclePlaneFor(context.state.plane);
  const drillWord = lastWord(block, AXIS_WORDS[cyclePlane.drillAxis]);
  const rWord = lastWord(block, "R");
  const qWord = lastWord(block, "Q");
  const pWord = lastWord(block, "P");
  const previous = context.state.cannedCycle;
  const isNewCycle = previous?.code !== motionMode(cycleCode);
  const initialPlane = isNewCycle
    ? context.state.machinePosition[cyclePlane.drillAxis]
    : previous.initialPlane;

  let retractPlane = previous?.retractPlane;
  if (rWord) {
    retractPlane =
      context.state.distanceMode === "absolute"
        ? workAxisToMachine(
            context.state,
            cyclePlane.drillAxis,
            rWord.value * scale,
          )
        : initialPlane + rWord.value * scale;
  }
  if (retractPlane === undefined) {
    block.diagnostics.push(
      blockDiagnostic(
        block,
        "error",
        "CYCLE_MISSING_R",
        formatGcodeCommand("G", cycleCode),
        "Chu trình khoan cần mặt phẳng rút dao R.",
      ),
    );
    return;
  }

  let depth = previous?.depth;
  if (drillWord) {
    depth =
      context.state.distanceMode === "absolute"
        ? workAxisToMachine(
            context.state,
            cyclePlane.drillAxis,
            drillWord.value * scale,
          )
        : retractPlane + drillWord.value * scale;
  }
  if (depth === undefined) {
    block.diagnostics.push(
      blockDiagnostic(
        block,
        "error",
        "CYCLE_MISSING_DEPTH",
        formatGcodeCommand("G", cycleCode),
        `Chu trình trên mặt phẳng ${context.state.plane} cần trục ${AXIS_WORDS[
          cyclePlane.drillAxis
        ]} xác định độ sâu.`,
      ),
    );
    return;
  }

  const cycle = {
    code: motionMode(cycleCode) as CannedCycleState["code"],
    depth,
    retractPlane,
    peck: qWord ? Math.abs(qWord.value * scale) : (previous?.peck ?? null),
    dwellMs: pWord ? Math.max(0, pWord.value * 1000) : (previous?.dwellMs ?? 0),
    initialPlane,
    feed: context.state.feed,
  } satisfies CannedCycleState;
  context.state.cannedCycle = cycle;

  if ([73, 83].includes(cycleCode) && (!cycle.peck || cycle.peck <= 0)) {
    block.diagnostics.push(
      blockDiagnostic(
        block,
        "error",
        "CYCLE_INVALID_Q",
        formatGcodeCommand("G", cycleCode),
        `${formatGcodeCommand("G", cycleCode)} cần bước khoan Q lớn hơn 0.`,
      ),
    );
    return;
  }
  if (cycle.feed <= 0) validateFeed(block, context);

  const unsupportedExactCycle = [84, 85, 86, 87, 88, 89].includes(cycleCode);
  if (unsupportedExactCycle) {
    block.diagnostics.push(
      blockDiagnostic(
        block,
        "info",
        "CYCLE_APPROXIMATION",
        formatGcodeCommand("G", cycleCode),
        `${formatGcodeCommand("G", cycleCode)} đang được mở rộng gần đúng thành tiến dao xuống và rút dao; thao tác spindle đặc thù chưa được mô phỏng.`,
      ),
    );
  }

  const lWord = lastWord(block, "L");
  const repeats = lWord ? Math.trunc(lWord.value) : 1;
  if (repeats < 1 || (lWord && !Number.isInteger(lWord.value))) {
    block.diagnostics.push(
      blockDiagnostic(
        block,
        "error",
        "CYCLE_INVALID_L",
        formatGcodeCommand("G", cycleCode),
        "Số lần lặp L của chu trình phải là số nguyên dương.",
      ),
    );
    return;
  }

  for (let repeat = 0; repeat < repeats; repeat += 1) {
    const cycleInstanceId = context.nextCycleInstanceId;
    context.nextCycleInstanceId += 1;
    expandCycleRepeat(
      block,
      context,
      cycle,
      cyclePlane,
      scale,
      repeat,
      cycleInstanceId,
    );
  }
}

function expandCycleRepeat(
  block: ParsedBlock,
  context: InterpreterContext,
  cycle: CannedCycleState,
  cyclePlane: CyclePlane,
  scale: number,
  repeat: number,
  cycleInstanceId: number,
): void {
  const start = { ...context.state.machinePosition };
  const location = { ...start };
  for (const axis of cyclePlane.locationAxes) {
    const word = lastWord(block, AXIS_WORDS[axis]);
    if (!word) continue;
    if (context.state.distanceMode === "absolute") {
      location[axis] = workAxisToMachine(
        context.state,
        axis,
        word.value * scale,
      );
    } else {
      location[axis] += word.value * scale;
    }
  }

  if (
    context.state.machinePosition[cyclePlane.drillAxis] <
    cycle.retractPlane
  ) {
    emitCycleTravel(
      block,
      context,
      withAxis(
        context.state.machinePosition,
        cyclePlane.drillAxis,
        cycle.retractPlane,
      ),
      "rapid",
      cycle,
      cycleInstanceId,
    );
  }

  const planarTarget = {
    ...context.state.machinePosition,
    [cyclePlane.locationAxes[0]]: location[cyclePlane.locationAxes[0]],
    [cyclePlane.locationAxes[1]]: location[cyclePlane.locationAxes[1]],
  };
  emitCycleTravel(
    block,
    context,
    planarTarget,
    "rapid",
    cycle,
    cycleInstanceId,
  );
  emitCycleTravel(
    block,
    context,
    withAxis(
      context.state.machinePosition,
      cyclePlane.drillAxis,
      cycle.retractPlane,
    ),
    "rapid",
    cycle,
    cycleInstanceId,
  );

  if (cycle.code === "G83" || cycle.code === "G73") {
    expandPeckCycle(
      block,
      context,
      cycle,
      cyclePlane.drillAxis,
      cycleInstanceId,
    );
  } else {
    emitCycleTravel(
      block,
      context,
      withAxis(
        context.state.machinePosition,
        cyclePlane.drillAxis,
        cycle.depth,
      ),
      "linear",
      cycle,
      cycleInstanceId,
    );
  }

  if ((cycle.code === "G82" || cycle.code === "G89") && cycle.dwellMs > 0) {
    appendDwell(block, context, cycle.dwellMs, cycle.code);
  }

  const clearPlane =
    context.state.retractMode === "initial"
      ? Math.max(cycle.initialPlane, cycle.retractPlane)
      : cycle.retractPlane;
  const retractType =
    cycle.code === "G85" || cycle.code === "G89" ? "linear" : "rapid";
  emitCycleTravel(
    block,
    context,
    withAxis(
      context.state.machinePosition,
      cyclePlane.drillAxis,
      clearPlane,
    ),
    retractType,
    cycle,
    cycleInstanceId,
  );

  const touched = touchedAxesKnown([
    ...cyclePlane.locationAxes,
    cyclePlane.drillAxis,
  ]);
  context.state = withMachinePosition(
    context.state,
    context.state.machinePosition,
    touched,
  );
  void repeat;
}

function expandPeckCycle(
  block: ParsedBlock,
  context: InterpreterContext,
  cycle: CannedCycleState,
  drillAxis: Axis,
  cycleInstanceId: number,
): void {
  const peck = cycle.peck ?? 0;
  const descending = cycle.depth < cycle.retractPlane;
  let reached = cycle.retractPlane;
  let guard = 0;
  while (
    descending ? reached > cycle.depth : reached < cycle.depth
  ) {
    guard += 1;
    if (guard > 100_000) {
      block.diagnostics.push(
        blockDiagnostic(
          block,
          "error",
          "CYCLE_TOO_MANY_PECKS",
          cycle.code,
          "Chu trình tạo quá nhiều bước khoan; hãy tăng Q.",
        ),
      );
      return;
    }
    const next = descending
      ? Math.max(cycle.depth, reached - peck)
      : Math.min(cycle.depth, reached + peck);
    emitCycleTravel(
      block,
      context,
      withAxis(context.state.machinePosition, drillAxis, next),
      "linear",
      cycle,
      cycleInstanceId,
    );
    reached = next;
    if (reached === cycle.depth) break;
    const retract =
      cycle.code === "G73"
        ? reached + (descending ? Math.min(peck * 0.2, 1) : -Math.min(peck * 0.2, 1))
        : cycle.retractPlane;
    emitCycleTravel(
      block,
      context,
      withAxis(context.state.machinePosition, drillAxis, retract),
      "rapid",
      cycle,
      cycleInstanceId,
    );
    if (cycle.code === "G83") {
      emitCycleTravel(
        block,
        context,
        withAxis(context.state.machinePosition, drillAxis, reached),
        "rapid",
        cycle,
        cycleInstanceId,
      );
    }
  }
}

function emitCycleTravel(
  block: ParsedBlock,
  context: InterpreterContext,
  target: Vec3,
  type: "rapid" | "linear",
  cycle: CannedCycleState,
  cycleInstanceId: number,
): void {
  const start = { ...context.state.machinePosition };
  const length = distance3D(start, target);
  context.state = withMachinePosition(context.state, target);
  if (length === 0) return;
  appendMotion(block, context, {
    type,
    start,
    end: target,
    distance: length,
    estimatedDurationMs:
      type === "rapid"
        ? (length / Math.max(1, context.profile.rapidRate)) * 60_000
        : cycle.feed > 0
          ? (length / cycle.feed) * 60_000
          : 0,
    cannedCycle: cycle.code,
    cycleInstanceId,
  });
}

function appendMotion(
  block: ParsedBlock,
  context: InterpreterContext,
  input: Pick<
    NormalizedMotion,
    | "type"
    | "start"
    | "end"
    | "distance"
    | "estimatedDurationMs"
    | "center"
    | "radius"
    | "sweepRadians"
    | "cannedCycle"
    | "cycleInstanceId"
  > &
    Partial<Pick<NormalizedMotion, "machineCoordinates">>,
  exactBounds?: Bounds3,
): void {
  if (
    !finiteVector(input.start) ||
    !finiteVector(input.end) ||
    !Number.isFinite(input.distance) ||
    !Number.isFinite(input.estimatedDurationMs)
  ) {
    block.diagnostics.push(
      blockDiagnostic(
        block,
        "error",
        "NON_FINITE_MOTION",
        null,
        "Chuyển động tạo ra NaN hoặc vô cực và đã bị loại bỏ.",
      ),
    );
    return;
  }
  const motion: NormalizedMotion = {
    id: context.motions.length,
    sourceLine: block.sourceLine,
    lineIndex: block.lineIndex,
    rawText: block.rawText,
    type: input.type,
    machineStart: { ...input.start },
    machineEnd: { ...input.end },
    start: { ...input.start },
    end: { ...input.end },
    workStart: machineToWorkPosition(input.start, context.state),
    workEnd: machineToWorkPosition(input.end, context.state),
    machineCoordinates: input.machineCoordinates ?? false,
    center: input.center ? { ...input.center } : undefined,
    radius: input.radius,
    sweepRadians: input.sweepRadians,
    plane: context.state.plane,
    feed: context.state.feed || undefined,
    spindle: context.state.spindle || undefined,
    tool: context.state.tool ?? undefined,
    spindleState: context.state.spindleState,
    coolant: context.state.coolant,
    coordinateSystem: context.state.coordinateSystem,
    distanceMode: context.state.distanceMode,
    units: context.state.units,
    distance: input.distance,
    estimatedDurationMs: Math.max(0, input.estimatedDurationMs),
    cannedCycle: input.cannedCycle,
    cycleInstanceId: input.cycleInstanceId,
  };
  context.motions.push(motion);
  context.bounds = mergeBounds(
    context.bounds,
    exactBounds ?? boundsForPoints([motion.start, motion.end]),
  );
}

function appendDwell(
  block: ParsedBlock,
  context: InterpreterContext,
  durationMs: number,
  cannedCycle?: CannedCycleState["code"],
): void {
  appendMotion(block, context, {
    type: "dwell",
    start: context.state.machinePosition,
    end: context.state.machinePosition,
    distance: 0,
    estimatedDurationMs: durationMs,
    cannedCycle,
  });
}

function finishBlock(
  block: ParsedBlock,
  context: InterpreterContext,
  mCodes: readonly number[],
): void {
  if (mCodes.includes(2) || mCodes.includes(30)) {
    context.state.programEnded = true;
  }
  block.diagnostics = mergeDiagnostics(block.diagnostics);
  block.stateAfter = cloneModalState(context.state);
}

function resolveTravelTarget(
  block: ParsedBlock,
  state: ModalStateSnapshot,
  scale: number,
  machineCoordinates: boolean,
): Vec3 {
  const target = { ...state.machinePosition };
  const transform = getCoordinateTransformOffset(state);
  for (const axis of AXES) {
    const word = lastWord(block, AXIS_WORDS[axis]);
    if (!word) continue;
    const value = word.value * scale;
    if (machineCoordinates) {
      target[axis] = value;
    } else if (state.distanceMode === "incremental") {
      target[axis] += value;
    } else {
      target[axis] = value + transform[axis];
    }
  }
  return target;
}

function workAxisToMachine(
  state: ModalStateSnapshot,
  axis: Axis,
  value: number,
): number {
  return value + getCoordinateTransformOffset(state)[axis];
}

function estimateDuration(
  type: "rapid" | "linear",
  distance: number,
  context: InterpreterContext,
): number {
  if (type === "rapid") {
    return (distance / Math.max(1, context.profile.rapidRate)) * 60_000;
  }
  if (context.state.feed <= 0) return 0;
  if (context.state.feedMode === "inverse-time") {
    return 60_000 / context.state.feed;
  }
  return (distance / context.state.feed) * 60_000;
}

function validateFeed(
  block: ParsedBlock,
  context: InterpreterContext,
): void {
  if (context.state.feed <= 0) {
    block.diagnostics.push(
      blockDiagnostic(
        block,
        "error",
        "MISSING_FEED",
        context.state.motionMode,
        "Chuyển động cắt chưa có tốc độ F hợp lệ.",
      ),
    );
  }
}

function cyclePlaneFor(plane: Plane): CyclePlane {
  switch (plane) {
    case "XY":
      return { locationAxes: ["x", "y"], drillAxis: "z" };
    case "XZ":
      return { locationAxes: ["x", "z"], drillAxis: "y" };
    case "YZ":
      return { locationAxes: ["y", "z"], drillAxis: "x" };
  }
}

function centerWordsForPlane(
  plane: Plane,
): readonly ("I" | "J" | "K")[] {
  if (plane === "XY") return ["I", "J"];
  if (plane === "XZ") return ["K", "I"];
  return ["J", "K"];
}

function motionMode(code: number): MotionMode {
  return formatGcodeCommand("G", code) as MotionMode;
}

function wordsFor(block: ParsedBlock, letter: string): GcodeWord[] {
  return block.words.filter((word) => word.letter === letter);
}

function lastWord(
  block: ParsedBlock,
  letter: string,
): GcodeWord | undefined {
  return wordsFor(block, letter).at(-1);
}

function lastCode(
  codes: readonly number[],
  allowed: ReadonlySet<number>,
): number | undefined {
  return [...codes].reverse().find((code) => allowed.has(code));
}

function axisWords(block: ParsedBlock): Array<GcodeWord & { letter: AxisWord }> {
  return block.words.filter(
    (word): word is GcodeWord & { letter: AxisWord } =>
      word.letter === "X" ||
      word.letter === "Y" ||
      word.letter === "Z",
  );
}

function hasAxisWords(block: ParsedBlock): boolean {
  return axisWords(block).length > 0;
}

function hasArcDefinition(block: ParsedBlock): boolean {
  return ["I", "J", "K", "R"].some((letter) =>
    block.words.some((word) => word.letter === letter),
  );
}

function reportDuplicateWords(block: ParsedBlock): void {
  const seen = new Map<string, number>();
  for (const word of block.words) {
    if (word.letter === "G" || word.letter === "M" || word.letter === "N") {
      continue;
    }
    const count = (seen.get(word.letter) ?? 0) + 1;
    seen.set(word.letter, count);
    if (count === 2) {
      block.diagnostics.push(
        blockDiagnostic(
          block,
          "warning",
          "DUPLICATE_WORD",
          word.letter,
          `Dòng có nhiều word ${word.letter}; interpreter dùng giá trị xuất hiện cuối cùng.`,
        ),
      );
    }
  }
}

function reportUnsupportedWords(block: ParsedBlock): void {
  const letters = new Set(
    block.words
      .map((word) => word.letter)
      .filter((letter) => !SUPPORTED_WORDS.has(letter)),
  );
  for (const letter of letters) {
    block.diagnostics.push(
      blockDiagnostic(
        block,
        "info",
        "UNSUPPORTED_WORD",
        letter,
        `Word ${letter} chưa được dùng trong kiến trúc router 3 trục.`,
      ),
    );
  }
}

function reportUnsupportedCommands(
  block: ParsedBlock,
  profile: MachineProfile,
  gWords: readonly GcodeWord[],
  mWords: readonly GcodeWord[],
): void {
  for (const word of gWords) {
    if (!isGCodeSupported(profile, word.value)) {
      block.diagnostics.push(
        blockDiagnostic(
          block,
          "warning",
          "UNSUPPORTED_G",
          formatGcodeCommand("G", word.value),
          `${formatGcodeCommand("G", word.value)} chưa được profile ${profile.name} hỗ trợ.`,
        ),
      );
    }
  }
  for (const word of mWords) {
    if (
      !isMCodeSupported(profile, word.value) &&
      !profile.customSpindleOnMCodes.has(word.value)
    ) {
      block.diagnostics.push(
        blockDiagnostic(
          block,
          "warning",
          "UNSUPPORTED_M",
          formatGcodeCommand("M", word.value),
          `${formatGcodeCommand("M", word.value)} chưa được profile ${profile.name} ánh xạ trạng thái máy.`,
        ),
      );
    }
  }
}

function touchedAxesKnown(
  axes: readonly Axis[],
): Partial<Record<Axis, boolean>> {
  return Object.fromEntries(axes.map((axis) => [axis, true]));
}

function withAxis(point: Vec3, axis: Axis, value: number): Vec3 {
  return { ...point, [axis]: value };
}

function finiteVector(point: Vec3): boolean {
  return AXES.every((axis) => Number.isFinite(point[axis]));
}

function unitScale(state: ModalStateSnapshot): number {
  return state.units === "inch" ? 25.4 : 1;
}

function blockDiagnostic(
  block: ParsedBlock | undefined,
  severity: Diagnostic["severity"],
  code: string,
  command: string | null,
  message: string,
): Diagnostic {
  return createDiagnostic({
    lineIndex: block?.lineIndex ?? 0,
    sourceLine: block?.sourceLine ?? 1,
    severity,
    code,
    command,
    message,
    rawText: block?.rawText ?? "",
  });
}
