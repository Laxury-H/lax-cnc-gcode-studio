import { bounds2DIntersect } from "../geometry/bounds";
import {
  polygonContainsPolygon,
  polygonIntersectsRectangle,
  type Point2,
  type Rectangle2,
} from "../geometry/polygon";
import type { Offcut, Part, StockSettings } from "./types";

const MIN_OFFCUT_DIM = 250;
const MAX_POLYGON_GRID_LINES = 96;
const MAX_POLYGON_PARTS = 64;

type Candidate = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  w: number;
  h: number;
  area: number;
};

function addSampledCoordinates(
  target: Set<number>,
  values: readonly number[],
  minimum: number,
  maximum: number,
): void {
  const available = MAX_POLYGON_GRID_LINES - target.size;
  if (available <= 0) return;
  const unique = [...new Set(values.filter((value) => value > minimum && value < maximum))]
    .sort((left, right) => left - right);
  if (unique.length <= available) {
    unique.forEach((value) => target.add(value));
    return;
  }
  for (let index = 0; index < available; index += 1) {
    const sourceIndex = Math.min(
      unique.length - 1,
      Math.floor(((index + 0.5) * unique.length) / available),
    );
    target.add(unique[sourceIndex]);
  }
}

function rectangleRing(rectangle: Rectangle2): Point2[] {
  return [
    { x: rectangle.minX, y: rectangle.minY },
    { x: rectangle.maxX, y: rectangle.minY },
    { x: rectangle.maxX, y: rectangle.maxY },
    { x: rectangle.minX, y: rectangle.maxY },
  ];
}

function materialIntersectsRectangle(part: Part, rectangle: Rectangle2): boolean {
  if (
    rectangle.maxX <= part.minX ||
    rectangle.minX >= part.maxX ||
    rectangle.maxY <= part.minY ||
    rectangle.minY >= part.maxY
  ) {
    return false;
  }
  if (!polygonIntersectsRectangle(part.points, rectangle)) return false;
  const ring = rectangleRing(rectangle);
  if (
    part.holes?.some((hole) =>
      polygonContainsPolygon(hole, ring, 0.01),
    )
  ) {
    return false;
  }
  return true;
}

function buildBlockedRows(
  parts: readonly Part[],
  xs: readonly number[],
  ys: readonly number[],
  polygonAware: boolean,
): Int32Array[] {
  const xCells = xs.length - 1;
  const yCells = ys.length - 1;
  const rows = Array.from(
    { length: yCells },
    () => new Int32Array(xCells + 1),
  );

  if (polygonAware) {
    for (let y = 0; y < yCells; y += 1) {
      let blockedInRow = 0;
      for (let x = 0; x < xCells; x += 1) {
        const epsilonX = Math.min(0.01, (xs[x + 1] - xs[x]) * 0.1);
        const epsilonY = Math.min(0.01, (ys[y + 1] - ys[y]) * 0.1);
        const rectangle = {
          minX: xs[x] + epsilonX,
          minY: ys[y] + epsilonY,
          maxX: xs[x + 1] - epsilonX,
          maxY: ys[y + 1] - epsilonY,
        };
        if (parts.some((part) => materialIntersectsRectangle(part, rectangle))) {
          blockedInRow += 1;
        }
        rows[y][x + 1] = blockedInRow;
      }
    }
    return rows;
  }

  const xIndex = new Map(xs.map((value, index) => [value, index]));
  const yIndex = new Map(ys.map((value, index) => [value, index]));
  const stride = xCells + 2;
  const occupancyDiff = new Int32Array((yCells + 2) * stride);
  const addDifference = (x0: number, y0: number, x1: number, y1: number) => {
    occupancyDiff[y0 * stride + x0] += 1;
    occupancyDiff[y0 * stride + x1] -= 1;
    occupancyDiff[y1 * stride + x0] -= 1;
    occupancyDiff[y1 * stride + x1] += 1;
  };

  for (const part of parts) {
    const x0 = xIndex.get(Math.max(xs[0], Math.min(xs[xs.length - 1], part.minX)));
    const x1 = xIndex.get(Math.max(xs[0], Math.min(xs[xs.length - 1], part.maxX)));
    const y0 = yIndex.get(Math.max(ys[0], Math.min(ys[ys.length - 1], part.minY)));
    const y1 = yIndex.get(Math.max(ys[0], Math.min(ys[ys.length - 1], part.maxY)));
    if (
      x0 !== undefined &&
      x1 !== undefined &&
      y0 !== undefined &&
      y1 !== undefined &&
      x0 < x1 &&
      y0 < y1
    ) {
      addDifference(x0, y0, x1, y1);
    }
  }

  for (let y = 0; y < yCells; y += 1) {
    let blockedInRow = 0;
    for (let x = 0; x < xCells; x += 1) {
      const above = y > 0 ? occupancyDiff[(y - 1) * stride + x] : 0;
      const left = x > 0 ? occupancyDiff[y * stride + x - 1] : 0;
      const diagonal =
        x > 0 && y > 0 ? occupancyDiff[(y - 1) * stride + x - 1] : 0;
      const index = y * stride + x;
      occupancyDiff[index] += above + left - diagonal;
      if (occupancyDiff[index] > 0) blockedInRow += 1;
      rows[y][x + 1] = blockedInRow;
    }
  }
  return rows;
}

