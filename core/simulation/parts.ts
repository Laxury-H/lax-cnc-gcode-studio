import { boundsForPoints } from "../geometry/bounds";
import { cloneVec3, distance2D } from "../geometry/line";
import {
  polygonArea,
  polygonCentroid,
  polygonContainsPolygon,
  polygonDistance,
  polygonLabelPoint,
  pointToPolygonBoundaryDistance,
  simplifyPolyline,
} from "../geometry/polygon";
import type { Part, Segment, StockSettings } from "./types";

const PART_EPSILON = 0.001;

type CapturedContour = {
  points: Part["points"];
  sourceLine: number;
  hasArc: boolean;
  minimumZ: number;
};

type AnalyzedContour = CapturedContour & {
  analysisPoints: Part["points"];
  area: number;
  centroid: { x: number; y: number };
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  perimeter: number;
  parentIndex: number;
  depth: number;
};

export function rectangleGap(a: Part, b: Part): number {
  const dx = Math.max(b.minX - a.maxX, a.minX - b.maxX, 0);
  const dy = Math.max(b.minY - a.maxY, a.minY - b.maxY, 0);
  return Math.hypot(dx, dy);
}

export function partGap(
  left: Part,
  right: Part,
  toolDiameter = 0,
): number {
  const pathGap = polygonDistance(
    left.analysisPoints ?? left.points,
    right.analysisPoints ?? right.points,
  );
  const insetGap =
    pathGap > PART_EPSILON
      ? pathGap +
        (left.compensated ? toolDiameter / 2 : 0) +
        (right.compensated ? toolDiameter / 2 : 0)
      : 0;
  return Math.max(rectangleGap(left, right), insetGap);
}

function boundsContain(
  outer: Pick<AnalyzedContour, "minX" | "minY" | "maxX" | "maxY">,
  inner: Pick<AnalyzedContour, "minX" | "minY" | "maxX" | "maxY">,
  tolerance = 0.5,
): boolean {
  return (
    inner.minX >= outer.minX - tolerance &&
    inner.minY >= outer.minY - tolerance &&
    inner.maxX <= outer.maxX + tolerance &&
    inner.maxY <= outer.maxY + tolerance
  );
}

function contourPerimeter(points: readonly Part["points"][number][]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance2D(points[index - 1], points[index]);
  }
  if (distance2D(points[0], points[points.length - 1]) > PART_EPSILON) {
    total += distance2D(points[0], points[points.length - 1]);
  }
  return total;
}

function captureContours(
  segments: readonly Segment[],
  stock: StockSettings,
): CapturedContour[] {
  const closeTolerance = Math.max(
    0.05,
    Math.min(0.3, stock.toolDiameter * 0.05),
  );
  const contours: CapturedContour[] = [];
  let active: Part["points"] = [];
  let sourceLine = 0;
  let activeHasArc = false;
  const activeBuckets = new Map<string, number[]>();

  const bucketKey = (point: Part["points"][number]) =>
    `${Math.floor(point.x / closeTolerance)},${Math.floor(point.y / closeTolerance)}`;

  const indexActivePoint = (point: Part["points"][number], index: number) => {
    const key = bucketKey(point);
    const bucket = activeBuckets.get(key);
    if (bucket) bucket.push(index);
    else activeBuckets.set(key, [index]);
  };

  const replaceActive = (points: readonly Part["points"][number][]) => {
    active = points.map(cloneVec3);
    activeBuckets.clear();
    active.forEach(indexActivePoint);
  };

  const appendActive = (points: readonly Part["points"][number][]) => {
    for (const point of points) {
      const clone = cloneVec3(point);
      active.push(clone);
      indexActivePoint(clone, active.length - 1);
    }
  };

  const captureClosedTail = () => {
    if (active.length < 4) return;
    const end = active[active.length - 1];
    let closedFrom = -1;
    const cellX = Math.floor(end.x / closeTolerance);
    const cellY = Math.floor(end.y / closeTolerance);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const candidates = activeBuckets.get(`${cellX + dx},${cellY + dy}`);
        if (!candidates) continue;
        for (const index of candidates) {
          if (
            index > active.length - 4 ||
            (index >= closedFrom && closedFrom >= 0)
          ) {
            continue;
          }
          if (distance2D(active[index], end) <= closeTolerance) {
            closedFrom = index;
          }
        }
      }
    }
    if (closedFrom >= 0) {
      contours.push({
        points: active.slice(closedFrom).map(cloneVec3),
        sourceLine,
        hasArc: activeHasArc,
        minimumZ: active
          .slice(closedFrom)
          .reduce((minimum, point) => Math.min(minimum, point.z), Number.POSITIVE_INFINITY),
      });
      active = [];
      activeBuckets.clear();
      activeHasArc = false;
    }
  };

  for (const segment of segments) {
    const hasPlanarTravel =
      distance2D(segment.start, segment.end) > PART_EPSILON ||
      ((segment.kind === "arc-cw" || segment.kind === "arc-ccw") &&
        segment.length > PART_EPSILON);
    const isPlanarCut =
      !segment.machineCoordinates &&
      segment.kind !== "rapid" &&
      segment.kind !== "drill" &&
      segment.kind !== "dwell" &&
      hasPlanarTravel;
    if (!isPlanarCut) continue;

    const segmentPoints =
      segment.points.length > 2
        ? segment.points
        : [segment.start, segment.end];

    if (!active.length) {
      replaceActive(segmentPoints);
      sourceLine = segment.lineIndex;
      activeHasArc =
        segment.kind === "arc-cw" || segment.kind === "arc-ccw";
    } else if (
      distance2D(active[active.length - 1], segmentPoints[0]) <= closeTolerance
    ) {
      appendActive(segmentPoints.slice(1));
      activeHasArc =
        activeHasArc ||
        segment.kind === "arc-cw" ||
        segment.kind === "arc-ccw";
    } else {
      replaceActive(segmentPoints);
      sourceLine = segment.lineIndex;
      activeHasArc =
        segment.kind === "arc-cw" || segment.kind === "arc-ccw";
    }

    captureClosedTail();
  }
  return contours;
}

