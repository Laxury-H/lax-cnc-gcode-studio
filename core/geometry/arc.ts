import type {
  ArcDistanceMode,
  ArcQuality,
  Bounds3,
  Plane,
  Vec3,
} from "../gcode/types";
import { boundsForPoints, includePoint } from "./bounds";
import { cloneVec3 } from "./line";
import {
  DEFAULT_ARC_RADIUS_TOLERANCE,
  DEFAULT_GEOMETRY_TOLERANCE,
  isFiniteNumber,
  isFiniteVec3,
  nearlyEqual,
  normalizeTolerance,
  type ToleranceInput,
} from "./tolerance";

const TAU = Math.PI * 2;
const CARDINAL_ANGLES = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2];
const HARD_MAX_ARC_SEGMENTS = 1_000_000;

export type ArcCenterWord = "I" | "J" | "K";

export type ArcCenterWords = Partial<Record<ArcCenterWord, number>>;

export type ArcInput = {
  start: Vec3;
  end: Vec3;
  plane: Plane;
  clockwise: boolean;
  center?: ArcCenterWords;
  radius?: number;
  centerMode?: ArcDistanceMode;
  radiusTolerance?: ToleranceInput;
  geometryTolerance?: ToleranceInput;
};

export type ArcErrorCode =
  | "ARC_NON_FINITE_INPUT"
  | "ARC_INVALID_PLANE"
  | "ARC_INVALID_DIRECTION"
  | "ARC_INVALID_TOLERANCE"
  | "ARC_DEFINITION_CONFLICT"
  | "ARC_MISSING_DEFINITION"
  | "ARC_OFFSET_OUTSIDE_PLANE"
  | "ARC_ZERO_RADIUS"
  | "ARC_RADIUS_MISMATCH"
  | "ARC_IMPOSSIBLE_RADIUS"
  | "ARC_RADIUS_FULL_CIRCLE"
  | "ARC_DEGENERATE"
  | "ARC_NON_FINITE_GEOMETRY";

export type ArcResolutionError = {
  ok: false;
  code: ArcErrorCode;
  message: string;
};

export type ResolvedArc = {
  ok: true;
  format: "center" | "radius";
  start: Vec3;
  end: Vec3;
  plane: Plane;
  clockwise: boolean;
  center: Vec3;
  radius: number;
  startAngle: number;
  endAngle: number;
  sweepRadians: number;
  planarLength: number;
  length: number;
};

export type ArcResolution = ResolvedArc | ArcResolutionError;

export const DEFAULT_ARC_QUALITY: ArcQuality = Object.freeze({
  chordError: 0.05,
  minSegments: 8,
  maxSegments: 4096,
});

export function resolveArc(input: ArcInput): ArcResolution {
  if (typeof input !== "object" || input === null) {
    return arcError(
      "ARC_NON_FINITE_INPUT",
      "Dữ liệu cung phải là một đối tượng hợp lệ.",
    );
  }
  if (!isFiniteVec3(input.start) || !isFiniteVec3(input.end)) {
    return arcError(
      "ARC_NON_FINITE_INPUT",
      "Điểm đầu và điểm cuối của cung phải có tọa độ hữu hạn.",
    );
  }
  if (input.plane !== "XY" && input.plane !== "XZ" && input.plane !== "YZ") {
    return arcError(
      "ARC_INVALID_PLANE",
      "Mặt phẳng cung phải là XY, XZ hoặc YZ.",
    );
  }
  if (typeof input.clockwise !== "boolean") {
    return arcError(
      "ARC_INVALID_DIRECTION",
      "Hướng cung phải được xác định là thuận chiều hoặc ngược chiều kim đồng hồ.",
    );
  }

  const geometryTolerance = normalizeTolerance(
    input.geometryTolerance ?? DEFAULT_GEOMETRY_TOLERANCE,
  );
  const radiusTolerance = normalizeTolerance(
    input.radiusTolerance ?? DEFAULT_ARC_RADIUS_TOLERANCE,
  );
  if (!geometryTolerance || !radiusTolerance) {
    return arcError(
      "ARC_INVALID_TOLERANCE",
      "Dung sai hình học và dung sai bán kính phải là số hữu hạn không âm.",
    );
  }

  const centerWords = presentCenterWords(input.center);
  const hasCenter = centerWords.length > 0;
  const hasRadius = input.radius !== undefined;
  if (hasCenter && hasRadius) {
    return arcError(
      "ARC_DEFINITION_CONFLICT",
      "Cung không được khai báo đồng thời bằng I/J/K và R.",
    );
  }
  if (!hasCenter && !hasRadius) {
    return arcError(
      "ARC_MISSING_DEFINITION",
      "Thiếu I/J/K hoặc R để xác định tâm cung.",
    );
  }

  const plane = planeDefinition(input.plane);
  const start = toPlanePoint(input.start, input.plane);
  const end = toPlanePoint(input.end, input.plane);
  const samePlanarPoint =
    nearlyEqual(start.u, end.u, geometryTolerance) &&
    nearlyEqual(start.v, end.v, geometryTolerance);

  if (hasCenter) {
    const outsideWord = centerWords.find(
      (word) => !plane.centerWords.includes(word),
    );
    if (outsideWord) {
      return arcError(
        "ARC_OFFSET_OUTSIDE_PLANE",
        `Từ ${outsideWord} không thuộc mặt phẳng ${input.plane} đang chọn.`,
      );
    }
    return resolveCenterArc(
      input,
      start,
      end,
      samePlanarPoint,
      geometryTolerance,
      radiusTolerance,
    );
  }

  return resolveRadiusArc(
    input,
    start,
    end,
    samePlanarPoint,
    geometryTolerance,
  );
}

