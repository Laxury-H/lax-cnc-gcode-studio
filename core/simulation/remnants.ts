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
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    w: number;
    h: number;
    area: number;
  };

  const candidates: Candidate[] = [];

  // Search for Maximal Empty Rectangles (MER) >= MIN_OFFCUT_DIM
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = i + 1; j < xs.length; j += 1) {
      const rx0 = xs[i];
      const rx1 = xs[j];
      const w = rx1 - rx0;
      if (w < MIN_OFFCUT_DIM) continue;

      for (let k = 0; k < ys.length - 1; k += 1) {
        for (let l = k + 1; l < ys.length; l += 1) {
          const ry0 = ys[k];
          const ry1 = ys[l];
          const h = ry1 - ry0;
          if (h < MIN_OFFCUT_DIM) continue;

          // Check if this box overlaps with any nested part
          let overlapsPart = false;
          for (const p of parts) {
            // Two rectangles overlap if their interiors intersect strictly (allow sharing edges)
            if (p.minX < rx1 && p.maxX > rx0 && p.minY < ry1 && p.maxY > ry0) {
              overlapsPart = true;
              break;
            }
          }

          if (!overlapsPart) {
            candidates.push({
              x0: rx0,
              y0: ry0,
              x1: rx1,
              y1: ry1,
              w,
              h,
              area: w * h,
            });
          }
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
      if (
        cand.x0 < sel.x1 &&
        cand.x1 > sel.x0 &&
        cand.y0 < sel.y1 &&
        cand.y1 > sel.y0
      ) {
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
      minX: rect.x0,
      minY: rect.y0,
      maxX: rect.x1,
      maxY: rect.y1,
      width: rect.w,
      height: rect.h,
      area: rect.area,
      label,
    };
  });
}
