import type { Vec3 } from "../gcode/types";

export type Point2 = Pick<Vec3, "x" | "y">;
export type Rectangle2 = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

const GEOMETRY_EPSILON = 1e-7;

function ringLength(points: readonly Point2[]): number {
  if (points.length < 2) return points.length;
  const first = points[0];
  const last = points[points.length - 1];
  return Math.hypot(first.x - last.x, first.y - last.y) <= GEOMETRY_EPSILON
    ? points.length - 1
    : points.length;
}

export function polygonSignedArea(points: readonly Point2[]): number {
  const length = ringLength(points);
  if (length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return twiceArea / 2;
}

export function polygonArea(points: readonly Point2[]): number {
  return Math.abs(polygonSignedArea(points));
}

export function polygonCentroid(points: readonly Point2[]): Point2 {
  const length = ringLength(points);
  if (length === 0) return { x: 0, y: 0 };
  const signedArea = polygonSignedArea(points);
  if (Math.abs(signedArea) <= GEOMETRY_EPSILON) {
    let x = 0;
    let y = 0;
    for (let index = 0; index < length; index += 1) {
      x += points[index].x;
      y += points[index].y;
    }
    return { x: x / length, y: y / length };
  }

  let x = 0;
  let y = 0;
  for (let index = 0; index < length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % length];
    const cross = current.x * next.y - next.x * current.y;
    x += (current.x + next.x) * cross;
    y += (current.y + next.y) * cross;
  }
  const divisor = 6 * signedArea;
  return { x: x / divisor, y: y / divisor };
}

function pointToSegmentDistance(
  point: Point2,
  start: Point2,
  end: Point2,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= GEOMETRY_EPSILON) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const ratio = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
        lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (start.x + dx * ratio),
    point.y - (start.y + dy * ratio),
  );
}

export function pointToPolygonBoundaryDistance(
  point: Point2,
  polygon: readonly Point2[],
): number {
  const length = ringLength(polygon);
  if (length < 2) return Number.POSITIVE_INFINITY;
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < length; index += 1) {
    minimum = Math.min(
      minimum,
      pointToSegmentDistance(
        point,
        polygon[index],
        polygon[(index + 1) % length],
      ),
    );
  }
  return minimum;
}