export function arcSegmentCount(
  arc: ResolvedArc,
  quality: ArcQuality = DEFAULT_ARC_QUALITY,
): number {
  assertResolvedArc(arc);
  const normalized = normalizeArcQuality(quality);
  const ratio = normalized.chordError / arc.radius;
  let maximumAngle: number;

  if (ratio >= 1) {
    maximumAngle = Math.PI;
  } else if (ratio <= 0 || !isFiniteNumber(ratio)) {
    maximumAngle = 0;
  } else {
    maximumAngle = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - ratio)));
    if (maximumAngle === 0) {
      maximumAngle = Math.sqrt(8 * ratio);
    }
  }

  const requested =
    maximumAngle > 0
      ? Math.ceil(Math.abs(arc.sweepRadians) / maximumAngle)
      : normalized.maxSegments;
  return Math.max(
    normalized.minSegments,
    Math.min(normalized.maxSegments, requested),
  );
}

export function sampleArc(
  arc: ResolvedArc,
  quality: ArcQuality = DEFAULT_ARC_QUALITY,
): Vec3[] {
  assertResolvedArc(arc);
  const segmentCount = arcSegmentCount(arc, quality);
  const start = toPlanePoint(arc.start, arc.plane);
  const end = toPlanePoint(arc.end, arc.plane);
  const center = toPlanePoint(arc.center, arc.plane);
  const points: Vec3[] = new Array(segmentCount + 1);

  for (let index = 0; index <= segmentCount; index += 1) {
    const ratio = index / segmentCount;
    const angle = arc.startAngle + arc.sweepRadians * ratio;
    const point = fromPlanePoint(
      center.u + Math.cos(angle) * arc.radius,
      center.v + Math.sin(angle) * arc.radius,
      stableLerp(start.w, end.w, ratio),
      arc.plane,
    );
    if (!isFiniteVec3(point)) {
      throw new RangeError(
        "Không thể lấy mẫu cung vì tọa độ vượt giới hạn số hữu hạn.",
      );
    }
    points[index] = point;
  }

  points[0] = cloneVec3(arc.start);
  points[segmentCount] = cloneVec3(arc.end);
  return points;
}

export function arcBounds(arc: ResolvedArc): Bounds3 {
  assertResolvedArc(arc);
  const start = toPlanePoint(arc.start, arc.plane);
  const end = toPlanePoint(arc.end, arc.plane);
  const center = toPlanePoint(arc.center, arc.plane);
  let bounds = boundsForPoints([arc.start, arc.end]);

  for (const angle of CARDINAL_ANGLES) {
    const progress = progressAtAngle(
      arc.startAngle,
      angle,
      arc.sweepRadians,
    );
    if (progress === null) {
      continue;
    }
    const ratio = progress / Math.abs(arc.sweepRadians);
    const point = fromPlanePoint(
      center.u + Math.cos(angle) * arc.radius,
      center.v + Math.sin(angle) * arc.radius,
      stableLerp(start.w, end.w, ratio),
      arc.plane,
    );
    if (!isFiniteVec3(point)) {
      throw new RangeError(
        "Không thể tính bounds vì cung vượt giới hạn số hữu hạn.",
      );
    }
    bounds = includePoint(bounds, point);
  }

  return bounds;
}