export function extractOffcuts(
  parts: readonly Part[],
  stock: StockSettings,
): Offcut[] {
  const stockX0 = stock.originX;
  const stockY0 = stock.originY;
  const stockX1 = stock.originX + stock.width;
  const stockY1 = stock.originY + stock.height;
  const xSet = new Set<number>([stockX0, stockX1]);
  const ySet = new Set<number>([stockY0, stockY1]);

  for (const part of parts) {
    xSet.add(Math.max(stockX0, Math.min(stockX1, part.minX)));
    xSet.add(Math.max(stockX0, Math.min(stockX1, part.maxX)));
    ySet.add(Math.max(stockY0, Math.min(stockY1, part.minY)));
    ySet.add(Math.max(stockY0, Math.min(stockY1, part.maxY)));
  }

  const polygonAware =
    parts.length <= MAX_POLYGON_PARTS &&
    parts.some(
      (part) =>
        Boolean(part.holes?.length) ||
        part.area < part.width * part.height * 0.97,
    );
  if (polygonAware) {
    const allRings = parts.flatMap((part) => [part.points, ...(part.holes ?? [])]);
    addSampledCoordinates(
      xSet,
      allRings.flatMap((ring) => ring.map((point) => point.x)),
      stockX0,
      stockX1,
    );
    addSampledCoordinates(
      ySet,
      allRings.flatMap((ring) => ring.map((point) => point.y)),
      stockY0,
      stockY1,
    );
  }

  const xs = Array.from(xSet).sort((left, right) => left - right);
  const ys = Array.from(ySet).sort((left, right) => left - right);
  const xCells = xs.length - 1;
  const yCells = ys.length - 1;
  const blockedRows = buildBlockedRows(parts, xs, ys, polygonAware);
  const candidates: Candidate[] = [];

  for (let left = 0; left < xCells; left += 1) {
    for (let right = left + 1; right <= xCells; right += 1) {
      const width = xs[right] - xs[left];
      if (width < MIN_OFFCUT_DIM) continue;
      let runStart = -1;
      for (let row = 0; row <= yCells; row += 1) {
        const rowIsFree =
          row < yCells &&
          blockedRows[row][right] - blockedRows[row][left] === 0;
        if (rowIsFree && runStart < 0) {
          runStart = row;
        } else if (!rowIsFree && runStart >= 0) {
          const height = ys[row] - ys[runStart];
          if (height >= MIN_OFFCUT_DIM) {
            candidates.push({
              minX: xs[left],
              minY: ys[runStart],
              maxX: xs[right],
              maxY: ys[row],
              w: width,
              h: height,
              area: width * height,
            });
          }
          runStart = -1;
        }
      }
    }
  }

  candidates.sort((left, right) => right.area - left.area);
  const selected: Candidate[] = [];
  for (const candidate of candidates) {
    if (!selected.some((current) => bounds2DIntersect(candidate, current))) {
      selected.push(candidate);
    }
  }

  return selected.map((rectangle, index) => {
    const id = `OFF-${String(index + 1).padStart(2, "0")}`;
    const areaM2 = (rectangle.area / 1_000_000).toFixed(2);
    return {
      id,
      minX: rectangle.minX,
      minY: rectangle.minY,
      maxX: rectangle.maxX,
      maxY: rectangle.maxY,
      width: rectangle.w,
      height: rectangle.h,
      area: rectangle.area,
      label: `${Math.round(rectangle.w)} × ${Math.round(rectangle.h)} mm (${areaM2} m²)`,
    };
  });
}
