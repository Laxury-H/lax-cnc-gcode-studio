import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Line } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  buildAutomaticMeasurements,
  buildMeasurementSnapCandidates,
  calculateWorkOrigin,
  calculateMeasurement,
  constrainMeasurementPoint,
  resolveStockZBounds,
  type MeasurementConstraint,
  type MeasurementPreset,
  type MeasurementResult,
  type SnapCandidate,
} from "../measurement/measurement-utils";
import type {
  Simulation,
  StockSettings,
  ToolProfile,
} from "../simulation/types";
import {
  buildCutterContactBands,
  cutSurfaceColor,
  depthIntensity,
  resolveSegmentTool,
  resolveSolidOverlayPosition,
  resolveToolpathOverlayZ,
  sliceToolpathPoints,
  stockRemovalRenderKey,
} from "../simulation/stock-removal-coordinates";
import { pointOnSegment } from "../utils/gcode-utils";
import {
  getMeasurementCopy,
  localizeMeasurementLabel,
  type MeasurementLanguage,
} from "../measurement/measurement-i18n";
import {
  MeasurementPanel,
  SmartMeasurementOverlay,
  type MeasurementUnit,
} from "./SmartMeasurementTool";
import { CutterModel, resolveCutterModelLength } from "./CutterModel";
import { AdaptiveSimulationDpr } from "./AdaptiveSimulationDpr";
import {
  renderPerformanceProfile,
  resolveSimulationFrameloop,
  resolveSimulationShadowMapSize,
  resolveStockRenderGrid,
  shouldRenderFrame,
} from "../simulation/render-performance";
import {
  analyzeSimulationComplexity,
  resolvePartLabelBudget,
  resolveVisualToolpathTolerance,
} from "../simulation/complexity-policy";
import { simplifyPolyline } from "../geometry/polygon";

const MAX_MEASUREMENT_HISTORY = 6;
function addToMeasurementHistory(
  history: readonly MeasurementResult[],
  result: MeasurementResult,
): MeasurementResult[] {
  return [
    result,
    ...history.filter((entry) => entry.id !== result.id),
  ].slice(0, MAX_MEASUREMENT_HISTORY);
}

interface SolidSimulatorProps {
  lang: MeasurementLanguage;
  simulation: Simulation;
  stock: StockSettings;
  cursor: number;
  segmentProgress?: number;
  playing?: boolean;
  showRapids?: boolean;
  showBounds?: boolean;
  showToolpath?: boolean;
  showTool?: boolean;
  showStock?: boolean;
  showGrid?: boolean;
  resetTrigger?: number;
  onOrbitChange?: (orbit: { yaw: number; pitch: number }) => void;
  quality?: "low" | "medium" | "high";
  isMeasuring: boolean;
  measurementSession: number;
  onMeasurementClose: () => void;
}

type StockMeshProps = Pick<
  SolidSimulatorProps,
  "simulation" | "stock" | "cursor" | "segmentProgress" | "playing" | "quality"
>;