function resolveCenterArc(
  input: ArcInput,
  start: PlanePoint,
  end: PlanePoint,
  samePlanarPoint: boolean,
  geometryTolerance: NonNullable<ReturnType<typeof normalizeTolerance>>,
  radiusTolerance: NonNullable<ReturnType<typeof normalizeTolerance>>,
): ArcResolution {
  const centerMode = input.centerMode ?? "incremental";
  if (centerMode !== "absolute" && centerMode !== "incremental") {
    return arcError(
      "ARC_NON_FINITE_INPUT",
      "Chế độ tâm cung phải là tuyệt đối hoặc tương đối.",
    );
  }

  const plane = planeDefinition(input.plane);
  const firstWord = plane.centerWords[0];
  const secondWord = plane.centerWords[1];
  const firstValue = input.center?.[firstWord];
  const secondValue = input.center?.[secondWord];
  if (
    (firstValue !== undefined && !isFiniteNumber(firstValue)) ||
    (secondValue !== undefined && !isFiniteNumber(secondValue))
  ) {
    return arcError(
      "ARC_NON_FINITE_INPUT",
      "Giá trị I/J/K của tâm cung phải là số hữu hạn.",
    );
  }

  const centerU =
    firstValue === undefined
      ? start.u
      : centerMode === "absolute"
        ? firstValue
        : start.u + firstValue;
  const centerV =
    secondValue === undefined
      ? start.v
      : centerMode === "absolute"
        ? secondValue
        : start.v + secondValue;
  if (!isFiniteNumber(centerU) || !isFiniteNumber(centerV)) {
    return arcError(
      "ARC_NON_FINITE_GEOMETRY",
      "Tọa độ tâm cung vượt giới hạn số hữu hạn.",
    );
  }

  const startRadius = safeHypot(start.u - centerU, start.v - centerV);
  const endRadius = safeHypot(end.u - centerU, end.v - centerV);
  if (startRadius === null || endRadius === null) {
    return arcError(
      "ARC_NON_FINITE_GEOMETRY",
      "Bán kính cung vượt giới hạn số hữu hạn.",
    );
  }
  if (nearlyEqual(startRadius, 0, geometryTolerance)) {
    return arcError(
      "ARC_ZERO_RADIUS",
      "Điểm đầu trùng với tâm nên bán kính cung bằng 0.",
    );
  }
  if (!nearlyEqual(startRadius, endRadius, radiusTolerance)) {
    return arcError(
      "ARC_RADIUS_MISMATCH",
      `Bán kính tại điểm đầu (${formatNumber(startRadius)}) và điểm cuối (${formatNumber(endRadius)}) không khớp.`,
    );
  }

  const radius = startRadius / 2 + endRadius / 2;
  const center = fromPlanePoint(centerU, centerV, start.w, input.plane);
  return buildResolvedArc(
    input,
    "center",
    start,
    end,
    center,
    radius,
    samePlanarPoint,
  );
}

function resolveRadiusArc(
  input: ArcInput,
  start: PlanePoint,
  end: PlanePoint,
  samePlanarPoint: boolean,
  geometryTolerance: NonNullable<ReturnType<typeof normalizeTolerance>>,
): ArcResolution {
  const radiusWord = input.radius;
  if (!isFiniteNumber(radiusWord)) {
    return arcError(
      "ARC_NON_FINITE_INPUT",
      "Giá trị R của cung phải là số hữu hạn.",
    );
  }
  if (samePlanarPoint) {
    return arcError(
      "ARC_RADIUS_FULL_CIRCLE",
      "Không thể xác định full-circle chỉ bằng R; hãy dùng I/J/K.",
    );
  }

  const radius = Math.abs(radiusWord);
  if (nearlyEqual(radius, 0, geometryTolerance)) {
    return arcError("ARC_ZERO_RADIUS", "Bán kính R phải lớn hơn 0.");
  }

  const deltaU = end.u - start.u;
  const deltaV = end.v - start.v;
  const chord = safeHypot(deltaU, deltaV);
  if (chord === null) {
    return arcError(
      "ARC_NON_FINITE_GEOMETRY",
      "Độ dài dây cung vượt giới hạn số hữu hạn.",
    );
  }
  if (radius < chord / 2 && !nearlyEqual(radius, chord / 2, geometryTolerance)) {
    return arcError(
      "ARC_IMPOSSIBLE_RADIUS",
      `Bán kính R=${formatNumber(radius)} nhỏ hơn nửa dây cung ${formatNumber(chord / 2)}.`,
    );
  }

  const midpointU = start.u / 2 + end.u / 2;
  const midpointV = start.v / 2 + end.v / 2;
  const halfChord = chord / 2;
  // Khi R chỉ nhỏ hơn nửa dây cung trong phạm vi dung sai, kẹp về bán kính
  // bán nguyệt để hình học giải được chính xác thay vì tạo điểm trung gian lệch.
  const solvedRadius = Math.max(radius, halfChord);
  const ratio = Math.min(1, halfChord / solvedRadius);
  const height =
    solvedRadius * Math.sqrt(Math.max(0, 1 - ratio * ratio));
  const normalU = -deltaV / chord;
  const normalV = deltaU / chord;
  const candidates = [
    { u: midpointU + normalU * height, v: midpointV + normalV * height },
    { u: midpointU - normalU * height, v: midpointV - normalV * height },
  ].filter(
    (candidate) => isFiniteNumber(candidate.u) && isFiniteNumber(candidate.v),
  );

  const desiredMajor = radiusWord < 0;
  const scored = candidates
    .map((candidate) => {
      const angles = calculateAngles(
        start,
        end,
        candidate.u,
        candidate.v,
        input.clockwise,
        false,
      );
      return angles
        ? {
            ...candidate,
            ...angles,
            major: Math.abs(angles.sweep) > Math.PI + 1e-12,
          }
        : null;
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate),
    );
  const selected =
    scored.find((candidate) => candidate.major === desiredMajor) ?? scored[0];
  if (!selected) {
    return arcError(
      "ARC_DEGENERATE",
      "Không thể chọn được tâm phù hợp với hướng G2/G3 và dấu của R.",
    );
  }

  const center = fromPlanePoint(
    selected.u,
    selected.v,
    start.w,
    input.plane,
  );
  return buildResolvedArc(
    input,
    "radius",
    start,
    end,
    center,
    solvedRadius,
    false,
    selected,
  );
}

