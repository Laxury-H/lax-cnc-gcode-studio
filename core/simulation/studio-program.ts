import {
  DEFAULT_ARC_QUALITY,
  resolveArc,
  sampleArc,
} from "../geometry/arc";
import { cloneVec3, distance2D } from "../geometry/line";
import { createDiagnostic, mergeDiagnostics } from "../gcode/diagnostics";
import {
  createMachineProfile,
  resolveMachineProfile,
} from "../gcode/dialects";
import { interpretGcode } from "../gcode/interpreter";
import type {
  Diagnostic,
  NormalizedMotion,
  Plane,
  Vec3,
} from "../gcode/types";
import { detectParts, rectangleGap } from "./parts";
import { extractOffcuts } from "./remnants";
import type {
  MotionKind,
  Segment,
  Simulation,
  StockSettings,
  StudioMachineProfile,
} from "./types";

const STUDIO_EPSILON = 0.001;

export const DEFAULT_STOCK: StockSettings = {
  width: 2440,
  height: 1220,
  thickness: 18,
  originX: 0,
  originY: 0,
  safeZ: 22,
  toolDiameter: 6,
  clearance: 12,
  rapidFeed: 8000,
};

export function parseProgram(
  source: string,
  stock: StockSettings,
  profileId: StudioMachineProfile,
): Simulation {
  const profile = createMachineProfile(resolveMachineProfile(profileId), {
    rapidRate: Math.max(1, stock.rapidFeed),
  });
  const interpreted = interpretGcode(source, {
    profile,
    initialPosition: {
      x: stock.originX,
      y: stock.originY,
      z: stock.safeZ,
    },
    initialAxesKnown: { x: false, y: false, z: true },
  });
  const segments = interpreted.motions.map(motionToSegment);
  const parts = detectParts(segments, stock);
  const offcuts = extractOffcuts(parts, stock);
  const diagnostics = addStudioDiagnostics(
    interpreted.diagnostics,
    interpreted.motions,
    segments,
    parts,
    stock,
  );

  let cutLength = 0;
  let rapidLength = 0;
  let drillHoles = 0;
  const drillKeys = new Set<string>();
  for (const segment of segments) {
    if (segment.kind === "rapid") {
      rapidLength += segment.length;
    } else if (segment.kind !== "dwell") {
      cutLength += segment.length;
    }
    if (segment.kind === "drill") {
      const key = `${segment.cannedCycleKey}-${segment.cycleInstanceId ?? segment.id}`;
      if (!drillKeys.has(key)) {
        drillKeys.add(key);
        drillHoles += 1;
      }
    }
  }

  const bounds = segments.length
    ? interpreted.bounds
    : {
        minX: stock.originX,
        minY: stock.originY,
        minZ: 0,
        maxX: stock.originX,
        maxY: stock.originY,
        maxZ: stock.safeZ,
      };
  const finalState = interpreted.finalState;

  return {
    lines: interpreted.lines,
    segments,
    motions: interpreted.motions,
    diagnostics,
    parts,
    offcuts,
    cutLength,
    rapidLength,
    estimatedSeconds:
      interpreted.motions.reduce(
        (total, motion) => total + motion.estimatedDurationMs,
        0,
      ) / 1000,
    drillHoles,
    bounds,
    finalState: {
      position: cloneVec3(finalState.machinePosition),
      workPosition: cloneVec3(finalState.workPosition),
      feed: finalState.feed,
      spindle: finalState.spindle,
      tool: finalState.tool === null ? "—" : `T${finalState.tool}`,
      units: finalState.units,
      absolute: finalState.distanceMode === "absolute",
      spindleOn: finalState.spindleState !== "off",
      plane: finalState.plane,
      coordinateSystem: finalState.coordinateSystem,
      feedMode: finalState.feedMode,
      coolant: finalState.coolant,
    },
  };
}