function lerpVec(a: {x:number,y:number,z:number}, b: {x:number,y:number,z:number}, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

export function ToolpathOverlay({
  simulation,
  stock,
  cursor,
  segmentProgress,
  showRapids,
  showToolpath,
  showBounds,
  surfaceZ,
  quality,
  playing,
}: {
  simulation: Simulation;
  stock: StockSettings;
  cursor: number;
  segmentProgress: number;
  showRapids: boolean;
  showToolpath?: boolean;
  showBounds: boolean;
  surfaceZ: number;
  quality: "low" | "medium" | "high";
  playing: boolean;
}) {
  const complexity = useMemo(
    () => analyzeSimulationComplexity(simulation),
    [simulation],
  );
  const visualTolerance = resolveVisualToolpathTolerance(
    stock,
    quality,
    complexity.tier,
    playing,
  );
  const {
    completedCutPositions,
    futureCutPositions,
    activeCutPositions,
    rapidPositions,
    boundsPositions,
  } = useMemo(() => {
    const completedCutPositions: number[] = [];
    const futureCutPositions: number[] = [];
    const activeCutPositions: number[] = [];
    const rapidPositions: number[] = [];

    const appendSegments = (
      target: number[],
      points: readonly { x: number; y: number; z: number }[],
      projectedZ?: number,
    ) => {
      const visualPoints =
        visualTolerance > 0 && projectedZ !== undefined
          ? simplifyPolyline(points, visualTolerance)
          : points;
      for (let index = 1; index < visualPoints.length; index += 1) {
        const from = visualPoints[index - 1];
        const to = visualPoints[index];
        target.push(
          from.x,
          from.y,
          projectedZ ?? from.z,
          to.x,
          to.y,
          projectedZ ?? to.z,
        );
      }
    };

    simulation.segments.forEach((seg, index) => {
      const isTravel = seg.machineCoordinates || seg.kind === "rapid";
      if (isTravel && !showRapids) return;

      if (isTravel) {
        appendSegments(rapidPositions, seg.points);
        return;
      }

      // Project visual guides onto the stock face so deep cuts remain legible.
      // The material-removal heightmap still uses the real programmed Z.
      if (index < cursor) {
        appendSegments(completedCutPositions, seg.points, surfaceZ);
      } else if (index > cursor) {
        appendSegments(futureCutPositions, seg.points, surfaceZ);
      } else {
        const completed = sliceToolpathPoints(seg.points, 0, segmentProgress);
        const future = sliceToolpathPoints(seg.points, segmentProgress, 1);
        appendSegments(completedCutPositions, completed, surfaceZ);
        appendSegments(activeCutPositions, completed, surfaceZ);
        appendSegments(futureCutPositions, future, surfaceZ);
      }
    });

    let boundsPositions: number[] = [];
    if (showBounds) {
      const { minX, maxX, minY, maxY, minZ, maxZ } = simulation.bounds;
      const pts = [
        [minX, minY, minZ], [maxX, minY, minZ],
        [maxX, minY, minZ], [maxX, maxY, minZ],
        [maxX, maxY, minZ], [minX, maxY, minZ],
        [minX, maxY, minZ], [minX, minY, minZ],
        [minX, minY, maxZ], [maxX, minY, maxZ],
        [maxX, minY, maxZ], [maxX, maxY, maxZ],
        [maxX, maxY, maxZ], [minX, maxY, maxZ],
        [minX, maxY, maxZ], [minX, minY, maxZ],
        [minX, minY, minZ], [minX, minY, maxZ],
        [maxX, minY, minZ], [maxX, minY, maxZ],
        [maxX, maxY, minZ], [maxX, maxY, maxZ],
        [minX, maxY, minZ], [minX, maxY, maxZ],
      ];
      boundsPositions = pts.flat();
    }

    return {
      completedCutPositions,
      futureCutPositions,
      activeCutPositions,
      rapidPositions,
      boundsPositions,
    };
  }, [
    cursor,
    segmentProgress,
    showBounds,
    showRapids,
    simulation,
    surfaceZ,
    visualTolerance,
  ]);

  return (
    <group>
      {showToolpath !== false && completedCutPositions.length > 0 && (
        <Line
          points={completedCutPositions}
          color="#47e0a8"
          lineWidth={1.45}
          opacity={0.92}
          transparent
          depthTest={false}
          depthWrite={false}
          renderOrder={30}
          toneMapped={false}
          segments
        />
      )}
      {showToolpath !== false && futureCutPositions.length > 0 && (
        <Line
          points={futureCutPositions}
          color="#b8d3da"
          lineWidth={0.8}
          opacity={0.28}
          transparent
          depthTest={false}
          depthWrite={false}
          renderOrder={29}
          toneMapped={false}
          segments
        />
      )}
      {showToolpath !== false && activeCutPositions.length > 0 && (
        <Line
          points={activeCutPositions}
          color="#fff0a6"
          lineWidth={2.15}
          opacity={1}
          transparent
          depthTest={false}
          depthWrite={false}
          renderOrder={31}
          toneMapped={false}
          segments
        />
      )}
      {showToolpath !== false && showRapids && rapidPositions.length > 0 && (
        <Line 
          points={rapidPositions} 
          color="#ffad55"
          lineWidth={1.2}
          opacity={0.68}
          transparent 
          depthTest={false}
          depthWrite={false}
          renderOrder={29}
          toneMapped={false}
          dashed 
          dashScale={50} 
          segments 
        />
      )}
      {showBounds && boundsPositions.length > 0 && (
        <Line 
          points={boundsPositions} 
          color="#90a9b7"
          lineWidth={0.85}
          opacity={0.3}
          transparent 
          segments 
        />
      )}
    </group>
  );
}

function SpinningCutter({
  tool,
  fluteLength,
  spinning,
  segments,
}: {
  tool: ToolProfile;
  fluteLength: number;
  spinning: boolean;
  segments: number;
}) {
  const cutterRef = useRef<THREE.Group>(null);
  const radius = tool.diameter / 2;
  const cutterLength = resolveCutterModelLength(tool, fluteLength);

  useFrame((_, delta) => {
    if (spinning && cutterRef.current) {
      cutterRef.current.rotation.y -= Math.min(0.75, delta * 24);
    }
  });

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <group ref={cutterRef}>
        <CutterModel
          tool={tool}
          minimumLength={fluteLength}
          color={spinning ? "#d8e5e8" : "#9aa6aa"}
          segments={segments}
        />
        <mesh position={[0, cutterLength * 0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius * 0.72, Math.max(0.12, radius * 0.1), 8, 32]} />
          <meshStandardMaterial color="#48565b" metalness={0.8} roughness={0.25} />
        </mesh>
      </group>
      <mesh position={[0, cutterLength + 9, 0]} castShadow>
        <cylinderGeometry args={[radius * 1.45, radius * 1.2, 18, 12]} />
        <meshStandardMaterial color="#323b40" metalness={0.85} roughness={0.24} />
      </mesh>
    </group>
  );
}

function ToolMeshOverlay({
  simulation,
  cursor,
  segmentProgress,
  stock,
  showTool,
  quality,
  playing,
}: {
  simulation: Simulation;
  cursor: number;
  segmentProgress: number;
  stock: StockSettings;
  showTool: boolean;
  quality: "low" | "medium" | "high";
  playing: boolean;
}) {
  if (!showTool) return null;
  const activeSegment = simulation.segments[Math.min(cursor, simulation.segments.length - 1)];
  const performanceProfile = renderPerformanceProfile(quality);
  const pos = activeSegment ? pointOnSegment(activeSegment, segmentProgress) : { x: stock.originX, y: stock.originY, z: stock.safeZ };
  
  const fluteLength = Math.max(38, stock.thickness * 2.2);
  const activeTool = resolveSegmentTool(stock, activeSegment?.tool) ?? {
    id: "fallback",
    diameter: stock.toolDiameter || 6,
    type: "flat" as const,
  };
  return (
    <group position={[pos.x, pos.y, pos.z]}>
      <SpinningCutter
        tool={activeTool}
        fluteLength={fluteLength}
        spinning={Boolean(
          playing &&
            activeSegment &&
            activeSegment.spindleState !== "off" &&
            activeSegment.spindle > 0,
        )}
        segments={performanceProfile.cutterSegments}
      />
    </group>
  );
}

function getDepthColor(
  z: number,
  bounds: { topZ: number; bottomZ: number },
) {
  const intensity = depthIntensity(z, bounds);
  return `rgb(${intensity}, ${intensity}, ${intensity})`;
}

const SURFACE_EPSILON = 0.000001;