function buildResolvedArc(
  input: ArcInput,
  format: ResolvedArc["format"],
  start: PlanePoint,
  end: PlanePoint,
  center: Vec3,
  radius: number,
  fullCircle: boolean,
  knownAngles?: { startAngle: number; endAngle: number; sweep: number },
): ArcResolution {
  if (!isFiniteVec3(center) || !isFiniteNumber(radius) || radius <= 0) {
    return arcError(
      "ARC_NON_FINITE_GEOMETRY",
      "Tâm hoặc bán kính cung không hợp lệ.",
    );
  }

  const centerInPlane = toPlanePoint(center, input.plane);
  const angles =
    knownAngles ??
    calculateAngles(
      start,
      end,
      centerInPlane.u,
      centerInPlane.v,
      input.clockwise,
      fullCircle,
    );
  if (!angles || !isFiniteNumber(angles.sweep) || angles.sweep === 0) {
    return arcError(
      "ARC_DEGENERATE",
      "Góc quét của cung không thể xác định.",
    );
  }

  const planarLength = radius * Math.abs(angles.sweep);
  const length = Math.hypot(planarLength, end.w - start.w);
  const extrema = [
    centerInPlane.u - radius,
    centerInPlane.u + radius,
    centerInPlane.v - radius,
    centerInPlane.v + radius,
    planarLength,
    length,
  ];
  if (extrema.some((value) => !isFiniteNumber(value))) {
    return arcError(
      "ARC_NON_FINITE_GEOMETRY",
      "Kích thước hoặc chiều dài cung vượt giới hạn số hữu hạn.",
    );
  }

  return {
    ok: true,
    format,
    start: cloneVec3(input.start),
    end: cloneVec3(input.end),
    plane: input.plane,
    clockwise: input.clockwise,
    center,
    radius,
    startAngle: angles.startAngle,
    endAngle: angles.endAngle,
    sweepRadians: angles.sweep,
    planarLength,
    length,
  };
}

function calculateAngles(
  start: PlanePoint,
  end: PlanePoint,
  centerU: number,
  centerV: number,
  clockwise: boolean,
  fullCircle: boolean,
): { startAngle: number; endAngle: number; sweep: number } | null {
  const startU = start.u - centerU;
  const startV = start.v - centerV;
  const endU = end.u - centerU;
  const endV = end.v - centerV;
  const startRadius = safeHypot(startU, startV);
  const endRadius = safeHypot(endU, endV);
  if (!startRadius || !endRadius) {
    return null;
  }

  const startAngle = Math.atan2(startV, startU);
  const endAngle = Math.atan2(endV, endU);
  let sweep: number;
  if (fullCircle) {
    sweep = clockwise ? -TAU : TAU;
  } else {
    const cross =
      (startU / startRadius) * (endV / endRadius) -
      (startV / startRadius) * (endU / endRadius);
    const dot =
      (startU / startRadius) * (endU / endRadius) +
      (startV / startRadius) * (endV / endRadius);
    sweep = Math.atan2(cross, dot);
    if (clockwise && sweep >= 0) {
      sweep -= TAU;
    } else if (!clockwise && sweep <= 0) {
      sweep += TAU;
    }
  }

  return { startAngle, endAngle, sweep };
}