export function orientStockForProgram(
  source: string,
  current: StockSettings,
  profile: StudioMachineProfile,
) {
  if (Math.abs(current.width - current.height) <= STUDIO_EPSILON) {
    return { stock: current, rotated: false };
  }
  const preview = parseProgram(source, current, profile);
  const tolerance = Math.max(10, current.toolDiameter);
  const fits = (width: number, height: number) =>
    preview.bounds.minX >= current.originX - tolerance &&
    preview.bounds.maxX <= current.originX + width + tolerance &&
    preview.bounds.minY >= current.originY - tolerance &&
    preview.bounds.maxY <= current.originY + height + tolerance;
  const currentFits = fits(current.width, current.height);
  const rotatedFits = fits(current.height, current.width);
  if (!currentFits && rotatedFits) {
    return {
      stock: { ...current, width: current.height, height: current.width },
      rotated: true,
    };
  }
  return { stock: current, rotated: false };
}

function motionToSegment(motion: NormalizedMotion): Segment {
  let points: Vec3[];
  if (
    (motion.type === "arc-cw" || motion.type === "arc-ccw") &&
    motion.center
  ) {
    const resolved = resolveArc({
      start: motion.start,
      end: motion.end,
      plane: motion.plane,
      clockwise: motion.type === "arc-cw",
      center: centerWords(motion.center, motion.plane),
      centerMode: "absolute",
      radiusTolerance: 0.05,
    });
    points = resolved.ok
      ? sampleArc(resolved, DEFAULT_ARC_QUALITY)
      : [cloneVec3(motion.start), cloneVec3(motion.end)];
  } else if (motion.type === "dwell") {
    points = [cloneVec3(motion.start)];
  } else {
    points = [cloneVec3(motion.start), cloneVec3(motion.end)];
  }

  const kind = motionKind(motion);
  return {
    id: motion.id,
    motionId: motion.id,
    lineIndex: motion.lineIndex,
    lineNumber: motion.sourceLine,
    raw: motion.rawText,
    start: cloneVec3(motion.start),
    end: cloneVec3(motion.end),
    points,
    kind,
    plane: motion.plane,
    center: motion.center ? cloneVec3(motion.center) : undefined,
    radius: motion.radius,
    sweepRadians: motion.sweepRadians,
    feed: motion.feed ?? 0,
    spindle: motion.spindle ?? 0,
    tool: motion.tool === undefined ? "—" : `T${motion.tool}`,
    units: motion.units,
    length: motion.distance,
    estimatedDurationMs: motion.estimatedDurationMs,
    cannedCycleKey: motion.cannedCycle,
    cycleInstanceId: motion.cycleInstanceId,
  };
}

function motionKind(motion: NormalizedMotion): MotionKind {
  if (motion.type === "rapid") return "rapid";
  if (motion.type === "arc-cw") return "arc-cw";
  if (motion.type === "arc-ccw") return "arc-ccw";
  if (motion.type === "dwell") return "dwell";
  return motion.cannedCycle ? "drill" : "cut";
}

function centerWords(center: Vec3, plane: Plane) {
  if (plane === "XY") return { I: center.x, J: center.y };
  if (plane === "XZ") return { K: center.z, I: center.x };
  return { J: center.y, K: center.z };
}

