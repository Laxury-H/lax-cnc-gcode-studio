export type RenderQuality = "low" | "medium" | "high";
export type SimulationFrameloop = "always" | "demand";

export type RenderPerformanceProfile = {
  playbackFrameIntervalMs: number;
  canvasFrameIntervalMs: number;
  stockTextureFrameIntervalMs: number;
  dpr: [number, number];
  shadowMapSize: number;
  cutterSegments: number;
  heightmapLongEdge: number;
  stockMeshLongEdge: number;
  maxAnisotropy: number;
};

export type StockRenderGrid = {
  textureWidth: number;
  textureHeight: number;
  segmentsX: number;
  segmentsY: number;
};

const PROFILES: Record<RenderQuality, RenderPerformanceProfile> = {
  low: {
    playbackFrameIntervalMs: 1000 / 30,
    canvasFrameIntervalMs: 1000 / 24,
    stockTextureFrameIntervalMs: 1000 / 10,
    dpr: [0.75, 1],
    shadowMapSize: 512,
    cutterSegments: 20,
    heightmapLongEdge: 1024,
    stockMeshLongEdge: 256,
    maxAnisotropy: 2,
  },
  medium: {
    playbackFrameIntervalMs: 1000 / 45,
    canvasFrameIntervalMs: 1000 / 36,
    stockTextureFrameIntervalMs: 1000 / 15,
    dpr: [0.85, 1.5],
    shadowMapSize: 1024,
    cutterSegments: 32,
    heightmapLongEdge: 2048,
    stockMeshLongEdge: 512,
    maxAnisotropy: 8,
  },
  high: {
    playbackFrameIntervalMs: 1000 / 60,
    canvasFrameIntervalMs: 1000 / 60,
    stockTextureFrameIntervalMs: 1000 / 15,
    dpr: [2, 2],
    shadowMapSize: 4096,
    cutterSegments: 64,
    heightmapLongEdge: 4096,
    stockMeshLongEdge: 1024,
    maxAnisotropy: 16,
  },
};

export function renderPerformanceProfile(
  quality: RenderQuality,
): RenderPerformanceProfile {
  return PROFILES[quality];
}

export function resolveSimulationFrameloop(
  playing: boolean,
): SimulationFrameloop {
  return playing ? "always" : "demand";
}

function alignedSize(value: number, alignment: number, minimum: number): number {
  return Math.max(minimum, Math.round(value / alignment) * alignment);
}

export function resolveStockRenderGrid(
  stockWidth: number,
  stockHeight: number,
  quality: RenderQuality,
  maxTextureSize = Number.POSITIVE_INFINITY,
): StockRenderGrid {
  const profile = renderPerformanceProfile(quality);
  const safeWidth = Math.max(1e-6, Math.abs(stockWidth));
  const safeHeight = Math.max(1e-6, Math.abs(stockHeight));
  const widthIsLongEdge = safeWidth >= safeHeight;
  const longSide = Math.max(safeWidth, safeHeight);
  const shortSide = Math.min(safeWidth, safeHeight);
  const aspect = shortSide / longSide;
  const safeTextureLimit = Number.isFinite(maxTextureSize)
    ? Math.max(64, Math.floor(maxTextureSize))
    : profile.heightmapLongEdge;
  const textureLongEdge = Math.min(
    profile.heightmapLongEdge,
    safeTextureLimit,
  );
  const textureShortEdge = Math.min(
    textureLongEdge,
    alignedSize(textureLongEdge * aspect, 32, 64),
  );
  const meshLongEdge = profile.stockMeshLongEdge;
  const meshShortEdge = Math.min(
    meshLongEdge,
    alignedSize(meshLongEdge * aspect, 8, 32),
  );

  return widthIsLongEdge
    ? {
        textureWidth: textureLongEdge,
        textureHeight: textureShortEdge,
        segmentsX: meshLongEdge,
        segmentsY: meshShortEdge,
      }
    : {
        textureWidth: textureShortEdge,
        textureHeight: textureLongEdge,
        segmentsX: meshShortEdge,
        segmentsY: meshLongEdge,
      };
}

export function shouldRenderFrame(
  previousTimestamp: number,
  currentTimestamp: number,
  intervalMs: number,
): boolean {
  return (
    !Number.isFinite(previousTimestamp) ||
    !Number.isFinite(currentTimestamp) ||
    currentTimestamp < previousTimestamp ||
    currentTimestamp - previousTimestamp >= Math.max(0, intervalMs)
  );
}
