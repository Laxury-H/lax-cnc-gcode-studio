import type { Simulation, StockSettings } from "./types";
import type { RenderQuality } from "./render-performance";

export type SimulationComplexityTier = "standard" | "dense" | "extreme";

export type SimulationComplexity = {
  tier: SimulationComplexityTier;
  segmentCount: number;
  samplePointCount: number;
  contourPointCount: number;
  partCount: number;
  score: number;
};

export function analyzeSimulationComplexity(
  simulation: Pick<Simulation, "segments" | "parts">,
): SimulationComplexity {
  const segmentCount = simulation.segments.length;
  const samplePointCount = simulation.segments.reduce(
    (total, segment) => total + segment.points.length,
    0,
  );
  const contourPointCount = simulation.parts.reduce(
    (total, part) =>
      total +
      part.points.length +
      (part.holes?.reduce(
        (holeTotal, hole) => holeTotal + hole.length,
        0,
      ) ?? 0),
    0,
  );
  const partCount = simulation.parts.length;
  const score =
    segmentCount +
    samplePointCount * 0.45 +
    contourPointCount * 0.25 +
    partCount * 40;
  const tier: SimulationComplexityTier =
    score >= 120_000 || segmentCount >= 60_000 || partCount >= 220
      ? "extreme"
      : score >= 30_000 || segmentCount >= 15_000 || partCount >= 70
        ? "dense"
        : "standard";
  return {
    tier,
    segmentCount,
    samplePointCount,
    contourPointCount,
    partCount,
    score,
  };
}

export function resolvePartLabelBudget(
  quality: RenderQuality,
  tier: SimulationComplexityTier,
  playing: boolean,
): number {
  const base = {
    low: { standard: 42, dense: 18, extreme: 8 },
    medium: { standard: 64, dense: 28, extreme: 12 },
    high: { standard: 96, dense: 40, extreme: 18 },
  }[quality][tier];
  return playing ? Math.max(6, Math.floor(base * 0.7)) : base;
}

/** Visual-only tolerance. Parsing, collision checks and removal keep full data. */
export function resolveVisualToolpathTolerance(
  stock: Pick<StockSettings, "width" | "height">,
  quality: RenderQuality,
  tier: SimulationComplexityTier,
  playing: boolean,
): number {
  if (tier === "standard") return 0;
  const longEdge = Math.max(Math.abs(stock.width), Math.abs(stock.height), 1);
  const tierDivisor = tier === "dense" ? 8_000 : 4_000;
  const qualityFactor = quality === "high" ? 0.7 : quality === "low" ? 1.4 : 1;
  const playbackFactor = playing ? 1.25 : 1;
  return Math.min(
    2.5,
    Math.max(0.04, (longEdge / tierDivisor) * qualityFactor * playbackFactor),
  );
}