function analyzeContours(
  contours: readonly CapturedContour[],
  stock: StockSettings,
): AnalyzedContour[] {
  const simplificationTolerance = Math.max(0.01, stock.toolDiameter * 0.01);
  const analyzed = contours
    .map((contour) => {
      const bounds = boundsForPoints(contour.points);
      const area = polygonArea(contour.points);
      return {
        ...contour,
        analysisPoints: simplifyPolyline(
          contour.points,
          simplificationTolerance,
        ),
        area,
        centroid: polygonCentroid(contour.points),
        minX: bounds.minX,
        minY: bounds.minY,
        maxX: bounds.maxX,
        maxY: bounds.maxY,
        perimeter: contourPerimeter(contour.points),
        parentIndex: -1,
        depth: 0,
      } satisfies AnalyzedContour;
    })
    .filter((contour) => contour.area > PART_EPSILON);

  // Repeated depth passes over the same XY contour are one physical boundary.
  const unique: AnalyzedContour[] = [];
  for (const contour of analyzed) {
    const duplicate = unique.some(
      (candidate) =>
        Math.abs(candidate.area - contour.area) <=
          Math.max(0.01, contour.area * 0.00001) &&
        Math.abs(candidate.minX - contour.minX) <= 0.05 &&
        Math.abs(candidate.minY - contour.minY) <= 0.05 &&
        Math.abs(candidate.maxX - contour.maxX) <= 0.05 &&
        Math.abs(candidate.maxY - contour.maxY) <= 0.05 &&
        polygonContainsPolygon(
          candidate.analysisPoints,
          contour.analysisPoints,
          0.05,
        ) &&
        polygonContainsPolygon(
          contour.analysisPoints,
          candidate.analysisPoints,
          0.05,
        ),
    );
    if (!duplicate) unique.push(contour);
  }

  for (let innerIndex = 0; innerIndex < unique.length; innerIndex += 1) {
    const inner = unique[innerIndex];
    let parentArea = Number.POSITIVE_INFINITY;
    for (let outerIndex = 0; outerIndex < unique.length; outerIndex += 1) {
      if (innerIndex === outerIndex) continue;
      const outer = unique[outerIndex];
      if (
        outer.area <= inner.area + PART_EPSILON ||
        outer.area >= parentArea ||
        !boundsContain(outer, inner) ||
        !polygonContainsPolygon(
          outer.analysisPoints,
          inner.analysisPoints,
        )
      ) {
        continue;
      }
      inner.parentIndex = outerIndex;
      parentArea = outer.area;
    }
  }

  const resolveDepth = (index: number) => {
    let depth = 0;
    let parentIndex = unique[index].parentIndex;
    const visited = new Set<number>();
    while (parentIndex >= 0 && !visited.has(parentIndex)) {
      visited.add(parentIndex);
      depth += 1;
      parentIndex = unique[parentIndex].parentIndex;
    }
    return depth;
  };
  unique.forEach((contour, index) => {
    contour.depth = resolveDepth(index);
  });
  return unique;
}