function addStudioDiagnostics(
  base: readonly Diagnostic[],
  motions: readonly NormalizedMotion[],
  segments: readonly Segment[],
  parts: Simulation["parts"],
  stock: StockSettings,
): Diagnostic[] {
  const diagnostics = [...base];
  let spindleWarningReported = false;

  for (const motion of motions) {
    const segment = segments[motion.id];
    const isCut =
      motion.type === "linear" ||
      motion.type === "arc-cw" ||
      motion.type === "arc-ccw";
    const planarChange = distance2D(motion.start, motion.end) > STUDIO_EPSILON;
    const stockTolerance = Math.max(0.1, stock.toolDiameter / 2);
    if (
      planarChange &&
      segment.points.some(
        (point) =>
          point.x < stock.originX - stockTolerance - STUDIO_EPSILON ||
          point.x >
            stock.originX +
              stock.width +
              stockTolerance +
              STUDIO_EPSILON ||
          point.y < stock.originY - stockTolerance - STUDIO_EPSILON ||
          point.y >
            stock.originY +
              stock.height +
              stockTolerance +
              STUDIO_EPSILON,
      )
    ) {
      diagnostics.push(
        motionDiagnostic(
          motion,
          "warning",
          "OUTSIDE_STOCK",
          "Tọa độ X/Y nằm ngoài vùng phôi đang khai báo.",
        ),
      );
    }
    if (
      motion.type === "rapid" &&
      planarChange &&
      Math.min(motion.start.z, motion.end.z) <
        stock.safeZ - STUDIO_EPSILON
    ) {
      diagnostics.push(
        motionDiagnostic(
          motion,
          "warning",
          "LOW_RAPID",
          `G0 chạy ngang dưới Z an toàn ${stock.safeZ.toFixed(3)}.`,
        ),
      );
    }
    if (
      isCut &&
      motion.spindleState === "off" &&
      !spindleWarningReported
    ) {
      diagnostics.push(
        motionDiagnostic(
          motion,
          "warning",
          "SPINDLE_OFF",
          "Có chuyển động cắt khi trạng thái spindle chưa bật.",
        ),
      );
      spindleWarningReported = true;
    }
  }

  const reportedPairs = new Set<string>();
  for (let left = 0; left < parts.length; left += 1) {
    for (let right = left + 1; right < parts.length; right += 1) {
      const gap = rectangleGap(parts[left], parts[right]);
      if (gap >= stock.clearance - STUDIO_EPSILON) continue;
      const pair = `${parts[left].id}-${parts[right].id}`;
      if (reportedPairs.has(pair)) continue;
      diagnostics.push(
        partDiagnostic(
          segments,
          parts[right].sourceLine,
          gap <= STUDIO_EPSILON ? "error" : "warning",
          gap <= STUDIO_EPSILON ? "PART_OVERLAP" : "PART_GAP",
          gap <= STUDIO_EPSILON
            ? `${parts[left].id} và ${parts[right].id} đang chồng biên dạng.`
            : `Khoảng cách ${parts[left].id}–${parts[right].id} chỉ ${gap.toFixed(1)} mm, nhỏ hơn mức ${stock.clearance.toFixed(1)} mm.`,
        ),
      );
      reportedPairs.add(pair);
    }
  }

  for (const part of parts) {
    if (part.edgeGap >= stock.clearance - STUDIO_EPSILON) continue;
    diagnostics.push(
      partDiagnostic(
        segments,
        part.sourceLine,
        part.edgeGap < 0 ? "error" : "warning",
        "EDGE_GAP",
        `${part.id} cách mép phôi ${part.edgeGap.toFixed(1)} mm, nhỏ hơn mức ${stock.clearance.toFixed(1)} mm.`,
      ),
    );
  }

  return mergeDiagnostics(diagnostics);
}

function motionDiagnostic(
  motion: NormalizedMotion,
  severity: Diagnostic["severity"],
  code: string,
  message: string,
): Diagnostic {
  return createDiagnostic({
    lineIndex: motion.lineIndex,
    sourceLine: motion.sourceLine,
    severity,
    code,
    command: motion.rawText.trim() || null,
    message,
    rawText: motion.rawText,
  });
}

function partDiagnostic(
  segments: readonly Segment[],
  lineIndex: number,
  severity: Diagnostic["severity"],
  code: string,
  message: string,
): Diagnostic {
  const segment = segments.find((candidate) => candidate.lineIndex === lineIndex);
  return createDiagnostic({
    lineIndex,
    sourceLine: lineIndex + 1,
    severity,
    code,
    command: segment?.raw.trim() || null,
    message,
    rawText: segment?.raw ?? "",
  });
}

export { extractOffcuts } from "./remnants";
export { generateSmartResume } from "./recovery";
export { exportCAM } from "./post-processor";
