import { bounds2DIntersect } from "../geometry/bounds";
import type { Offcut, Part, StockSettings } from "./types";

const MIN_OFFCUT_DIM = 250; // Minimum 250mm width or height to be usable in woodworking

export function extractOffcuts(
  parts: readonly Part[],
  stock: StockSettings,
): Offcut[] {
  const stockX0 = stock.originX;
  const stockY0 = stock.originY;
  const stockX1 = stock.originX + stock.width;
  const stockY1 = stock.originY + stock.height;

  // Collect all potential vertical and horizontal grid boundaries
  const xSet = new Set<number>([stockX0, stockX1]);
  const ySet = new Set<number>([stockY0, stockY1]);

  for (const part of parts) {
    const px0 = Math.max(stockX0, Math.min(stockX1, part.minX));
    const px1 = Math.max(stockX0, Math.min(stockX1, part.maxX));
    const py0 = Math.max(stockY0, Math.min(stockY1, part.minY));
    const py1 = Math.max(stockY0, Math.min(stockY1, part.maxY));
    xSet.add(px0);
    xSet.add(px1);
    ySet.add(py0);
    ySet.add(py1);
  }

  const xs = Array.from(xSet).sort((a, b) => a - b);
  const ys = Array.from(ySet).sort((a, b) => a - b);

  type Candidate = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    w: number;
    h: number;
    area: number;
  };

  const candidates: Candidate[] = [];

  const xCells = xs.length - 1;
  const yCells = ys.length - 1;
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
    const px0 = Math.max(stockX0, Math.min(stockX1, part.minX));
    const px1 = Math.max(stockX0, Math.min(stockX1, part.maxX));
    const py0 = Math.max(stockY0, Math.min(stockY1, part.minY));
    const py1 = Math.max(stockY0, Math.min(stockY1, part.maxY));
    const x0 = xIndex.get(px0);
    const x1 = xIndex.get(px1);
    const y0 = yIndex.get(py0);
    const y1 = yIndex.get(py1);
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

  const rowBlockedPrefix = Array.from(
    { length: yCells },
    () => new Int32Array(xCells + 1),
  );
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
      rowBlockedPrefix[y][x + 1] = blockedInRow;
    }
  }

  // For each horizontal span, row prefixes make occupancy checks O(1). A
  // single vertical scan then yields every maximal empty rectangle in that span.
  for (let left = 0; left < xCells; left += 1) {
    for (let right = left + 1; right <= xCells; right += 1) {
      const width = xs[right] - xs[left];
      if (width < MIN_OFFCUT_DIM) continue;
      let runStart = -1;
      for (let row = 0; row <= yCells; row += 1) {
        const rowIsFree =
          row < yCells &&
          rowBlockedPrefix[row][right] - rowBlockedPrefix[row][left] === 0;
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

  // Sort candidates by area descending (largest offcuts first)
  candidates.sort((a, b) => b.area - a.area);

  // Greedy non-overlapping selection
  const selected: Candidate[] = [];
  for (const cand of candidates) {
    let overlapsSelected = false;
    for (const sel of selected) {
      if (bounds2DIntersect(cand, sel)) {
        overlapsSelected = true;
        break;
      }
    }
    if (!overlapsSelected) {
      selected.push(cand);
    }
  }

  return selected.map((rect, idx) => {
    const id = `OFF-${String(idx + 1).padStart(2, "0")}`;
    const areaM2 = (rect.area / 1000000).toFixed(2);
    const label = `${Math.round(rect.w)} × ${Math.round(rect.h)} mm (${areaM2} m²)`;
    return {
      id,
      minX: rect.minX,
      minY: rect.minY,
      maxX: rect.maxX,
      maxY: rect.maxY,
      width: rect.w,
      height: rect.h,
      area: rect.area,
      label,
    };
  });
}