function paintStockSurface(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  const base = ctx.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, "#bd8957");
  base.addColorStop(0.5, "#a66f42");
  base.addColorStop(1, "#89502f");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const grainSpacing = Math.max(5, Math.round(height / 150));
  const sampleStep = Math.max(18, Math.round(width / 150));
  for (let y = grainSpacing; y < height; y += grainSpacing) {
    const phase = y / grainSpacing;
    ctx.strokeStyle =
      phase % 3 === 0 ? "rgba(72, 39, 19, 0.18)" : "rgba(255, 229, 184, 0.12)";
    ctx.lineWidth = phase % 5 === 0 ? 1.5 : 0.8;
    ctx.beginPath();
    for (let x = 0; x <= width; x += sampleStep) {
      const wave =
        Math.sin(x * 0.014 + phase * 0.71) * grainSpacing * 0.34 +
        Math.sin(x * 0.004 + phase * 1.7) * grainSpacing * 0.24;
      if (x === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }

  const knotCount = Math.max(1, Math.min(5, Math.round((width * height) / 1_500_000)));
  for (let index = 0; index < knotCount; index += 1) {
    const x = width * (0.18 + ((index * 0.37) % 0.68));
    const y = height * (0.22 + ((index * 0.29) % 0.56));
    const radiusX = Math.max(10, width * (0.007 + (index % 2) * 0.002));
    const radiusY = Math.max(5, radiusX * 0.42);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, radiusY / radiusX);
    const knot = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusX);
    knot.addColorStop(0, "rgba(83, 45, 23, 0.36)");
    knot.addColorStop(0.42, "rgba(115, 66, 34, 0.2)");
    knot.addColorStop(1, "rgba(99, 55, 27, 0)");
    ctx.fillStyle = knot;
    ctx.beginPath();
    ctx.arc(0, 0, radiusX, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = "rgba(255, 239, 210, 0.018)";
  ctx.fillRect(0, 0, width, height);
}

function paintPlywoodEdge(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  ctx.fillStyle = "#8d5430";
  ctx.fillRect(0, 0, width, height);
  const layerHeight = Math.max(3, Math.round(height / 14));
  for (let y = 0; y < height; y += layerHeight) {
    const layer = Math.floor(y / layerHeight);
    ctx.fillStyle = layer % 2 === 0
      ? "rgba(205, 151, 91, 0.62)"
      : "rgba(68, 38, 23, 0.54)";
    ctx.fillRect(0, y, width, Math.max(1, layerHeight - 1));
  }
  ctx.strokeStyle = "rgba(58, 31, 17, 0.32)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 5, height);
    ctx.stroke();
  }
}