function orientation(a: Point2, b: Point2, c: Point2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(
  point: Point2,
  start: Point2,
  end: Point2,
  tolerance: number,
): boolean {
  return (
    pointToSegmentDistance(point, start, end) <= tolerance &&
    point.x >= Math.min(start.x, end.x) - tolerance &&
    point.x <= Math.max(start.x, end.x) + tolerance &&
    point.y >= Math.min(start.y, end.y) - tolerance &&
    point.y <= Math.max(start.y, end.y) + tolerance
  );
}

function segmentsIntersect(
  a0: Point2,
  a1: Point2,
  b0: Point2,
  b1: Point2,
  tolerance = GEOMETRY_EPSILON,
): boolean {
  const o1 = orientation(a0, a1, b0);
  const o2 = orientation(a0, a1, b1);
  const o3 = orientation(b0, b1, a0);
  const o4 = orientation(b0, b1, a1);
  if (
    ((o1 > tolerance && o2 < -tolerance) ||
      (o1 < -tolerance && o2 > tolerance)) &&
    ((o3 > tolerance && o4 < -tolerance) ||
      (o3 < -tolerance && o4 > tolerance))
  ) {
    return true;
  }
  return (
    (Math.abs(o1) <= tolerance && pointOnSegment(b0, a0, a1, tolerance)) ||
    (Math.abs(o2) <= tolerance && pointOnSegment(b1, a0, a1, tolerance)) ||
    (Math.abs(o3) <= tolerance && pointOnSegment(a0, b0, b1, tolerance)) ||
    (Math.abs(o4) <= tolerance && pointOnSegment(a1, b0, b1, tolerance))
  );
}

export function pointInPolygon(
  point: Point2,
  polygon: readonly Point2[],
  tolerance = GEOMETRY_EPSILON,
): boolean {
  const length = ringLength(polygon);
  if (length < 3) return false;
  let inside = false;
  for (let index = 0, previous = length - 1; index < length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (pointOnSegment(point, previousPoint, currentPoint, tolerance)) {
      return true;
    }
    const crosses =
      (currentPoint.y > point.y) !== (previousPoint.y > point.y) &&
      point.x <
        ((previousPoint.x - currentPoint.x) *
          (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function polygonContainsPolygon(
  outer: readonly Point2[],
  inner: readonly Point2[],
  tolerance = 0.001,
): boolean {
  const innerLength = ringLength(inner);
  if (innerLength < 3 || ringLength(outer) < 3) return false;
  for (let index = 0; index < innerLength; index += 1) {
    const current = inner[index];
    const next = inner[(index + 1) % innerLength];
    if (
      !pointInPolygon(current, outer, tolerance) ||
      !pointInPolygon(
        { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 },
        outer,
        tolerance,
      )
    ) {
      return false;
    }
  }
  return true;
}

export function polygonDistance(
  left: readonly Point2[],
  right: readonly Point2[],
): number {
  const leftLength = ringLength(left);
  const rightLength = ringLength(right);
  if (leftLength < 2 || rightLength < 2) return Number.POSITIVE_INFINITY;
  if (
    pointInPolygon(left[0], right) ||
    pointInPolygon(right[0], left)
  ) {
    return 0;
  }

  let minimum = Number.POSITIVE_INFINITY;
  for (let leftIndex = 0; leftIndex < leftLength; leftIndex += 1) {
    const leftStart = left[leftIndex];
    const leftEnd = left[(leftIndex + 1) % leftLength];
    for (let rightIndex = 0; rightIndex < rightLength; rightIndex += 1) {
      const rightStart = right[rightIndex];
      const rightEnd = right[(rightIndex + 1) % rightLength];
      if (segmentsIntersect(leftStart, leftEnd, rightStart, rightEnd)) return 0;
      minimum = Math.min(
        minimum,
        pointToSegmentDistance(leftStart, rightStart, rightEnd),
        pointToSegmentDistance(leftEnd, rightStart, rightEnd),
        pointToSegmentDistance(rightStart, leftStart, leftEnd),
        pointToSegmentDistance(rightEnd, leftStart, leftEnd),
      );
    }
  }
  return minimum;
}

export function polygonIntersectsRectangle(
  polygon: readonly Point2[],
  rectangle: Rectangle2,
): boolean {
  const length = ringLength(polygon);
  if (length < 3) return false;
  const corners: Point2[] = [
    { x: rectangle.minX, y: rectangle.minY },
    { x: rectangle.maxX, y: rectangle.minY },
    { x: rectangle.maxX, y: rectangle.maxY },
    { x: rectangle.minX, y: rectangle.maxY },
  ];
  if (corners.some((corner) => pointInPolygon(corner, polygon))) return true;
  for (let index = 0; index < length; index += 1) {
    const point = polygon[index];
    if (
      point.x >= rectangle.minX &&
      point.x <= rectangle.maxX &&
      point.y >= rectangle.minY &&
      point.y <= rectangle.maxY
    ) {
      return true;
    }
    const next = polygon[(index + 1) % length];
    for (let edgeIndex = 0; edgeIndex < 4; edgeIndex += 1) {
      if (
        segmentsIntersect(
          point,
          next,
          corners[edgeIndex],
          corners[(edgeIndex + 1) % 4],
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Finds a stable point inside the material, including concave outlines and
 * outlines with holes. This is intentionally bounded: it is used for labels,
 * not for machining geometry.
 */
export function polygonLabelPoint(
  outer: readonly Point2[],
  holes: readonly (readonly Point2[])[] = [],
  preferred?: Point2,
): Point2 {
  const length = ringLength(outer);
  if (length < 3) return preferred ?? outer[0] ?? { x: 0, y: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < length; index += 1) {
    minX = Math.min(minX, outer[index].x);
    minY = Math.min(minY, outer[index].y);
    maxX = Math.max(maxX, outer[index].x);
    maxY = Math.max(maxY, outer[index].y);
  }

  const isMaterial = (point: Point2) =>
    pointInPolygon(point, outer) &&
    !holes.some((hole) => pointInPolygon(point, hole));
  const clearance = (point: Point2) => {
    if (!isMaterial(point)) return Number.NEGATIVE_INFINITY;
    let value = pointToPolygonBoundaryDistance(point, outer);
    for (const hole of holes) {
      value = Math.min(value, pointToPolygonBoundaryDistance(point, hole));
    }
    return value;
  };

  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  let best = preferred && isMaterial(preferred) ? preferred : center;
  let bestClearance = clearance(best);
  if (bestClearance === Number.NEGATIVE_INFINITY) {
    best = outer[0];
    bestClearance = 0;
  }

  const span = Math.min(maxX - minX, maxY - minY);
  if (bestClearance >= span * 0.15) return best;

  let searchMinX = minX;
  let searchMinY = minY;
  let searchMaxX = maxX;
  let searchMaxY = maxY;
  const gridSize = 10;
  for (let pass = 0; pass < 3; pass += 1) {
    const cellWidth = (searchMaxX - searchMinX) / gridSize;
    const cellHeight = (searchMaxY - searchMinY) / gridSize;
    for (let yIndex = 0; yIndex < gridSize; yIndex += 1) {
      for (let xIndex = 0; xIndex < gridSize; xIndex += 1) {
        const candidate = {
          x: searchMinX + (xIndex + 0.5) * cellWidth,
          y: searchMinY + (yIndex + 0.5) * cellHeight,
        };
        const candidateClearance = clearance(candidate);
        if (candidateClearance > bestClearance) {
          best = candidate;
          bestClearance = candidateClearance;
        }
      }
    }
    searchMinX = Math.max(minX, best.x - cellWidth);
    searchMaxX = Math.min(maxX, best.x + cellWidth);
    searchMinY = Math.max(minY, best.y - cellHeight);
    searchMaxY = Math.min(maxY, best.y + cellHeight);
  }
  return best;
}

function perpendicularDistance(
  point: Point2,
  start: Point2,
  end: Point2,
): number {
  return pointToSegmentDistance(point, start, end);
}

/** Douglas-Peucker simplification for visual-only toolpath LOD. */
export function simplifyPolyline<T extends Point2>(
  points: readonly T[],
  tolerance: number,
): T[] {
  if (points.length <= 2 || tolerance <= 0) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [startIndex, endIndex] = stack.pop()!;
    let farthestIndex = -1;
    let farthestDistance = tolerance;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = perpendicularDistance(
        points[index],
        points[startIndex],
        points[endIndex],
      );
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthestIndex = index;
      }
    }
    if (farthestIndex >= 0) {
      keep[farthestIndex] = 1;
      stack.push([startIndex, farthestIndex], [farthestIndex, endIndex]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}
