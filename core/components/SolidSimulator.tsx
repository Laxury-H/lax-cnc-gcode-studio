import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Text, Line } from "@react-three/drei";
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
import { MachiningEffects } from "./MachiningEffects";

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
  "simulation" | "stock" | "cursor" | "segmentProgress" | "quality"
>;

function lerpVec(a: {x:number,y:number,z:number}, b: {x:number,y:number,z:number}, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function ToolpathOverlay({ simulation, showRapids, showToolpath, showBounds, surfaceZ }: { simulation: Simulation, showRapids: boolean, showToolpath?: boolean, showBounds: boolean, surfaceZ: number }) {
  const { cutPositions, rapidPositions, boundsPositions } = useMemo(() => {
    const cutPositions: number[] = [];
    const rapidPositions: number[] = [];
    
    simulation.segments.forEach(seg => {
      const isTravel = seg.machineCoordinates || seg.kind === "rapid";
      if (isTravel && !showRapids) return;
      
      const pts = seg.points;
      for (let i = 1; i < pts.length; i++) {
        const p1 = pts[i - 1];
        const p2 = pts[i];
        if (isTravel) {
          rapidPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        } else {
          // Keep the cutter at its real programmed Z, but project the visual
          // guide onto the stock face so deep cuts are not hidden by the mesh.
          cutPositions.push(p1.x, p1.y, surfaceZ, p2.x, p2.y, surfaceZ);
        }
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

    return { cutPositions, rapidPositions, boundsPositions };
  }, [simulation, showRapids, showBounds, surfaceZ]);

  return (
    <group>
      {showToolpath !== false && cutPositions.length > 0 && (
        <>
          <Line
            points={cutPositions}
            color="#03171c"
            lineWidth={1.8}
            opacity={0.58}
            transparent
            depthTest={false}
            depthWrite={false}
            renderOrder={30}
            toneMapped={false}
            segments
          />
          <Line
            points={cutPositions}
            color="#22e6ff"
            lineWidth={0.75}
            opacity={0.96}
            transparent
            depthTest={false}
            depthWrite={false}
            renderOrder={31}
            toneMapped={false}
            segments
          />
        </>
      )}
      {showToolpath !== false && showRapids && rapidPositions.length > 0 && (
        <Line 
          points={rapidPositions} 
          color="#ff3366" 
          lineWidth={1.1}
          opacity={0.5}
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
          color="#81a7bd" 
          lineWidth={1} 
          opacity={0.4} 
          transparent 
          segments 
        />
      )}
    </group>
  );
}

function SpinningCutter({
  diameter,
  fluteLength,
  toolType,
  spinning,
}: {
  diameter: number;
  fluteLength: number;
  toolType: ToolProfile["type"];
  spinning: boolean;
}) {
  const cutterRef = useRef<THREE.Group>(null);
  const radius = diameter / 2;
  const tipLength = Math.min(12, Math.max(4, diameter * 1.4));

  useFrame((_, delta) => {
    if (spinning && cutterRef.current) {
      cutterRef.current.rotation.y -= Math.min(0.75, delta * 24);
    }
  });

  const cutterMaterial = (
    <meshStandardMaterial
      color={spinning ? "#d8e5e8" : "#9aa6aa"}
      metalness={0.92}
      roughness={0.16}
    />
  );

  return (
    <group rotation={[Math.PI / 2, 0, 0]} position={[0, 0, fluteLength / 2]}>
      <group ref={cutterRef}>
        {toolType === "vbit" ? (
          <>
            <mesh position={[0, tipLength / 2, 0]} castShadow>
              <cylinderGeometry
                args={[radius, radius, Math.max(2, fluteLength - tipLength), 24]}
              />
              {cutterMaterial}
            </mesh>
            <mesh
              position={[0, -fluteLength / 2 + tipLength / 2, 0]}
              castShadow
            >
              <coneGeometry args={[radius, tipLength, 24]} />
              {cutterMaterial}
            </mesh>
          </>
        ) : toolType === "ball" ? (
          <>
            <mesh position={[0, diameter / 2, 0]} castShadow>
              <cylinderGeometry
                args={[radius, radius, Math.max(2, fluteLength - diameter), 24]}
              />
              {cutterMaterial}
            </mesh>
            <mesh position={[0, -fluteLength / 2 + radius, 0]} castShadow>
              <sphereGeometry args={[radius, 24, 16]} />
              {cutterMaterial}
            </mesh>
          </>
        ) : (
          <mesh castShadow>
            <cylinderGeometry args={[radius, radius, fluteLength, 24]} />
            {cutterMaterial}
          </mesh>
        )}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius * 0.72, Math.max(0.12, radius * 0.1), 8, 32]} />
          <meshStandardMaterial color="#48565b" metalness={0.8} roughness={0.25} />
        </mesh>
      </group>
      <mesh position={[0, fluteLength / 2 + 9, 0]} castShadow>
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
  topZ,
  quality,
}: {
  simulation: Simulation;
  cursor: number;
  segmentProgress: number;
  stock: StockSettings;
  showTool: boolean;
  topZ: number;
  quality: "low" | "medium" | "high";
}) {
  if (!showTool) return null;
  const activeSegment = simulation.segments[Math.min(cursor, simulation.segments.length - 1)];
  const pos = activeSegment ? pointOnSegment(activeSegment, segmentProgress) : { x: stock.originX, y: stock.originY, z: stock.safeZ };
  
  const fluteLength = Math.max(38, stock.thickness * 2.2);
  const activeTool = resolveSegmentTool(stock, activeSegment?.tool);
  const toolDiameter = activeTool?.diameter || stock.toolDiameter || 6;
  const toolType = activeTool?.type || "flat";
  const isRemovingMaterial = Boolean(
    activeSegment &&
      !activeSegment.machineCoordinates &&
      activeSegment.kind !== "rapid" &&
      activeSegment.kind !== "dwell" &&
      pos.z < topZ - 0.000001,
  );
  
  return (
    <group>
      <group position={[pos.x, pos.y, pos.z]}>
        <SpinningCutter
          diameter={toolDiameter}
          fluteLength={fluteLength}
          toolType={toolType}
          spinning={Boolean(activeSegment && activeSegment.spindle > 0)}
        />
      </group>
      <MachiningEffects
        position={[pos.x, pos.y, pos.z]}
        active={isRemovingMaterial}
        toolDiameter={toolDiameter}
        quality={quality}
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

const STOCK_COLOR = "#cd9a5b"; // Realistic plywood surface color
const SURFACE_EPSILON = 0.000001;

function paintStockSurface(
  ctx: CanvasRenderingContext2D,
  resolution: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = STOCK_COLOR;
  ctx.fillRect(0, 0, resolution, resolution);

  const grainSpacing = Math.max(4, Math.round(resolution / 150));
  for (let y = grainSpacing; y < resolution; y += grainSpacing) {
    const phase = y / grainSpacing;
    ctx.strokeStyle =
      phase % 3 === 0 ? "rgba(79, 43, 20, 0.14)" : "rgba(255, 226, 174, 0.08)";
    ctx.lineWidth = phase % 5 === 0 ? 1.4 : 0.75;
    ctx.beginPath();
    for (let x = 0; x <= resolution; x += 24) {
      const wave = Math.sin(x * 0.018 + phase * 0.71) * grainSpacing * 0.42;
      if (x === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
}

export function StockMesh({ simulation, stock, cursor, segmentProgress = 1, quality = "medium" }: StockMeshProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const surfaceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const surfaceTextureRef = useRef<THREE.CanvasTexture | null>(null);
  
  const lastCursorRef = useRef<number>(0);
  const lastProgressRef = useRef<number>(0);
  const renderSourceRef = useRef<{
    canvas: HTMLCanvasElement;
    simulation: Simulation;
    key: string;
  } | null>(null);

  const MAP_RES = quality === "high" ? 2048 : quality === "medium" ? 1024 : 512;
  const geomRes = quality === "high" ? 512 : quality === "medium" ? 256 : 128;

  const { canvas, texture, surfaceCanvas, surfaceTexture } = useMemo(() => {
    const el = document.createElement("canvas");
    el.width = MAP_RES;
    el.height = MAP_RES;
    const ctx = el.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, MAP_RES, MAP_RES);
    }
    const tex = new THREE.CanvasTexture(el);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    const surfaceEl = document.createElement("canvas");
    surfaceEl.width = MAP_RES;
    surfaceEl.height = MAP_RES;
    const surfaceCtx = surfaceEl.getContext("2d");
    if (surfaceCtx) paintStockSurface(surfaceCtx, MAP_RES);
    const surfaceTex = new THREE.CanvasTexture(surfaceEl);
    surfaceTex.colorSpace = THREE.SRGBColorSpace;
    surfaceTex.minFilter = THREE.LinearFilter;
    surfaceTex.magFilter = THREE.LinearFilter;
    surfaceTex.generateMipmaps = false;
    return {
      canvas: el,
      texture: tex,
      surfaceCanvas: surfaceEl,
      surfaceTexture: surfaceTex,
    };
  }, [MAP_RES]);

  useEffect(() => {
    canvasRef.current = canvas;
    textureRef.current = texture;
    surfaceCanvasRef.current = surfaceCanvas;
    surfaceTextureRef.current = surfaceTexture;
    return () => {
      texture.dispose();
      surfaceTexture.dispose();
    };
  }, [canvas, surfaceCanvas, surfaceTexture, texture]);

  useEffect(() => {
    const el = canvasRef.current;
    const tex = textureRef.current;
    const surfaceEl = surfaceCanvasRef.current;
    const surfaceTex = surfaceTextureRef.current;
    if (!el || !tex || !surfaceEl || !surfaceTex) return;
    const ctx = el.getContext("2d", { willReadFrequently: true });
    const surfaceCtx = surfaceEl.getContext("2d");
    if (!ctx || !surfaceCtx) return;

    const zBounds = resolveStockZBounds(simulation, stock);
    const renderKey = stockRemovalRenderKey(stock, MAP_RES, zBounds);
    const previousSource = renderSourceRef.current;
    const sourceChanged =
      previousSource?.canvas !== el ||
      previousSource.simulation !== simulation ||
      previousSource.key !== renderKey;

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
      ctx.fillRect(0, 0, MAP_RES, MAP_RES);
      paintStockSurface(surfaceCtx, MAP_RES);
      startCursor = 0;
      startProgress = 0;
      hasChanges = true;
    }

    const scaleX = MAP_RES / Math.max(1e-6, stock.width);
    const scaleY = MAP_RES / Math.max(1e-6, stock.height);

    const drawLine = (
      from: { x: number; y: number; z: number },
      to: { x: number; y: number; z: number },
      tool: ToolProfile,
    ) => {
      // Break ramps into shallow depth bands. A single average color would
      // incorrectly make the whole ramp one depth.
      const depthSteps = Math.min(
        96,
        Math.max(1, Math.ceil(Math.abs(to.z - from.z) / 0.25)),
      );
      for (let step = 0; step < depthSteps; step += 1) {
        const sectionStart = lerpVec(from, to, step / depthSteps);
        const sectionEnd = lerpVec(from, to, (step + 1) / depthSteps);
        const averageZ = (sectionStart.z + sectionEnd.z) / 2;
        const sweepBands = buildCutterContactBands(
          tool,
          averageZ,
          zBounds,
        );
        const endpointBands = buildCutterContactBands(
          tool,
          sectionEnd.z,
          zBounds,
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
            MAP_RES + stock.originY * scaleY,
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
            MAP_RES + stock.originY * scaleY,
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
          segment.kind === "dwell"
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
    }

    lastCursorRef.current = cursor;
    lastProgressRef.current = segmentProgress;
    renderSourceRef.current = { canvas: el, simulation, key: renderKey };
  }, [simulation, cursor, segmentProgress, stock, MAP_RES]);

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[stock.width, stock.height, stock.thickness, 1, 1, 1]} />
        {[0, 1, 2, 3].map((idx) => (
          <meshStandardMaterial
            key={idx}
            attach={`material-${idx}`}
            color={STOCK_COLOR}
            roughness={0.9}
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
        <planeGeometry args={[stock.width, stock.height, geomRes, geomRes]} />
        <meshStandardMaterial
          color="#ffffff"
          map={surfaceTexture}
          roughness={0.76}
          metalness={0.015}
          displacementMap={texture}
          displacementScale={stock.thickness}
          displacementBias={-stock.thickness}
          bumpMap={texture}
          bumpScale={Math.max(0.35, stock.thickness * 0.42)}
          alphaMap={texture}
          alphaTest={0.012}
        />
      </mesh>
    </group>
  );
}

function PartLabelsOverlay({
  simulation,
  topZ,
}: {
  simulation: Simulation;
  topZ: number;
}) {
  if (!simulation.parts || simulation.parts.length === 0) return null;
  return (
    <>
      {simulation.parts.map((part) => {
        const centerX = part.minX + part.width / 2;
        const centerY = part.minY + part.height / 2;
        return (
          <group key={part.id} position={[centerX, centerY, topZ + 0.1]}>
            <Text position={[0, 12, 0]} fontSize={28} color="#111111" anchorX="center" anchorY="middle" outlineWidth={0.5} outlineColor="rgba(255,255,255,0.5)">
              {part.id}
            </Text>
            <Text position={[0, -12, 0]} fontSize={18} color="#222222" anchorX="center" anchorY="middle" outlineWidth={0.4} outlineColor="rgba(255,255,255,0.5)">
              {`${Math.round(part.width)} × ${Math.round(part.height)}`}
            </Text>
          </group>
        );
      })}
    </>
  );
}

export function SolidSimulator(props: SolidSimulatorProps) {
  const measurementCopy = getMeasurementCopy(props.lang);
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
        <Canvas aria-label={measurementCopy.simulatorCanvas} role="img" shadows camera={{ position: [0, Math.max(props.stock.width, props.stock.height) * 1.2, Math.max(props.stock.width, props.stock.height) * 1.0], fov: 45, near: 1, far: Math.max(props.stock.width, props.stock.height) * 10 }}>
        <color attach="background" args={["#0c1217"]} />
        <ambientLight intensity={0.45} />
        <directionalLight 
          position={[props.stock.width / 2, props.stock.width * 0.8, props.stock.height * 0.8]} 
          intensity={1.5} 
          castShadow 
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.0005}
        >
          <orthographicCamera attach="shadow-camera" args={[-props.stock.width, props.stock.width, props.stock.height, -props.stock.height, 0.1, props.stock.width * 3]} />
        </directionalLight>
        
        {/* Machine Bed Grid */}
        {props.showGrid !== false && (
          <gridHelper 
            args={[
              Math.max(props.stock.width, props.stock.height) * 3, 
              Math.round(Math.max(props.stock.width, props.stock.height) * 3 / 100), 
              "#444444", 
              "#222222"
            ]} 
            position={[0, 0, 0]} 
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
            <PartLabelsOverlay simulation={props.simulation} topZ={topZ} />
            <ToolpathOverlay 
              simulation={props.simulation} 
              showRapids={props.showRapids ?? true} 
              showToolpath={props.showToolpath ?? true}
              showBounds={props.showBounds ?? true} 
              surfaceZ={toolpathSurfaceZ}
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
              topZ={topZ}
              quality={props.quality ?? "medium"}
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
        <ContactShadows resolution={1024} scale={Math.max(props.stock.width, props.stock.height) * 1.5} position={[0, -0.1, 0]} blur={2.5} opacity={0.6} />
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