export function StockMesh({ simulation, stock, cursor, segmentProgress = 1, playing = false, quality = "medium" }: StockMeshProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const surfaceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const surfaceTextureRef = useRef<THREE.CanvasTexture | null>(null);
  
  const lastCursorRef = useRef<number>(0);
  const lastProgressRef = useRef<number>(0);
  const lastTextureFrameRef = useRef(Number.NEGATIVE_INFINITY);
  const renderSourceRef = useRef<{
    canvas: HTMLCanvasElement;
    simulation: Simulation;
    key: string;
  } | null>(null);

  const performanceProfile = renderPerformanceProfile(quality);
  const maxTextureSize = useThree((state) => state.gl.capabilities.maxTextureSize);
  const supportedAnisotropy = useThree((state) =>
    state.gl.capabilities.getMaxAnisotropy(),
  );
  const {
    textureWidth,
    textureHeight,
    segmentsX,
    segmentsY,
  } = useMemo(
    () =>
      resolveStockRenderGrid(
        stock.width,
        stock.height,
        quality,
        maxTextureSize,
        playing,
      ),
    [maxTextureSize, playing, quality, stock.height, stock.width],
  );
  const textureAnisotropy = Math.min(
    playing ? 1 : performanceProfile.maxAnisotropy,
    supportedAnisotropy,
  );

  const { canvas, texture, surfaceCanvas, surfaceTexture, edgeTexture } = useMemo(() => {
    const el = document.createElement("canvas");
    el.width = textureWidth;
    el.height = textureHeight;
    const ctx = el.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, textureWidth, textureHeight);
    }
    const tex = new THREE.CanvasTexture(el);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    const surfaceEl = document.createElement("canvas");
    surfaceEl.width = textureWidth;
    surfaceEl.height = textureHeight;
    const surfaceCtx = surfaceEl.getContext("2d");
    if (surfaceCtx) paintStockSurface(surfaceCtx, textureWidth, textureHeight);
    const surfaceTex = new THREE.CanvasTexture(surfaceEl);
    surfaceTex.colorSpace = THREE.SRGBColorSpace;
    surfaceTex.minFilter =
      quality === "low" || playing
        ? THREE.LinearFilter
        : THREE.LinearMipmapLinearFilter;
    surfaceTex.magFilter = THREE.LinearFilter;
    surfaceTex.generateMipmaps = quality !== "low" && !playing;
    surfaceTex.anisotropy = textureAnisotropy;

    const edgeEl = document.createElement("canvas");
    edgeEl.width = 256;
    edgeEl.height = 128;
    const edgeCtx = edgeEl.getContext("2d");
    if (edgeCtx) paintPlywoodEdge(edgeCtx, edgeEl.width, edgeEl.height);
    const edgeTex = new THREE.CanvasTexture(edgeEl);
    edgeTex.colorSpace = THREE.SRGBColorSpace;
    edgeTex.minFilter = THREE.LinearMipmapLinearFilter;
    edgeTex.magFilter = THREE.LinearFilter;
    edgeTex.generateMipmaps = true;
    edgeTex.anisotropy = Math.max(1, textureAnisotropy);
    return {
      canvas: el,
      texture: tex,
      surfaceCanvas: surfaceEl,
      surfaceTexture: surfaceTex,
      edgeTexture: edgeTex,
    };
  }, [playing, quality, textureAnisotropy, textureHeight, textureWidth]);

  useEffect(() => {
    canvasRef.current = canvas;
    textureRef.current = texture;
    surfaceCanvasRef.current = surfaceCanvas;
    surfaceTextureRef.current = surfaceTexture;
    return () => {
      texture.dispose();
      surfaceTexture.dispose();
      edgeTexture.dispose();
    };
  }, [canvas, edgeTexture, surfaceCanvas, surfaceTexture, texture]);

  useEffect(() => {
    const el = canvasRef.current;
    const tex = textureRef.current;
    const surfaceEl = surfaceCanvasRef.current;
    const surfaceTex = surfaceTextureRef.current;
    if (!el || !tex || !surfaceEl || !surfaceTex) return;
    const ctx = el.getContext("2d");
    const surfaceCtx = surfaceEl.getContext("2d");
    if (!ctx || !surfaceCtx) return;

    const zBounds = resolveStockZBounds(simulation, stock);
    const renderKey = `${stockRemovalRenderKey(
      stock,
      Math.max(textureWidth, textureHeight),
      zBounds,
    )}:${textureWidth}x${textureHeight}`;
    const previousSource = renderSourceRef.current;
    const sourceChanged =
      previousSource?.canvas !== el ||
      previousSource.simulation !== simulation ||
      previousSource.key !== renderKey;

    const textureTimestamp = performance.now();
    const playbackReversed =
      cursor < lastCursorRef.current ||
      (cursor === lastCursorRef.current &&
        segmentProgress < lastProgressRef.current);
    if (
      playing &&
      !sourceChanged &&
      !playbackReversed &&
      !shouldRenderFrame(
        lastTextureFrameRef.current,
        textureTimestamp,
        performanceProfile.stockTextureFrameIntervalMs,
      )
    ) {
      return;
    }

    let startCursor = sourceChanged ? 0 : lastCursorRef.current;
    let startProgress = sourceChanged ? 0 : lastProgressRef.current;
    let hasChanges = false;

    if (
      sourceChanged ||
      cursor < startCursor ||
      (cursor === startCursor && segmentProgress < startProgress)
    ) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, textureWidth, textureHeight);
      paintStockSurface(surfaceCtx, textureWidth, textureHeight);
      startCursor = 0;
      startProgress = 0;
      hasChanges = true;
    }

    const scaleX = textureWidth / Math.max(1e-6, stock.width);
    const scaleY = textureHeight / Math.max(1e-6, stock.height);
    const detailQuality = playing
      ? quality === "high"
        ? "medium"
        : "low"
      : quality;
    const profileBandCount = detailQuality === "high" ? 32 : detailQuality === "medium" ? 20 : 10;

    const drawLine = (
      from: { x: number; y: number; z: number },
      to: { x: number; y: number; z: number },
      tool: ToolProfile,
    ) => {
      // Break ramps into shallow depth bands. A single average color would
      // incorrectly make the whole ramp one depth.
      const depthQuantum = tool.type === "flat"
        ? 0.25
        : detailQuality === "high"
          ? 0.05
          : detailQuality === "medium"
            ? 0.1
            : 0.18;
      const depthSteps = Math.min(
        256,
        Math.max(1, Math.ceil(Math.abs(to.z - from.z) / depthQuantum)),
      );
      for (let step = 0; step < depthSteps; step += 1) {
        const sectionStart = lerpVec(from, to, step / depthSteps);
        const sectionEnd = lerpVec(from, to, (step + 1) / depthSteps);
        const averageZ = (sectionStart.z + sectionEnd.z) / 2;
        const sweepBands = buildCutterContactBands(
          tool,
          averageZ,
          zBounds,
          profileBandCount,
        );
        const endpointBands = buildCutterContactBands(
          tool,
          sectionEnd.z,
          zBounds,
          profileBandCount,
        );
        if (sweepBands.length === 0 && endpointBands.length === 0) continue;

        const paintBands = (
          target: CanvasRenderingContext2D,
          composite: GlobalCompositeOperation,
          color: (z: number) => string,
          minimumDepth: number,
        ) => {
          target.save();
          target.globalCompositeOperation = composite;
          // Draw in millimetres, then scale each stock axis independently.
          // This preserves a circular cutter footprint on non-square stock.
          target.setTransform(
            scaleX,
            0,
            0,
            -scaleY,
            -stock.originX * scaleX,
            textureHeight + stock.originY * scaleY,
          );
          target.lineCap = "round";
          target.lineJoin = "round";
          for (const band of sweepBands) {
            if (band.z >= minimumDepth) continue;
            target.strokeStyle = color(band.z);
            target.lineWidth = band.diameter;
            target.beginPath();
            target.moveTo(sectionStart.x, sectionStart.y);
            target.lineTo(sectionEnd.x, sectionEnd.y);
            target.stroke();
          }
          // Stamp every cutter-profile band at the exact endpoint depth. This
          // keeps plunges visible without flattening ball noses or V-bits.
          for (const band of endpointBands) {
            if (band.z >= minimumDepth) continue;
            target.fillStyle = color(band.z);
            target.beginPath();
            target.arc(
              sectionEnd.x,
              sectionEnd.y,
              band.diameter / 2,
              0,
              Math.PI * 2,
            );
            target.fill();
          }
          target.restore();
        };

        // The height texture is monotonic: a later shallow pass can never
        // restore material removed by a deeper pass.
        paintBands(
          ctx,
          "darken",
          (z) => getDepthColor(z, zBounds),
          zBounds.topZ + SURFACE_EPSILON,
        );
        // A separate albedo texture makes even physically shallow engraving
        // visible. The old shader hid a 0.2 mm cut on 18 mm stock almost fully.
        paintBands(
          surfaceCtx,
          "darken",
          (z) => cutSurfaceColor(z, zBounds),
          zBounds.topZ - SURFACE_EPSILON,
        );

        if (
          sweepBands.some((band) => band.z < zBounds.topZ - SURFACE_EPSILON)
        ) {
          surfaceCtx.save();
          surfaceCtx.globalCompositeOperation = "multiply";
          surfaceCtx.setTransform(
            scaleX,
            0,
            0,
            -scaleY,
            -stock.originX * scaleX,
            textureHeight + stock.originY * scaleY,
          );
          surfaceCtx.strokeStyle = "rgba(105, 64, 35, 0.16)";
          surfaceCtx.lineWidth = Math.max(0.18, Math.min(1.1, tool.diameter * 0.1));
          surfaceCtx.lineCap = "round";
          surfaceCtx.beginPath();
          surfaceCtx.moveTo(sectionStart.x, sectionStart.y);
          surfaceCtx.lineTo(sectionEnd.x, sectionEnd.y);
          surfaceCtx.stroke();
          surfaceCtx.restore();
        }
        hasChanges = true;
      }
    };

    if (cursor !== startCursor || segmentProgress !== startProgress) {
      for (let index = startCursor; index <= cursor; index += 1) {
        const segment = simulation.segments[index];
        if (
          !segment ||
          segment.machineCoordinates ||
          segment.kind === "rapid" ||
          segment.kind === "dwell" ||
          segment.spindleState === "off" ||
          segment.spindle <= 0
        ) {
          continue;
        }

        const segmentStartProgress = index === startCursor ? startProgress : 0;
        const segmentEndProgress = index === cursor ? segmentProgress : 1;
        const points = sliceToolpathPoints(
          segment.points,
          segmentStartProgress,
          segmentEndProgress,
        );
        if (points.length < 2) continue;

        const activeTool = resolveSegmentTool(stock, segment.tool);
        const tool: ToolProfile = activeTool ?? {
          id: "fallback",
          diameter: stock.toolDiameter || 6,
          type: "flat",
        };
        for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
          drawLine(points[pointIndex - 1], points[pointIndex], tool);
        }
      }
    }

    if (hasChanges) {
      tex.needsUpdate = true;
      surfaceTex.needsUpdate = true;
      lastTextureFrameRef.current = textureTimestamp;
    }

    lastCursorRef.current = cursor;
    lastProgressRef.current = segmentProgress;
    renderSourceRef.current = { canvas: el, simulation, key: renderKey };
  }, [
    simulation,
    cursor,
    segmentProgress,
    playing,
    stock,
    textureHeight,
    textureWidth,
    quality,
    performanceProfile,
  ]);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[stock.width, stock.height, stock.thickness, 1, 1, 1]} />
        {[0, 1, 2, 3].map((idx) => (
          <meshStandardMaterial
            key={idx}
            attach={`material-${idx}`}
            color="#ffffff"
            map={edgeTexture}
            roughness={0.86}
            metalness={0.02}
          />
        ))}
        {[4, 5].map((idx) => (
          <meshStandardMaterial
            key={idx}
            attach={`material-${idx}`}
            transparent
            opacity={0}
            depthWrite={false}
          />
        ))}
      </mesh>

      <mesh position={[0, 0, stock.thickness / 2]} castShadow receiveShadow>
        <planeGeometry args={[stock.width, stock.height, segmentsX, segmentsY]} />
        <meshStandardMaterial
          color="#ffffff"
          map={surfaceTexture}
          roughness={0.88}
          metalness={0.015}
          displacementMap={texture}
          displacementScale={stock.thickness}
          displacementBias={-stock.thickness}
          bumpMap={texture}
          bumpScale={Math.max(0.2, Math.min(1.6, stock.thickness * 0.09))}
          alphaMap={texture}
          alphaTest={0.012}
          alphaToCoverage={quality !== "low"}
        />
      </mesh>
    </group>
  );
}