function progressAtAngle(
  startAngle: number,
  candidateAngle: number,
  sweep: number,
): number | null {
  const magnitude = Math.abs(sweep);
  if (magnitude >= TAU - 1e-12) {
    return sweep > 0
      ? positiveModulo(candidateAngle - startAngle, TAU)
      : positiveModulo(startAngle - candidateAngle, TAU);
  }

  const progress =
    sweep > 0
      ? positiveModulo(candidateAngle - startAngle, TAU)
      : positiveModulo(startAngle - candidateAngle, TAU);
  return progress <= magnitude + 1e-12 ? Math.min(progress, magnitude) : null;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function normalizeArcQuality(quality: ArcQuality): ArcQuality {
  if (
    !isFiniteNumber(quality.chordError) ||
    quality.chordError <= 0 ||
    !Number.isInteger(quality.minSegments) ||
    quality.minSegments < 1 ||
    !Number.isInteger(quality.maxSegments) ||
    quality.maxSegments < quality.minSegments ||
    quality.maxSegments > HARD_MAX_ARC_SEGMENTS
  ) {
    throw new RangeError(
      `Chất lượng cung cần chordError > 0, 1 <= minSegments <= maxSegments <= ${HARD_MAX_ARC_SEGMENTS}.`,
    );
  }
  return quality;
}

function assertResolvedArc(value: unknown): asserts value is ResolvedArc {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as Partial<ResolvedArc>).ok !== true
  ) {
    throw new TypeError("Cần resolve cung thành công trước khi lấy mẫu.");
  }
  const arc = value as ResolvedArc;
  if (
    !isFiniteVec3(arc.start) ||
    !isFiniteVec3(arc.end) ||
    !isFiniteVec3(arc.center) ||
    !isFiniteNumber(arc.radius) ||
    arc.radius <= 0 ||
    !isFiniteNumber(arc.startAngle) ||
    !isFiniteNumber(arc.endAngle) ||
    !isFiniteNumber(arc.sweepRadians) ||
    arc.sweepRadians === 0 ||
    !isFiniteNumber(arc.planarLength) ||
    !isFiniteNumber(arc.length)
  ) {
    throw new RangeError("Dữ liệu cung đã resolve không hợp lệ.");
  }
}

function presentCenterWords(center: ArcCenterWords | undefined): ArcCenterWord[] {
  if (!center) {
    return [];
  }
  return (["I", "J", "K"] as const).filter(
    (word) => center[word] !== undefined,
  );
}

type PlaneDefinition = {
  centerWords: readonly [ArcCenterWord, ArcCenterWord];
};

function planeDefinition(plane: Plane): PlaneDefinition {
  switch (plane) {
    case "XY":
      return { centerWords: ["I", "J"] };
    case "XZ":
      // Thứ tự Z,X cho hướng nhìn từ +Y.
      return { centerWords: ["K", "I"] };
    case "YZ":
      // Thứ tự Y,Z cho hướng nhìn từ +X.
      return { centerWords: ["J", "K"] };
  }
}

type PlanePoint = {
  u: number;
  v: number;
  w: number;
};

function toPlanePoint(point: Vec3, plane: Plane): PlanePoint {
  switch (plane) {
    case "XY":
      return { u: point.x, v: point.y, w: point.z };
    case "XZ":
      return { u: point.z, v: point.x, w: point.y };
    case "YZ":
      return { u: point.y, v: point.z, w: point.x };
  }
}

function fromPlanePoint(
  u: number,
  v: number,
  w: number,
  plane: Plane,
): Vec3 {
  switch (plane) {
    case "XY":
      return { x: u, y: v, z: w };
    case "XZ":
      return { x: v, y: w, z: u };
    case "YZ":
      return { x: w, y: u, z: v };
  }
}

function safeHypot(first: number, second: number): number | null {
  const value = Math.hypot(first, second);
  return isFiniteNumber(value) ? value : null;
}

function stableLerp(start: number, end: number, ratio: number): number {
  return (1 - ratio) * start + ratio * end;
}

function formatNumber(value: number): string {
  return value.toPrecision(8).replace(/(?:\.0+|(\.\d+?)0+)$/, "$1");
}

function arcError(code: ArcErrorCode, message: string): ArcResolutionError {
  return { ok: false, code, message };
}
