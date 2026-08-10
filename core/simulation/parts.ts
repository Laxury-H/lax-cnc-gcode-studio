import { bounds2DContains, boundsForPoints } from "../geometry/bounds";
import { cloneVec3, distance2D } from "../geometry/line";
import type { Part, Segment, StockSettings } from "./types";

const PART_EPSILON = 0.001;

export function rectangleGap(a: Part, b: Part): number {
  const dx = Math.max(b.minX - a.maxX, a.minX - b.maxX, 0);
  const dy = Math.max(b.minY - a.maxY, a.minY - b.maxY, 0);
  return Math.hypot(dx, dy);
}

function containsPart(outer: Part, inner: Part): boolean {
  return bounds2DContains(outer, inner, 0.5);
}

export function detectParts(
  segments: readonly Segment[],
  stock: StockSettings,
): Part[] {
  const closeTolerance = Math.max(
    0.05,
    Math.min(0.3, stock.toolDiameter * 0.05),
  );
  const contours: Array<{
    points: Part["points"];
    sourceLine: number;
    hasArc: boolean;
  }> = [];
  let active: Part["points"] = [];
  let sourceLine = 0;
  let activeHasArc = false;

  const captureClosedTail = () => {
    if (active.length < 4) return;
    const end = active[active.length - 1];
    let closedFrom = -1;
    for (let index = 0; index <= active.length - 4; index += 1) {
      if (distance2D(active[index], end) <= closeTolerance) {
        closedFrom = index;
        break;
      }
    }
    if (closedFrom >= 0) {
      contours.push({
        points: active.slice(closedFrom).map(cloneVec3),
        sourceLine,
        hasArc: activeHasArc,
      });
      active = [];
      activeHasArc = false;
    }
  };

  for (const segment of segments) {
    const isPlanarCut =
      !segment.machineCoordinates &&
      segment.kind !== "rapid" &&
      segment.kind !== "drill" &&
      segment.kind !== "dwell" &&
      distance2D(segment.start, segment.end) > PART_EPSILON;
    if (!isPlanarCut) continue;

    const segmentPoints =
      segment.points.length > 2
        ? segment.points
        : [segment.start, segment.end];

    if (!active.length) {
      active = segmentPoints.map(cloneVec3);
      sourceLine = segment.lineIndex;
      activeHasArc =
        segment.kind === "arc-cw" || segment.kind === "arc-ccw";
    } else if (
      distance2D(active[active.length - 1], segmentPoints[0]) <= closeTolerance
    ) {
      active.push(...segmentPoints.slice(1).map(cloneVec3));
      activeHasArc =
        activeHasArc ||
        segment.kind === "arc-cw" ||
        segment.kind === "arc-ccw";
    } else {
      active = segmentPoints.map(cloneVec3);
      sourceLine = segment.lineIndex;
      activeHasArc =
        segment.kind === "arc-cw" || segment.kind === "arc-ccw";
    }

    captureClosedTail();
  }

  const rawParts: Part[] = contours
    .map((contour, index) => {
      const bounds = boundsForPoints(contour.points);
      const toolpathWidth = bounds.maxX - bounds.minX;
      const toolpathHeight = bounds.maxY - bounds.minY;
      const compensated =
        contour.hasArc &&
        toolpathWidth >= stock.toolDiameter * 4 &&
        toolpathHeight >= stock.toolDiameter * 4;
      const inset = compensated ? stock.toolDiameter / 2 : 0;
      const minX = bounds.minX + inset;
      const minY = bounds.minY + inset;
      const maxX = bounds.maxX - inset;
      const maxY = bounds.maxY - inset;
      const width = Math.max(0, maxX - minX);
      const height = Math.max(0, maxY - minY);
      return {
        id: `P${String(index + 1).padStart(2, "0")}`,
        points: contour.points,
        sourceLine: contour.sourceLine,
        minX,
        minY,
        maxX,
        maxY,
        width,
        height,
        toolpathWidth,
        toolpathHeight,
        compensated,
        area: width * height,
        nearestGap: null,
        edgeGap: Math.min(
          minX - stock.originX,
          minY - stock.originY,
          stock.originX + stock.width - maxX,
          stock.originY + stock.height - maxY,
        ),
      } satisfies Part;
    })
    .filter((part) => part.width >= 40 && part.height >= 40);

  const outerParts = rawParts.filter(
    (part) =>
      !rawParts.some(
        (candidate) =>
          candidate !== part &&
          candidate.area > part.area * 1.15 &&
          containsPart(candidate, part),
      ),
  );

  outerParts.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  outerParts.forEach((part, index) => {
    part.id = `P${String(index + 1).padStart(2, "0")}`;
    part.nearestGap = null;
  });

  for (let i = 0; i < outerParts.length; i += 1) {
    for (let j = i + 1; j < outerParts.length; j += 1) {
      const gap = rectangleGap(outerParts[i], outerParts[j]);
      if (
        outerParts[i].nearestGap === null ||
        gap < outerParts[i].nearestGap!
      ) {
        outerParts[i].nearestGap = gap;
      }
      if (
        outerParts[j].nearestGap === null ||
        gap < outerParts[j].nearestGap!
      ) {
        outerParts[j].nearestGap = gap;
      }
    }
  }

  return outerParts;
}