function PartLabel({
  id,
  width,
  height,
  labelClearance,
  quality,
}: {
  id: string;
  width: number;
  height: number;
  labelClearance?: number;
  quality: "low" | "medium" | "high";
}) {
  const supportedAnisotropy = useThree((state) =>
    state.gl.capabilities.getMaxAnisotropy(),
  );
  const texture = useMemo(() => {
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = quality === "high" ? 768 : quality === "medium" ? 640 : 384;
    labelCanvas.height = Math.round(labelCanvas.width * (192 / 512));
    const context = labelCanvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
      context.scale(labelCanvas.width / 512, labelCanvas.height / 192);
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineJoin = "round";

      context.fillStyle = "rgba(20, 25, 25, 0.86)";
      context.strokeStyle = "rgba(255, 236, 194, 0.9)";
      context.lineWidth = 3;
      context.beginPath();
      context.roundRect(28, 14, 456, 164, 18);
      context.fill();
      context.stroke();

      context.font = '800 72px "Arial Narrow", Arial, sans-serif';
      context.fillStyle = "#fffaf0";
      context.fillText(id, 256, 65);

      context.font = '700 40px ui-monospace, "Cascadia Mono", monospace';
      const dimensions = `${Math.round(width)} × ${Math.round(height)}`;
      context.fillStyle = "#ffc878";
      context.fillText(dimensions, 256, 139);
    }

    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    labelTexture.minFilter = quality === "low"
      ? THREE.LinearFilter
      : THREE.LinearMipmapLinearFilter;
    labelTexture.magFilter = THREE.LinearFilter;
    labelTexture.generateMipmaps = quality !== "low";
    labelTexture.anisotropy = Math.min(
      quality === "high" ? 12 : quality === "medium" ? 6 : 1,
      supportedAnisotropy,
    );
    return labelTexture;
  }, [height, id, quality, supportedAnisotropy, width]);

  useEffect(() => () => texture.dispose(), [texture]);

  const labelWidth = Math.max(
    10,
    Math.min(
      150,
      width * 0.72,
      height * 2.4,
      (labelClearance ?? Number.POSITIVE_INFINITY) * 2,
    ),
  );
  const labelHeight = labelWidth * (192 / 512);
  return (
    <mesh renderOrder={20}>
      <planeGeometry args={[labelWidth, labelHeight]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        toneMapped={false}
      />
    </mesh>
  );
}

export function PartLabelsOverlay({
  simulation,
  topZ,
  quality,
  playing,
}: {
  simulation: Simulation;
  topZ: number;
  quality: "low" | "medium" | "high";
  playing: boolean;
}) {
  const parts = useMemo(() => {
    const complexity = analyzeSimulationComplexity(simulation);
    const budget = resolvePartLabelBudget(
      quality,
      complexity.tier,
      playing,
    );
    return [...simulation.parts]
      .sort((left, right) => right.area - left.area)
      .slice(0, budget);
  }, [playing, quality, simulation]);
  if (parts.length === 0) return null;
  return (
    <>
      {parts.map((part) => {
        const labelPosition = part.labelPosition ?? part.centroid;
        const centerX = labelPosition?.x ?? part.minX + part.width / 2;
        const centerY = labelPosition?.y ?? part.minY + part.height / 2;
        return (
          <group key={part.id} position={[centerX, centerY, topZ + 0.16]}>
            <PartLabel
              id={part.id}
              width={part.width}
              height={part.height}
              labelClearance={part.labelClearance}
              quality={quality}
            />
          </group>
        );
      })}
    </>
  );
}

