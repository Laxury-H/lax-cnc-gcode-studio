import { cloneVec3, distance3D, lerpVec3 } from "@/core/geometry/line";
import type { Segment, Vec3 } from "@/core/simulation/types";
import type { TranslationDict } from "@/app/i18n";

export type ViewMode = "xoy" | "iso" | "solid" | "machine";
export type OrbitCamera = { yaw: number; pitch: number };

const EPSILON = 0.001;

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
  const clamped = Math.max(0, Math.min(1, progress));
  if (segment.points.length <= 2) {
    return lerpVec3(segment.start, segment.end, clamped);
  }

  const total = segment.length || 1;
  let target = total * clamped;
  for (let index = 1; index < segment.points.length; index += 1) {
    const from = segment.points[index - 1];
    const to = segment.points[index];
    const length = distance3D(from, to);
    if (target <= length || index === segment.points.length - 1) {
      const ratio = length <= EPSILON ? 0 : target / length;
      return lerpVec3(from, to, ratio);
    }
    target -= length;
  }
  return cloneVec3(segment.end);
}

export function partialPoints(segment: Segment, progress: number) {
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped >= 1) return segment.points;
  if (clamped <= 0) return [segment.start];
  const total = segment.length || 1;
  let remaining = total * clamped;
  const result = [segment.points[0]];
  for (let index = 1; index < segment.points.length; index += 1) {
    const from = segment.points[index - 1];
    const to = segment.points[index];
    const length = distance3D(from, to);
    if (remaining >= length) {
      result.push(to);
      remaining -= length;
    } else {
      const ratio = length <= EPSILON ? 0 : remaining / length;
      result.push(lerpVec3(from, to, ratio));
      break;
    }
  }
  return result;
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
  if (segment.kind === "rapid") return t.rapidMove;
  if (segment.kind === "cut") return t.linearCut;
  if (segment.kind === "arc-cw") return t.arcCw;
  if (segment.kind === "arc-ccw") return t.arcCcw;
  if (segment.kind === "dwell") return t.dwell;
  return t.drillCycle;
}
