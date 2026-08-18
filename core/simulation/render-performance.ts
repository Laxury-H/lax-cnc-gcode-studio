export type RenderQuality = "low" | "medium" | "high";

export type RenderPerformanceProfile = {
  playbackFrameIntervalMs: number;
  canvasFrameIntervalMs: number;
  stockTextureFrameIntervalMs: number;
  dpr: [number, number];
  shadowMapSize: number;
  contactShadowResolution: number;
  contactShadowFrameIntervalMs: number;
  cutterSegments: number;
};

const PROFILES: Record<RenderQuality, RenderPerformanceProfile> = {
  low: {
    playbackFrameIntervalMs: 1000 / 30,
    canvasFrameIntervalMs: 1000 / 24,
    stockTextureFrameIntervalMs: 1000 / 12,
    dpr: [0.75, 1],
    shadowMapSize: 512,
    contactShadowResolution: 256,
    contactShadowFrameIntervalMs: 1000 / 6,
    cutterSegments: 16,
  },
  medium: {
    playbackFrameIntervalMs: 1000 / 45,
    canvasFrameIntervalMs: 1000 / 36,
    stockTextureFrameIntervalMs: 1000 / 20,
    dpr: [0.85, 1.5],
    shadowMapSize: 1024,
    contactShadowResolution: 384,
    contactShadowFrameIntervalMs: 1000 / 10,
    cutterSegments: 24,
  },
  high: {
    playbackFrameIntervalMs: 1000 / 60,
    canvasFrameIntervalMs: 1000 / 60,
    stockTextureFrameIntervalMs: 1000 / 30,
    dpr: [1, 2],
    shadowMapSize: 2048,
    contactShadowResolution: 512,
    contactShadowFrameIntervalMs: 1000 / 15,
    cutterSegments: 32,
  },
};

export function renderPerformanceProfile(
  quality: RenderQuality,
): RenderPerformanceProfile {
  return PROFILES[quality];
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