export function SolidSimulator(props: SolidSimulatorProps) {
  const measurementCopy = getMeasurementCopy(props.lang);
  const quality = props.quality ?? "medium";
  const performanceProfile = renderPerformanceProfile(quality);
  const shadowMapSize = resolveSimulationShadowMapSize(
    quality,
    props.playing ?? false,
  );
  const sceneExtent = Math.max(props.stock.width, props.stock.height);
  const glOptions = useMemo(
    () => ({
      antialias: quality !== "low",
      powerPreference: "high-performance" as const,
    }),
    [quality],
  );
  const onMeasurementClose = props.onMeasurementClose;
  const { topZ, bottomZ } = resolveStockZBounds(
    props.simulation,
    props.stock,
  );
  const overlayPosition = resolveSolidOverlayPosition(props.stock, {
    topZ,
    bottomZ,
  });
  const toolpathSurfaceZ = resolveToolpathOverlayZ(props.stock, {
    topZ,
    bottomZ,
  });
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const measurementSession = props.measurementSession;
  const [measurementConstraintState, setMeasurementConstraintState] = useState<{
    session: number;
    value: MeasurementConstraint;
  }>(() => ({ session: measurementSession, value: "free" }));
  const measurementConstraint =
    measurementConstraintState.session === measurementSession
      ? measurementConstraintState.value
      : "free";
  const updateMeasurementConstraint = useCallback(
    (
      next:
        | MeasurementConstraint
        | ((current: MeasurementConstraint) => MeasurementConstraint),
    ) => {
      setMeasurementConstraintState((current) => {
        const currentValue =
          current.session === measurementSession ? current.value : "free";
        return {
          session: measurementSession,
          value: typeof next === "function" ? next(currentValue) : next,
        };
      });
    },
    [measurementSession],
  );
  const [measurementUnit, setMeasurementUnit] =
    useState<MeasurementUnit>("mm");
  const [hoveredMeasurementSnap, setHoveredMeasurementSnap] =
    useState<SnapCandidate | null>(null);
  const [measurementState, setMeasurementState] = useState<{
    session: number;
    simulation: Simulation;
    stock: StockSettings;
    start: SnapCandidate | null;
    result: MeasurementResult | null;
    history: MeasurementResult[];
  }>(() => ({
    session: measurementSession,
    simulation: props.simulation,
    stock: props.stock,
    start: null,
    result: null,
    history: [],
  }));
  const measurementStateIsCurrent =
    measurementState.session === measurementSession &&
    measurementState.simulation === props.simulation &&
    measurementState.stock === props.stock;
  const measurementStart = measurementStateIsCurrent
    ? measurementState.start
    : null;
  const measurementResult = measurementStateIsCurrent
    ? measurementState.result
    : null;
  const measurementGeometryIsCurrent =
    measurementState.simulation === props.simulation &&
    measurementState.stock === props.stock;
  const measurementHistory = measurementGeometryIsCurrent
    ? measurementState.history
    : [];
  const activeMeasurementSegment = props.simulation.segments[
    Math.min(
      Math.max(0, props.cursor),
      Math.max(0, props.simulation.segments.length - 1),
    )
  ];
  const activeCoordinateSystem =
    activeMeasurementSegment?.coordinateSystem ??
    props.simulation.finalState.coordinateSystem ??
    "G54";
  const workOrigin = useMemo(() => {
    if (activeMeasurementSegment) {
      // Measurements live in Studio's G54-relative display frame. Derive the
      // active datum from this segment's displayed endpoint and matching work
      // endpoint, even for a non-modal G53 move that keeps the active WCS.
      return calculateWorkOrigin(
        activeMeasurementSegment.end,
        activeMeasurementSegment.workEnd,
      );
    }
    return calculateWorkOrigin(
      props.simulation.finalState.position,
      props.simulation.finalState.workPosition,
    );
  }, [activeMeasurementSegment, props.simulation]);

  const rawMeasurementCandidates = useMemo(
    () => buildMeasurementSnapCandidates(props.simulation, props.stock, topZ),
    [props.simulation, props.stock, topZ],
  );
  const measurementCandidates = useMemo(() => {
    const visible = rawMeasurementCandidates.filter((candidate) => {
      if (props.showToolpath === false && candidate.id.startsWith("segment:")) {
        return false;
      }
      if (props.showStock === false && candidate.id.startsWith("stock:")) {
        return false;
      }
      return true;
    });
    const maximumCandidates = 5_000;
    if (visible.length <= maximumCandidates) return visible;

    const structural = visible.filter(
      (candidate) => candidate.kind === "corner" || candidate.kind === "center",
    );
    const pathCandidates = visible.filter(
      (candidate) => candidate.kind !== "corner" && candidate.kind !== "center",
    );
    const remainingSlots = Math.max(0, maximumCandidates - structural.length);
    if (remainingSlots === 0) return structural.slice(0, maximumCandidates);

    const sampledPath = Array.from({ length: remainingSlots }, (_, index) =>
      pathCandidates[Math.floor((index * pathCandidates.length) / remainingSlots)],
    ).filter((candidate): candidate is SnapCandidate => Boolean(candidate));
    return [...structural, ...sampledPath];
  }, [props.showStock, props.showToolpath, rawMeasurementCandidates]);
  const automaticMeasurements = useMemo(
    () => buildAutomaticMeasurements(props.simulation, props.stock, topZ),
    [props.simulation, props.stock, topZ],
  );
  const measurementMarkerSize = Math.max(
    1.5,
    Math.min(10, Math.max(props.stock.width, props.stock.height) / 280),
  );

  const resetMeasurement = useCallback(() => {
    setHoveredMeasurementSnap(null);
    updateMeasurementConstraint("free");
    setMeasurementState((current) => {
      const sameGeometry =
        current.simulation === props.simulation && current.stock === props.stock;
      return {
        session: measurementSession,
        simulation: props.simulation,
        stock: props.stock,
        start: null,
        result: null,
        history: sameGeometry ? current.history : [],
      };
    });
  }, [
    measurementSession,
    props.simulation,
    props.stock,
    updateMeasurementConstraint,
  ]);

  const selectMeasurementPoint = useCallback(
    (candidate: SnapCandidate) => {
      setMeasurementState((current) => {
        const sameGeometry =
          current.simulation === props.simulation && current.stock === props.stock;
        const sameSession =
          sameGeometry && current.session === measurementSession;
        const history = sameGeometry ? current.history : [];
        const currentStart = sameSession ? current.start : null;

        if (!currentStart) {
          return {
            session: measurementSession,
            simulation: props.simulation,
            stock: props.stock,
            start: candidate,
            result: null,
            history,
          };
        }

        const constrainedEnd = constrainMeasurementPoint(
          currentStart.point,
          candidate.point,
          measurementConstraint,
        );
        const result = calculateMeasurement(currentStart.point, constrainedEnd, {
          label: `${measurementCopy.resultConstraintLabels[measurementConstraint]} · ${localizeMeasurementLabel(currentStart.label, props.lang)} → ${localizeMeasurementLabel(candidate.label, props.lang)}`,
          source: "manual",
        });
        if (result.distance < 0.0005) return current;
        return {
          session: measurementSession,
          simulation: props.simulation,
          stock: props.stock,
          start: null,
          result,
          history: addToMeasurementHistory(history, result),
        };
      });
    },
    [
      measurementConstraint,
      measurementCopy,
      measurementSession,
      props.lang,
      props.simulation,
      props.stock,
    ],
  );

  const selectAutomaticMeasurement = useCallback(
    (preset: MeasurementPreset) => {
      setHoveredMeasurementSnap(null);
      updateMeasurementConstraint("free");
      setMeasurementState((current) => {
        const sameGeometry =
          current.simulation === props.simulation && current.stock === props.stock;
        const history = sameGeometry ? current.history : [];
        return {
          session: measurementSession,
          simulation: props.simulation,
          stock: props.stock,
          start: null,
          result: preset,
          history: addToMeasurementHistory(history, preset),
        };
      });
    },
    [
      measurementSession,
      props.simulation,
      props.stock,
      updateMeasurementConstraint,
    ],
  );

  const selectWorkOrigin = useCallback(() => {
    setHoveredMeasurementSnap(null);
    updateMeasurementConstraint("free");
    setMeasurementState((current) => {
      const sameGeometry =
        current.simulation === props.simulation && current.stock === props.stock;
      return {
        session: measurementSession,
        simulation: props.simulation,
        stock: props.stock,
        start: {
          id: `datum:${activeCoordinateSystem}`,
          point: { ...workOrigin },
          kind: "corner",
          label: measurementCopy.programmedDatum(activeCoordinateSystem),
          priority: Number.POSITIVE_INFINITY,
        },
        result: null,
        history: sameGeometry ? current.history : [],
      };
    });
  }, [
    activeCoordinateSystem,
    measurementCopy,
    measurementSession,
    props.simulation,
    props.stock,
    updateMeasurementConstraint,
    workOrigin,
  ]);

  const selectMeasurementHistory = useCallback(
    (result: MeasurementResult) => {
      setHoveredMeasurementSnap(null);
      setMeasurementState((current) => {
        const sameGeometry =
          current.simulation === props.simulation && current.stock === props.stock;
        return {
          session: measurementSession,
          simulation: props.simulation,
          stock: props.stock,
          start: null,
          result,
          history: sameGeometry ? current.history : [],
        };
      });
    },
    [measurementSession, props.simulation, props.stock],
  );

  const clearMeasurementHistory = useCallback(() => {
    setMeasurementState((current) => {
      if (
        current.simulation !== props.simulation ||
        current.stock !== props.stock
      ) {
        return current;
      }
      return { ...current, history: [] };
    });
  }, [props.simulation, props.stock]);

  const undoMeasurement = useCallback(() => {
    setHoveredMeasurementSnap(null);
    setMeasurementState((current) => {
      const sameGeometry =
        current.simulation === props.simulation && current.stock === props.stock;
      const sameSession =
        sameGeometry && current.session === measurementSession;
      const currentResult = sameSession ? current.result : null;
      if (currentResult) {
        return {
          session: measurementSession,
          simulation: props.simulation,
          stock: props.stock,
          start: {
            id: `restored:${currentResult.id}`,
            point: { ...currentResult.start },
            kind: "free",
            label: measurementCopy.restoredPointA,
            priority: 0,
          },
          result: null,
          history: current.history,
        };
      }
      return {
        session: measurementSession,
        simulation: props.simulation,
        stock: props.stock,
        start: null,
        result: null,
        history: sameGeometry ? current.history : [],
      };
    });
  }, [
    measurementCopy,
    measurementSession,
    props.simulation,
    props.stock,
  ]);

  useEffect(() => {
    if (controlsRef.current && props.resetTrigger) {
      controlsRef.current.reset();
    }
  }, [props.resetTrigger]);

  useEffect(() => {
    if (!props.isMeasuring) return;
    const handleMeasurementShortcut = (event: KeyboardEvent) => {
      const editableTarget =
        event.target instanceof Element &&
        Boolean(
          event.target.closest(
            "input, textarea, select, button, [contenteditable='true']",
          ),
        );

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (measurementStart || measurementResult) {
          undoMeasurement();
        } else {
          onMeasurementClose();
        }
        return;
      }

      if (
        editableTarget ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "o" && !measurementResult) {
        event.preventDefault();
        event.stopImmediatePropagation();
        selectWorkOrigin();
        return;
      }

      if (!measurementStart) return;
      const shortcutConstraints: Partial<
        Record<string, MeasurementConstraint>
      > = {
        f: "free",
        p: "xy",
        x: "x",
        y: "y",
        z: "z",
      };
      const nextConstraint = shortcutConstraints[key];
      if (!nextConstraint) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      setHoveredMeasurementSnap(null);
      updateMeasurementConstraint((current) =>
        current === nextConstraint && nextConstraint !== "free"
          ? "free"
          : nextConstraint,
      );
    };
    window.addEventListener("keydown", handleMeasurementShortcut, true);
    return () =>
      window.removeEventListener("keydown", handleMeasurementShortcut, true);
  }, [
    measurementResult,
    measurementStart,
    props.isMeasuring,
    onMeasurementClose,
    selectWorkOrigin,
    undoMeasurement,
    updateMeasurementConstraint,
  ]);

  return (
    <div
      className={`solid-simulator${props.isMeasuring ? " is-measuring" : ""}`}
      role="region"
      aria-label={measurementCopy.simulatorRegion}
      style={{ width: "100%", height: "100%", background: "#0c1217", position: "absolute", top: 0, left: 0, zIndex: 0 }}
    >
      <div className="solid-simulator__viewport">
        <Canvas
          aria-label={measurementCopy.simulatorCanvas}
          role="img"
          frameloop={resolveSimulationFrameloop(props.playing ?? false)}
          shadows={quality !== "low"}
          dpr={performanceProfile.dpr}
          gl={glOptions}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 0.86;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
          }}
          camera={{ position: [0, Math.max(props.stock.width, props.stock.height) * 1.2, Math.max(props.stock.width, props.stock.height) * 1.0], fov: 45, near: 1, far: Math.max(props.stock.width, props.stock.height) * 10 }}
          fallback={(
            <div className="simulator-error" role="alert">
              {props.lang === "VN"
                ? "Không thể khởi tạo WebGL. Hãy bật tăng tốc phần cứng rồi tải lại trang."
                : "WebGL could not start. Enable hardware acceleration, then reload the page."}
            </div>
          )}
        >
        <AdaptiveSimulationDpr
          quality={quality}
          playing={props.playing ?? false}
          cursor={props.cursor}
          segmentProgress={props.segmentProgress ?? 1}
        />
        <color attach="background" args={["#091014"]} />
        <hemisphereLight args={["#c6dbe0", "#111718", 0.5]} />
        <ambientLight intensity={0.18} />
        <directionalLight 
          position={[props.stock.width / 2, props.stock.width * 0.8, props.stock.height * 0.8]} 
          intensity={1.55}
          castShadow={quality !== "low"}
          shadow-mapSize-width={shadowMapSize}
          shadow-mapSize-height={shadowMapSize}
          shadow-bias={-0.0005}
        >
          <orthographicCamera attach="shadow-camera" args={[-props.stock.width, props.stock.width, props.stock.height, -props.stock.height, 0.1, props.stock.width * 3]} />
        </directionalLight>
        
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.7, 0]}
          receiveShadow
        >
          <planeGeometry args={[sceneExtent * 4, sceneExtent * 4]} />
          <meshStandardMaterial
            color="#10181c"
            roughness={0.96}
            metalness={0.08}
          />
        </mesh>

        {/* Machine Bed Grid */}
        {props.showGrid !== false && (
          <gridHelper 
            args={[
              Math.max(props.stock.width, props.stock.height) * 3, 
              Math.round(Math.max(props.stock.width, props.stock.height) * 3 / 100), 
              "#444444", 
              "#222222"
            ]} 
            position={[0, -0.62, 0]}
          />
        )}

        {/* Elevate the board so its bottom sits exactly at Y=0 (the machine bed) */}
        <group position={[0, props.stock.thickness / 2, 0]}>
          {props.showStock !== false && <StockMesh {...props} />}
          
          {/* Overlay group mapping CNC coordinates to Local coordinates */}
          {/* CNC X -> Local X, CNC Y -> Local Y, CNC Z -> Local Z */}
          <group 
            rotation={[-Math.PI / 2, 0, 0]} 
            position={overlayPosition}
          >
            <PartLabelsOverlay
              simulation={props.simulation}
              topZ={topZ}
              quality={quality}
              playing={props.playing ?? false}
            />
            <ToolpathOverlay 
              simulation={props.simulation}
              stock={props.stock}
              cursor={props.cursor}
              segmentProgress={props.segmentProgress ?? 1}
              showRapids={props.showRapids ?? true} 
              showToolpath={props.showToolpath ?? true}
              showBounds={props.showBounds ?? true} 
              surfaceZ={toolpathSurfaceZ}
              quality={quality}
              playing={props.playing ?? false}
            />
            {props.isMeasuring ? (
              <SmartMeasurementOverlay
                lang={props.lang}
                candidates={measurementCandidates}
                planeZ={topZ}
                planeBounds={{
                  minX: props.stock.originX,
                  minY: props.stock.originY,
                  maxX: props.stock.originX + props.stock.width,
                  maxY: props.stock.originY + props.stock.height,
                }}
                markerSize={measurementMarkerSize}
                snapEnabled={snapEnabled}
                constraint={measurementConstraint}
                unit={measurementUnit}
                start={measurementStart}
                result={measurementResult}
                onSelect={selectMeasurementPoint}
                onHoverChange={setHoveredMeasurementSnap}
              />
            ) : null}
            <ToolMeshOverlay 
              simulation={props.simulation} 
              cursor={props.cursor} 
              segmentProgress={props.segmentProgress ?? 1} 
              stock={props.stock} 
              showTool={props.showTool ?? true}
              quality={props.quality ?? "medium"}
              playing={props.playing ?? false}
            />
          </group>
        </group>

        <OrbitControls 
          ref={controlsRef} 
          makeDefault 
          onChange={(e) => {
            if (props.onOrbitChange && e?.target) {
              const az = e.target.getAzimuthalAngle();
              const pol = e.target.getPolarAngle();
              props.onOrbitChange({ yaw: az, pitch: Math.PI / 2 - pol });
            }
          }}
        />
        </Canvas>
      </div>
      {props.isMeasuring ? (
        <div className="measurement-dock">
          <MeasurementPanel
            lang={props.lang}
            candidateCount={measurementCandidates.length}
            candidates={measurementCandidates}
            coordinateOffset={workOrigin}
            coordinateSystem={activeCoordinateSystem}
            hovered={hoveredMeasurementSnap}
            start={measurementStart}
            result={measurementResult}
            history={measurementHistory}
            presets={automaticMeasurements}
            snapEnabled={snapEnabled}
            constraint={measurementConstraint}
            unit={measurementUnit}
            onToggleSnap={() => setSnapEnabled((enabled) => !enabled)}
            onConstraintChange={(constraint) => {
              setHoveredMeasurementSnap(null);
              updateMeasurementConstraint(constraint);
            }}
            onToggleUnit={() =>
              setMeasurementUnit((current) => (current === "mm" ? "in" : "mm"))
            }
            onSetDatum={selectWorkOrigin}
            onNew={resetMeasurement}
            onUndo={undoMeasurement}
            onPreset={selectAutomaticMeasurement}
            onCandidateSelect={selectMeasurementPoint}
            onHistorySelect={selectMeasurementHistory}
            onHistoryClear={clearMeasurementHistory}
            onClose={onMeasurementClose}
          />
        </div>
      ) : null}
    </div>
  );
}