export function detectParts(
  segments: readonly Segment[],
  stock: StockSettings,
): Part[] {
  const capturedContours = captureContours(segments, stock);
  const minimumCutZ = capturedContours.reduce(
    (minimum, contour) => Math.min(minimum, contour.minimumZ),
    Number.POSITIVE_INFINITY,
  );
  const bottomZero =
    stock.zZero === "bottom" ||
    (stock.zZero !== "top" && minimumCutZ >= -0.1);
  const bottomZ = bottomZero ? 0 : -stock.thickness;
  const throughTolerance = Math.max(
    0.15,
    Math.min(1, stock.toolDiameter * 0.2),
  );
  const contours = analyzeContours(
    capturedContours.filter(
      (contour) => contour.minimumZ <= bottomZ + throughTolerance,
    ),
    stock,
  );
  const minimumPartDimension = Math.max(4, stock.toolDiameter * 1.25);
  const parts = contours
    .flatMap<Part>((outer, outerIndex) => {
      if (outer.depth % 2 !== 0) return [];
      const holes = contours.filter(
        (candidate) =>
          candidate.parentIndex === outerIndex && candidate.depth % 2 === 1,
      );
      const toolpathWidth = outer.maxX - outer.minX;
      const toolpathHeight = outer.maxY - outer.minY;
      const compensated =
        outer.hasArc &&
        toolpathWidth >= stock.toolDiameter * 4 &&
        toolpathHeight >= stock.toolDiameter * 4;
      const inset = compensated ? stock.toolDiameter / 2 : 0;
      const minX = outer.minX + inset;
      const minY = outer.minY + inset;
      const maxX = outer.maxX - inset;
      const maxY = outer.maxY - inset;
      const width = Math.max(0, maxX - minX);
      const height = Math.max(0, maxY - minY);
      const netArea = Math.max(
        0,
        outer.area - holes.reduce((total, hole) => total + hole.area, 0),
      );
      const weightedCentroid =
        netArea > PART_EPSILON
          ? {
              x:
                (outer.centroid.x * outer.area -
                  holes.reduce(
                    (total, hole) => total + hole.centroid.x * hole.area,
                    0,
                  )) /
                netArea,
              y:
                (outer.centroid.y * outer.area -
                  holes.reduce(
                    (total, hole) => total + hole.centroid.y * hole.area,
                    0,
                  )) /
                netArea,
            }
          : outer.centroid;
      const labelPosition = polygonLabelPoint(
        outer.analysisPoints,
        holes.map((hole) => hole.analysisPoints),
        weightedCentroid,
      );
      let labelClearance = pointToPolygonBoundaryDistance(
        labelPosition,
        outer.analysisPoints,
      );
      for (const hole of holes) {
        labelClearance = Math.min(
          labelClearance,
          pointToPolygonBoundaryDistance(labelPosition, hole.analysisPoints),
        );
      }
      const z = outer.points[0]?.z ?? 0;
      return [{
        id: "",
        points: outer.points,
        analysisPoints: outer.analysisPoints,
        holes: holes.map((hole) => hole.points),
        centroid: { ...weightedCentroid, z },
        labelPosition: { ...labelPosition, z },
        labelClearance,
        perimeter:
          outer.perimeter +
          holes.reduce((total, hole) => total + hole.perimeter, 0),
        sourceLine: outer.sourceLine,
        minX,
        minY,
        maxX,
        maxY,
        width,
        height,
        toolpathWidth,
        toolpathHeight,
        compensated,
        area: netArea,
        nearestGap: null,
        edgeGap: Math.min(
          minX - stock.originX,
          minY - stock.originY,
          stock.originX + stock.width - maxX,
          stock.originY + stock.height - maxY,
        ),
      } satisfies Part];
    })
    .filter(
      (part) =>
        part.width >= minimumPartDimension &&
        part.height >= minimumPartDimension &&
        part.area >= minimumPartDimension * minimumPartDimension * 0.5,
    );

  parts.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  parts.forEach((part, index) => {
    part.id = `P${String(index + 1).padStart(2, "0")}`;
  });

  for (let leftIndex = 0; leftIndex < parts.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < parts.length;
      rightIndex += 1
    ) {
      const left = parts[leftIndex];
      const right = parts[rightIndex];
      const lowerBound = rectangleGap(left, right);
      if (
        left.nearestGap !== null &&
        right.nearestGap !== null &&
        lowerBound >= left.nearestGap - PART_EPSILON &&
        lowerBound >= right.nearestGap - PART_EPSILON
      ) {
        continue;
      }
      const gap = partGap(left, right, stock.toolDiameter);
      left.nearestGap =
        left.nearestGap === null ? gap : Math.min(left.nearestGap, gap);
      right.nearestGap =
        right.nearestGap === null ? gap : Math.min(right.nearestGap, gap);
    }
  }

  return parts;
}
