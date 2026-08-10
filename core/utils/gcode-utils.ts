import type { Segment, Units, Vec3 } from "@/core/simulation/types";
import type { TranslationDict } from "@/app/i18n";
import {
  pointAtToolpathProgress,
  sliceToolpathPoints,
} from "@/core/simulation/stock-removal-coordinates";

export type ViewMode = "xoy" | "iso" | "solid" | "machine";
export type OrbitCamera = { yaw: number; pitch: number };

export function getViewMeta(viewMode: ViewMode, t: TranslationDict) {
  if (viewMode === "xoy") {
    return {
      short: "📐 2D",
      title: t.view2D,
      description: t.desc2D,
    };
  }
  if (viewMode === "solid") {
    return {
      short: "🪵 3D Solid",
      title: "3D Solid",
      description: "WebGL heightmap simulation",
    };
  }
  if (viewMode === "machine") {
    return {
      short: "🤖 3D Machine",
      title: t.machine3DTitle,
      description: t.machine3DMetaDesc,
    };
  }
  return {
    short: "📦 3D",
    title: t.view3D,
    description: t.desc3D,
  };
}

export function pointOnSegment(segment: Segment, progress: number): Vec3 {
  const points = segment.points.length > 0
    ? segment.points
    : [segment.start, segment.end];
  return pointAtToolpathProgress(points, progress);
}

export function pointOnSegmentInWorkCoordinates(
  segment: Segment,
  progress: number,
): Vec3 {
  const point = pointOnSegment(segment, progress);
  const workStart = segment.workStart ?? segment.start;
  return {
    x: point.x + workStart.x - segment.start.x,
    y: point.y + workStart.y - segment.start.y,
    z: point.z + workStart.z - segment.start.z,
  };
}

export function pointOnSegmentInTelemetryCoordinates(
  segment: Segment,
  progress: number,
): Vec3 {
  if (!segment.machineCoordinates) {
    return pointOnSegmentInWorkCoordinates(segment, progress);
  }
  const machineStart = segment.machineStart ?? segment.start;
  const machineEnd = segment.machineEnd ?? segment.end;
  return pointAtToolpathProgress([machineStart, machineEnd], progress);
}

export function pointInProgramUnits(point: Vec3, units: Units): Vec3 {
  if (units !== "inch") return { ...point };
  return {
    x: point.x / 25.4,
    y: point.y / 25.4,
    z: point.z / 25.4,
  };
}

export function partialPoints(segment: Segment, progress: number) {
  const clamped = Math.max(0, Math.min(1, progress));
  const points = segment.points.length > 0
    ? segment.points
    : [segment.start, segment.end];
  if (clamped >= 1) return points;
  if (clamped <= 0) return [segment.start];
  return sliceToolpathPoints(points, 0, clamped);
}

export function formatTime(totalSeconds: number) {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatLength(mm: number) {
  return mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${mm.toFixed(1)} mm`;
}

export function motionLabel(segment: Segment | undefined, t: TranslationDict) {
  if (!segment) return t.noMotion;
  if (segment.machineCoordinates) return t.machineMove;
  if (segment.kind === "rapid") return t.rapidMove;
  if (segment.kind === "cut") return t.linearCut;
  if (segment.kind === "arc-cw") return t.arcCw;
  if (segment.kind === "arc-ccw") return t.arcCcw;
  if (segment.kind === "dwell") return t.dwell;
  return t.drillCycle;
}
