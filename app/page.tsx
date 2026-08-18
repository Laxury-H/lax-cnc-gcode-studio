"use client";

import {
  ChangeEvent,
  Component,
  lazy,
  PointerEvent as ReactPointerEvent,
  type ReactNode,
  Suspense,
  WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  DEFAULT_STOCK,
  exportCAM,
  generateSmartResume,
  orientStockForProgram,
  resizeStockPreservingPinnedOrigin,
} from "@/core/simulation/studio-program";
import {
  prepareProgramOffThread,
  useProgramAnalysis,
} from "@/core/ui/use-program-analysis";
import {
  renderPerformanceProfile,
  shouldRenderFrame,
} from "@/core/simulation/render-performance";
import {
  MAX_PROGRAM_BYTES,
  MAX_PROGRAM_LINES,
  programLimitViolation,
} from "@/core/simulation/program-limits";
import { SAMPLE_GCODE } from "@/core/simulation/sample-program";
import { resolveVBitGeometry } from "@/core/simulation/stock-removal-coordinates";
import type {
  Axis,
  CoordinateSystem,
} from "@/core/gcode/types";
import type {
  PostProcessorType,
  Segment,
  Simulation,
  StockSettings,
  StudioMachineProfile as MachineProfile,
  Vec3,
} from "@/core/simulation/types";
import {
  Lang,
  translateDiagnostic,
  translations,
  type TranslationDict,
} from "./i18n";
import { cncAudio } from "@/core/simulation/audio";
import { resolveStockZBounds } from "@/core/measurement/measurement-utils";
import { UserGuideModal } from "@/core/components/UserGuideModal";
import { FileCompareModal } from "@/core/components/FileCompareModal";
import { MiniCamModal } from "@/core/components/MiniCamModal";
import {
  WORKSPACE_PREFERENCES_KEY,
  cloneStockSettings,
  cloneWorkspaceWorkOffsets,
  createZeroWorkspaceWorkOffsets,
  parseWorkspacePreferences,
  serializeWorkspacePreferences,
  type SimulationQuality,
  type WorkspacePreferences,
} from "@/core/ui/workspace-preferences";
import {
  createWorkOffsetInputDraft,
  parseWorkOffsetInput,
  parseWorkOffsetInputDraft,
} from "@/core/ui/work-offset-input";

import { Icon } from "@/core/components/ui/Icon";
import { MetricCard } from "@/core/components/ui/MetricCard";
import { ToolbarButton } from "@/core/components/ui/ToolbarButton";
import { ResponsiveDialog } from "@/core/components/ui/ResponsiveDialog";
import { 
  ViewMode, 
  OrbitCamera, 
  getViewMeta, 
  pointOnSegment, 
  pointOnSegmentInTelemetryCoordinates,
  pointInProgramUnits,
  partialPoints, 
  formatTime, 
  formatLength, 
  motionLabel 
} from "@/core/utils/gcode-utils";

let solidSimulatorModulePromise: Promise<
  typeof import("@/core/components/SolidSimulator")
> | null = null;
let machineSimulatorModulePromise: Promise<
  typeof import("@/core/components/MachineSimulator")
> | null = null;

function loadSolidSimulatorModule() {
  solidSimulatorModulePromise ??= import(
    "@/core/components/SolidSimulator"
  ).catch((error) => {
    solidSimulatorModulePromise = null;
    throw error;
  });
  return solidSimulatorModulePromise;
}

function loadMachineSimulatorModule() {
  machineSimulatorModulePromise ??= import(
    "@/core/components/MachineSimulator"
  ).catch((error) => {
    machineSimulatorModulePromise = null;
    throw error;
  });
  return machineSimulatorModulePromise;
}

const SolidSimulator = lazy(async () => {
  const simulatorModule = await loadSolidSimulatorModule();
  return { default: simulatorModule.SolidSimulator };
});

const MachineSimulator = lazy(async () => {
  const simulatorModule = await loadMachineSimulatorModule();
  return { default: simulatorModule.MachineSimulator };
});

class SimulatorErrorBoundary extends Component<
  {
    children: ReactNode;
    message: string;
    retryLabel: string;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Không thể khởi tạo mô phỏng 3D", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="simulator-error" role="alert">
        <span>{this.props.message}</span>
        <button type="button" onClick={() => window.location.reload()}>
          {this.props.retryLabel}
        </button>
      </div>
    );
  }
}

const DEFAULT_ORBIT: OrbitCamera = {
  yaw: Math.PI / 4,
  pitch: Math.PI / 5.2,
};

const PLANE_GCODE = { XY: "G17", XZ: "G18", YZ: "G19" } as const;
const MACHINE_VIEW_STORAGE_KEY = "lax_cnc_experimental_machine_view";
const CODE_ROW_HEIGHT = 28;
const CODE_OVERSCAN_ROWS = 18;
const WORK_COORDINATE_SYSTEMS = [
  "G54",
  "G55",
  "G56",
  "G57",
  "G58",
  "G59",
] as const satisfies readonly CoordinateSystem[];
const SURFACE_FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type MobileWorkspacePanel = "simulation" | "code";

function getSurfaceFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(SURFACE_FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.getAttribute("aria-hidden") !== "true" &&
      !element.hasAttribute("hidden") &&
      element.getClientRects().length > 0,
  );
}

function createDefaultWorkspacePreferences(): WorkspacePreferences {
  return {
    version: 1,
    profile: "router-custom",
    stock: cloneStockSettings(DEFAULT_STOCK),
    speed: 2,
    quality: "medium",
    showRapids: true,
    machineSound: false,
    finishSound: true,
    workOffsets: createZeroWorkspaceWorkOffsets(),
  };
}

function isInvalidStockField(
  key: keyof StockSettings,
  value: number,
) {
  if (!Number.isFinite(value)) return true;
  if (
    key === "width" ||
    key === "height" ||
    key === "thickness" ||
    key === "toolDiameter" ||
    key === "rapidFeed"
  ) {
    return value <= 0;
  }
  return key === "clearance" && value < 0;
}


function syntaxLine(line: string) {
  const chunks = line.split(
    /(\([^)]*\)|;.*$|[GM]\d+(?:\.\d+)?|[XYZIJKRQUVWABC][-+]?(?:\d+(?:\.\d*)?|\.\d+)|[FST][-+]?(?:\d+(?:\.\d*)?|\.\d+))/gi,
  );
  return chunks.map((chunk, index) => {
    let className = "";
    if (/^\(|^;/.test(chunk)) className = "syntax-comment";
    else if (/^G/i.test(chunk)) className = "syntax-g";
    else if (/^M/i.test(chunk)) className = "syntax-m";
    else if (/^[XYZIJKRQUVWABC]/i.test(chunk)) className = "syntax-axis";
    else if (/^[FST]/i.test(chunk)) className = "syntax-value";
    return (
      <span className={className} key={`${index}-${chunk}`}>
        {chunk}
      </span>
    );
  });
}

function ToolpathCanvas({
  simulation,
  stock,
  cursor,
  segmentProgress,
  playing,
  view,
  zoom,
  pan,
  orbit,
  showRapids,
  quality = "medium",
  lang,
  t,
  onZoom,
  onPan,
  onOrbit,
  onResetView,
  resetTrigger,
  isMeasuring,
  measurementSession,
  onMeasurementClose,
}: {
  simulation: Simulation;
  stock: StockSettings;
  cursor: number;
  segmentProgress: number;
  playing: boolean;
  view: ViewMode;
  zoom: number;
  pan: { x: number; y: number };
  orbit: OrbitCamera;
  showRapids: boolean;
  quality?: SimulationQuality;
  lang: Lang;
  t: TranslationDict;
  onZoom: (zoom: number) => void;
  onPan: (pan: { x: number; y: number }) => void;
  onOrbit: (orbit: OrbitCamera) => void;
  onResetView: () => void;
  resetTrigger?: number;
  isMeasuring: boolean;
  measurementSession: number;
  onMeasurementClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const lastCanvasFrameRef = useRef(Number.NEGATIVE_INFINITY);
  const dragRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    yaw: number;
    pitch: number;
    mode: "pan" | "orbit";
  } | null>(null);
  const activePointersRef = useRef(
    new Map<number, { x: number; y: number }>(),
  );
  const pinchRef = useRef<{
    distance: number;
    zoom: number;
    centerX: number;
    centerY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const [size, setSize] = useState({ width: 900, height: 600 });
  const [showToolpath, setShowToolpath] = useState(true);
  const [showBounds, setShowBounds] = useState(true);
  const [showTool, setShowTool] = useState(true);
  const [showStock, setShowStock] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const simulatorStock = useMemo(
    () => ({ ...stock, toolDiameter: stock.toolDiameter || 6 }),
    [stock],
  );

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        setSize({
          width: Math.max(1, Math.round(rect.width)),
          height: Math.max(1, Math.round(rect.height)),
        });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maxDpr = quality === "low" ? 1 : quality === "medium" ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const pixelWidth = Math.round(size.width * dpr);
    const pixelHeight = Math.round(size.height * dpr);
    const canvasResized =
      canvas.width !== pixelWidth || canvas.height !== pixelHeight;
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    if (canvas.style.width !== `${size.width}px`) {
      canvas.style.width = `${size.width}px`;
    }
    if (canvas.style.height !== `${size.height}px`) {
      canvas.style.height = `${size.height}px`;
    }
    const frameTimestamp = performance.now();
    const frameInterval = renderPerformanceProfile(quality).canvasFrameIntervalMs;
    if (
      playing &&
      !canvasResized &&
      !shouldRenderFrame(
        lastCanvasFrameRef.current,
        frameTimestamp,
        frameInterval,
      )
    ) {
      return;
    }
    lastCanvasFrameRef.current = frameTimestamp;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = size.width;
    const height = size.height;
    ctx.clearRect(0, 0, width, height);

    const originX = stock.originX;
    const originY = stock.originY;
    const { topZ: originZ, bottomZ: stockBottomZ } = resolveStockZBounds(
      simulation,
      stock,
    );
    let project: (point: Vec3) => { x: number; y: number };
    let boardCorners: Array<{ x: number; y: number }> = [];
    let stockBottom: Vec3[] = [];
    let scale: number;
    let horizontalScale: number;
    let verticalScale: number;
    let axisLabels: [string, string] = ["X", "Y"];
    let orbitAxisVector:
      | ((vector: Vec3) => { x: number; y: number })
      | null = null;
    let stockSideFaces: Array<{
      points: Vec3[];
      fill: string;
      depth: number;
    }> = [];

    if (view === "xoy") {
      const uMin = Math.min(originX, simulation.bounds.minX);
      const uMax = Math.max(originX + stock.width, simulation.bounds.maxX);
      const vMin = Math.min(originY, simulation.bounds.minY);
      const vMax = Math.max(originY + stock.height, simulation.bounds.maxY);
      const uSpan = Math.max(1, uMax - uMin);
      const vSpan = Math.max(1, vMax - vMin);
      const fitWidth = Math.max(160, width - 110);
      const fitHeight = Math.max(160, height - 110);

      const uniformScale =
        Math.min(fitWidth / uSpan, fitHeight / vSpan) * zoom;
      horizontalScale = uniformScale;
      verticalScale = uniformScale;
      scale = Math.min(horizontalScale, verticalScale);
      const left = (width - uSpan * horizontalScale) / 2 + pan.x;
      const top = (height - vSpan * verticalScale) / 2 + pan.y + 6;
      project = (point) => ({
        x: left + (point.x - uMin) * horizontalScale,
        y: top + (vMax - point.y) * verticalScale,
        depth: point.z,
      });

      axisLabels = ["X", "Y"];
      boardCorners = [
        project({ x: originX, y: originY + stock.height, z: originZ }),
        project({
          x: originX + stock.width,
          y: originY + stock.height,
          z: originZ,
        }),
        project({
          x: originX + stock.width,
          y: originY,
          z: originZ,
        }),
        project({ x: originX, y: originY, z: originZ }),
      ];
    } else {
      axisLabels = ["X", "Y"];
      const xMin = Math.min(originX, simulation.bounds.minX);
      const xMax = Math.max(originX + stock.width, simulation.bounds.maxX);
      const yMin = Math.min(originY, simulation.bounds.minY);
      const yMax = Math.max(originY + stock.height, simulation.bounds.maxY);
      const zMin = Math.min(stockBottomZ, simulation.bounds.minZ);
      const zMax = Math.max(originZ, stock.safeZ, simulation.bounds.maxZ);
      const center = {
        x: (xMin + xMax) / 2,
        y: (yMin + yMax) / 2,
        z: (zMin + zMax) / 2,
      };
      const zVisualScale = Math.max(
        1,
        Math.min(
          6,
          (Math.max(stock.width, stock.height) /
            Math.max(1, stock.thickness)) *
            0.025,
        ),
      );
      const cosYaw = Math.cos(orbit.yaw);
      const sinYaw = Math.sin(orbit.yaw);
      const cosPitch = Math.cos(orbit.pitch);
      const sinPitch = Math.sin(orbit.pitch);
      const rotateVector = (vector: Vec3) => {
        const x = vector.x;
        const y = vector.y;
        const z = vector.z * zVisualScale;
        const rotatedX = cosYaw * x - sinYaw * y;
        const rotatedY = sinYaw * x + cosYaw * y;
        return {
          u: rotatedX,
          v: -rotatedY * sinPitch - z * cosPitch,
          depth: rotatedY * cosPitch - z * sinPitch,
        };
      };
      const rotatePoint = (point: Vec3) =>
        rotateVector({
          x: point.x - center.x,
          y: point.y - center.y,
          z: point.z - center.z,
        });
      const fitWidth = Math.max(180, width - 150);
      const fitHeight = Math.max(180, height - 130);
      const radius = Math.hypot(
        xMax - center.x,
        yMax - center.y,
        (zMax - center.z) * zVisualScale
      );
      scale = (Math.min(fitWidth, fitHeight) / (radius * 2)) * zoom * 1.35;
      const centerU = 0;
      const centerV = 0;
      horizontalScale = scale;
      verticalScale = scale;
      const maxDim = Math.max(xMax - xMin, yMax - yMin, 1);
      const focalLength = maxDim * 1.5;
      project = (point) => {
        const rotated = rotatePoint(point);
        const zDepth = rotated.depth + focalLength;
        const pScale = focalLength / Math.max(1, zDepth);
        return {
          x: width / 2 + (rotated.u - centerU) * scale * pScale + pan.x,
          y: height / 2 + (rotated.v - centerV) * scale * pScale + pan.y,
        };
      };
      orbitAxisVector = (vector) => {
        const rotated = rotateVector(vector);
        return { x: rotated.u, y: rotated.v };
      };

      const stockTop: Vec3[] = [
        { x: originX, y: originY, z: originZ },
        { x: originX + stock.width, y: originY, z: originZ },
        {
          x: originX + stock.width,
          y: originY + stock.height,
          z: originZ,
        },
        { x: originX, y: originY + stock.height, z: originZ },
      ];
      stockBottom = stockTop.map((point) => ({
        ...point,
        z: stockBottomZ,
      }));
      boardCorners = stockTop.map(project);
      stockSideFaces = [
        {
          points: [stockTop[0], stockTop[1], stockBottom[1], stockBottom[0]],
          fill: "#8e6c43",
        },
        {
          points: [stockTop[1], stockTop[2], stockBottom[2], stockBottom[1]],
          fill: "#7a5a35",
        },
        {
          points: [stockTop[2], stockTop[3], stockBottom[3], stockBottom[2]],
          fill: "#674b2a",
        },
        {
          points: [stockTop[3], stockTop[0], stockBottom[0], stockBottom[3]],
          fill: "#98754b",
        },
      ]
        .map((face) => ({
          ...face,
          depth:
            face.points.reduce(
              (sum, point) => sum + rotatePoint(point).depth,
              0,
            ) / face.points.length,
        }))
        .sort((a, b) => a.depth - b.depth);
    }

    const drawPolygon = (
      points: Array<{ x: number; y: number }>,
      fill: string,
      stroke: string,
      lineWidth = 1,
    ) => {
      if (!points.length) return;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    };

    const shouldDrawStock = view !== "iso" || showStock;

    if (view === "iso" && shouldDrawStock) {
      stockSideFaces.forEach((face) => {
        drawPolygon(
          face.points.map(project),
          face.fill,
          "rgba(80,50,20,.45)",
          0.8,
        );
      });
      if (orbit.pitch >= 0) {
        drawPolygon(boardCorners, "#b9905d", "#d1a56b", 1.25);
      } else {
        drawPolygon(stockBottom.map(project), "#9e774a", "rgba(80,50,20,.45)", 1.25);
      }
    } else if (shouldDrawStock) {
      drawPolygon(boardCorners, "#b9905d", "#d1a56b", 1.2);
    }

    if (shouldDrawStock) {
      const isBottomView = view === "iso" && orbit.pitch < 0;
      const visibleCorners = isBottomView ? stockBottom.map(project) : boardCorners;
      const faceZ = isBottomView ? stockBottomZ : originZ;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(visibleCorners[0].x, visibleCorners[0].y);
      visibleCorners.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.clip();

      const grainLines = view === "iso" ? 18 : 32;
      for (let index = 0; index < grainLines; index += 1) {
        const ratio = (index + 0.5) / grainLines;
        const from = project({
          x: originX,
          y: originY + ratio * stock.height,
          z: faceZ,
        });
        const to = project({
          x: originX + stock.width,
          y: originY + ratio * stock.height,
          z: faceZ,
        });
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.bezierCurveTo(
          from.x + (to.x - from.x) * 0.28,
          from.y + Math.sin(index * 1.7) * 3,
          from.x + (to.x - from.x) * 0.68,
          to.y + Math.cos(index * 1.3) * 3,
          to.x,
          to.y,
        );
        ctx.strokeStyle = index % 3 === 0
          ? "rgba(66,38,18,.18)"
          : "rgba(255,232,191,.1)";
        ctx.lineWidth = index % 5 === 0 ? 1.2 : 0.65;
        ctx.stroke();
      }

      const gridStep = quality === "low"
        ? stock.width > 3000 ? 1000 : 500
        : stock.width > 3000 ? 500 : 200;
      ctx.setLineDash([]);
      const drawGridLine = (from: Vec3, to: Vec3, stronger = false) => {
        const projectedFrom = project(from);
        const projectedTo = project(to);
        ctx.beginPath();
        ctx.moveTo(projectedFrom.x, projectedFrom.y);
        ctx.lineTo(projectedTo.x, projectedTo.y);
        ctx.strokeStyle = stronger
          ? "rgba(13,30,38,.28)"
          : "rgba(13,30,38,.14)";
        ctx.lineWidth = stronger ? 1 : 0.7;
        ctx.stroke();
      };

      if (view === "xoy" || (view === "iso" && showGrid)) {
        for (
          let x = Math.ceil(originX / gridStep) * gridStep;
          x <= originX + stock.width;
          x += gridStep
        ) {
          drawGridLine(
            { x, y: originY, z: originZ },
            { x, y: originY + stock.height, z: originZ },
          );
        }
        for (
          let y = Math.ceil(originY / gridStep) * gridStep;
          y <= originY + stock.height;
          y += gridStep
        ) {
          drawGridLine(
            { x: originX, y, z: originZ },
            { x: originX + stock.width, y, z: originZ },
          );
        }
      }
      ctx.restore();
    }

    if (view === "xoy" || view === "iso") simulation.parts.forEach((part) => {
      const points = part.points.map(project);
      if (points.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.fillStyle = "rgba(255,245,220,.08)";
      ctx.fill();
      ctx.strokeStyle = "rgba(15,40,45,.42)";
      ctx.lineWidth = 1;
      ctx.stroke();
      const center = project({
        x: (part.minX + part.maxX) / 2,
        y: (part.minY + part.maxY) / 2,
        z: originZ,
      });
      ctx.font = `600 ${Math.max(10, Math.min(16, scale * 22))}px "Arial Narrow", Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(39,28,18,.72)";
      ctx.fillText(part.id, center.x, center.y - 6);
      ctx.font = `500 ${Math.max(8, Math.min(11, scale * 15))}px ui-monospace, monospace`;
      ctx.fillStyle = "rgba(39,28,18,.55)";
      ctx.fillText(
        `${Math.round(part.width)} × ${Math.round(part.height)}`,
        center.x,
        center.y + 10,
      );
    });

    const cutColor = view === "iso" ? "91,238,198" : "38,217,232";
    const rapidColor = "255,138,31";

    const drawBatchedSegments = (
      segs: Segment[],
      filterKind: "rapid" | "cut" | "drill",
      color: string,
      alpha: number,
      lineWidth: number,
      isRapid = false,
      glowWidth = 0,
    ) => {
      if (!segs.length) return;

      if (filterKind === "drill") {
        segs.forEach((segment) => {
          if (segment.kind !== "drill") return;
          const point = project(segment.end);
          ctx.beginPath();
          ctx.arc(point.x, point.y, Math.max(3.5, stock.toolDiameter * scale * 0.5), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(174,103,255,${alpha})`;
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(point.x - 4, point.y);
          ctx.lineTo(point.x + 4, point.y);
          ctx.moveTo(point.x, point.y - 4);
          ctx.lineTo(point.x, point.y + 4);
          ctx.stroke();
        });
        return;
      }

      ctx.beginPath();
      let hasPoints = false;
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        const isTravel = seg.machineCoordinates || seg.kind === "rapid";
        if (filterKind === "rapid" && !isTravel) continue;
        if (filterKind === "cut" && (isTravel || seg.kind === "drill")) continue;
        if (seg.points.length < 2) continue;
        hasPoints = true;
        const p0 = project(seg.points[0]);
        ctx.moveTo(p0.x, p0.y);
        for (let j = 1; j < seg.points.length; j++) {
          const pj = project(seg.points[j]);
          ctx.lineTo(pj.x, pj.y);
        }
      }
      if (!hasPoints) return;

      if (glowWidth > 0 && filterKind === "cut") {
        const toolWidth = Math.max(1, stock.toolDiameter * scale);
        
        // 1. Cut the hole (Erase material)
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = `rgba(0,0,0,1)`;
        ctx.lineWidth = toolWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        
        // 2. Fill center with MDF core
        ctx.globalCompositeOperation = "destination-over";
        ctx.strokeStyle = `rgba(152, 117, 75, ${alpha})`; // MDF core
        ctx.lineWidth = Math.max(0.5, toolWidth - 1.5);
        ctx.stroke();
        
        // 3. Fill edges with shadow
        ctx.strokeStyle = `rgba(74, 44, 16, ${alpha})`; // Deep shadow
        ctx.lineWidth = toolWidth;
        ctx.stroke();
        
        // Reset to normal
        ctx.globalCompositeOperation = "source-over";

        // Draw a very faint toolpath tracking line in the center
        ctx.strokeStyle = `rgba(${color}, ${alpha * 0.3})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      } else if (glowWidth > 0) {
        ctx.strokeStyle = view === "iso"
          ? `rgba(8,15,18,${Math.min(0.72, alpha * 0.72)})`
          : `rgba(38,217,232,${Math.min(0.16, alpha * 0.16)})`;
        ctx.lineWidth = glowWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        
        ctx.strokeStyle = `rgba(${color},${alpha})`;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (isRapid) ctx.setLineDash([7, 5]);
        ctx.stroke();
        if (isRapid) ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = `rgba(${color},${alpha})`;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (isRapid) ctx.setLineDash([7, 5]);
        ctx.stroke();
        if (isRapid) ctx.setLineDash([]);
      }
    };

    const drawSingleSegmentDetail = (
      segment: Segment,
      points: Vec3[],
      alpha: number,
      active = false,
    ) => {
      if (points.length < 2 || segment.kind === "drill") return;
      const projected = points.map(project);
      const isTravel = segment.machineCoordinates || segment.kind === "rapid";
      if (isTravel && !showRapids) return;
      const color = isTravel ? rapidColor : cutColor;

      if (!isTravel && active) {
        ctx.beginPath();
        ctx.moveTo(projected[0].x, projected[0].y);
        projected.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.strokeStyle = view === "iso"
          ? `rgba(8,15,18,${Math.min(0.72, alpha * 0.72)})`
          : `rgba(38,217,232,${Math.min(0.16, alpha * 0.16)})`;
        ctx.lineWidth = view === "iso"
          ? Math.max(3.5, stock.toolDiameter * scale * 1.15)
          : Math.max(3, stock.toolDiameter * scale);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(projected[0].x, projected[0].y);
      projected.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.strokeStyle = `rgba(${color},${alpha})`;
      ctx.lineWidth = view === "iso" ? (active ? 1.5 : 0.85) : (active ? 1.65 : 1);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (isTravel) ctx.setLineDash([7, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (
        active &&
        projected.length >= 2 &&
        Math.hypot(
          projected[projected.length - 1].x - projected[0].x,
          projected[projected.length - 1].y - projected[0].y,
        ) > 20
      ) {
        const midIndex = Math.floor(projected.length / 2);
        const before = projected[Math.max(0, midIndex - 1)];
        const at = projected[midIndex];
        const angle = Math.atan2(at.y - before.y, at.x - before.x);
        ctx.save();
        ctx.translate(at.x, at.y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(-5, -4);
        ctx.lineTo(-5, 4);
        ctx.closePath();
        ctx.fillStyle = `rgba(${color},${alpha})`;
        ctx.fill();
        ctx.restore();
      }
    };

    const completedSegs = simulation.segments.slice(0, cursor);
    const futureSegs = simulation.segments.slice(cursor + 1);

    if (showRapids) {
      drawBatchedSegments(completedSegs, "rapid", rapidColor, 0.7, view === "iso" ? 1 : 1.15, true);
      drawBatchedSegments(futureSegs, "rapid", rapidColor, 0.2, view === "iso" ? 0.9 : 1, true);
    }
    drawBatchedSegments(completedSegs, "drill", "", 0.88, 1);
    drawBatchedSegments(futureSegs, "drill", "", 0.2, 1);

    const completedGlow = quality !== "low" ? Math.max(3, stock.toolDiameter * scale) : 0;
    drawBatchedSegments(completedSegs, "cut", cutColor, 0.95, view === "iso" ? 1.25 : 1.45, false, completedGlow);
    drawBatchedSegments(futureSegs, "cut", cutColor, 0.2, view === "iso" ? 0.9 : 1.1, false, 0);

    const currentSeg = simulation.segments[cursor];
    if (currentSeg) {
      drawSingleSegmentDetail(currentSeg, currentSeg.points, 0.22);
      drawSingleSegmentDetail(currentSeg, partialPoints(currentSeg, segmentProgress), 1, true);
    }

    if (view === "iso" && showBounds) {
      const x0 = simulation.bounds.minX;
      const x1 = simulation.bounds.maxX;
      const y0 = simulation.bounds.minY;
      const y1 = simulation.bounds.maxY;
      const z0 = Math.min(simulation.bounds.minZ, stockBottomZ);
      const z1 = Math.max(simulation.bounds.maxZ, originZ);
      const corners = [
        { x: x0, y: y0, z: z0 },
        { x: x1, y: y0, z: z0 },
        { x: x1, y: y1, z: z0 },
        { x: x0, y: y1, z: z0 },
        { x: x0, y: y0, z: z1 },
        { x: x1, y: y0, z: z1 },
        { x: x1, y: y1, z: z1 },
        { x: x0, y: y1, z: z1 },
      ].map(project);
      const edges = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [4, 5],
        [5, 6],
        [6, 7],
        [7, 4],
        [0, 4],
        [1, 5],
        [2, 6],
        [3, 7],
      ];
      ctx.save();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "rgba(129,167,189,.34)";
      ctx.lineWidth = 0.85;
      edges.forEach(([from, to]) => {
        ctx.beginPath();
        ctx.moveTo(corners[from].x, corners[from].y);
        ctx.lineTo(corners[to].x, corners[to].y);
        ctx.stroke();
      });
      ctx.restore();
    }

    const topLeft = boardCorners[0];
    const topRight = boardCorners[1];
    const bottomLeft = boardCorners[3];
    ctx.strokeStyle = "rgba(220,230,236,.72)";
    ctx.fillStyle = "rgba(225,233,238,.88)";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.font = '500 11px ui-monospace, "SFMono-Regular", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    if (view !== "iso") {
      const dimY = Math.min(topLeft.y, topRight.y) - 18;
      const horizontalDimension = stock.width;
      ctx.beginPath();
      ctx.moveTo(topLeft.x, dimY);
      ctx.lineTo(topRight.x, dimY);
      ctx.stroke();
      ctx.fillText(
        `${horizontalDimension.toFixed(0)} mm`,
        (topLeft.x + topRight.x) / 2,
        dimY - 4,
      );
      const verticalDimension = stock.height;
      const dimX = bottomLeft.x - 22;
      ctx.save();
      ctx.translate(dimX - 5, (topLeft.y + bottomLeft.y) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${verticalDimension.toFixed(0)} mm`, 0, 0);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(dimX, topLeft.y);
      ctx.lineTo(dimX, bottomLeft.y);
      ctx.stroke();
    }

    const activeSegment =
      simulation.segments[Math.min(cursor, simulation.segments.length - 1)];
    const toolPosition = activeSegment
      ? pointOnSegment(activeSegment, segmentProgress)
      : { x: stock.originX, y: stock.originY, z: stock.safeZ };
    const toolPoint = project(toolPosition);
    if (view === "iso" && showTool) {
      const fluteLength = Math.max(38, stock.thickness * 2.2);
      const holderLength = Math.max(28, stock.thickness * 1.6);
      const shankTop = project({
        ...toolPosition,
        z: toolPosition.z + fluteLength,
      });
      const holderTop = project({
        ...toolPosition,
        z: toolPosition.z + fluteLength + holderLength,
      });
      ctx.save();
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(shankTop.x, shankTop.y);
      ctx.lineTo(holderTop.x, holderTop.y);
      ctx.strokeStyle = "#aeb8be";
      ctx.lineWidth = 14;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toolPoint.x, toolPoint.y);
      ctx.lineTo(shankTop.x, shankTop.y);
      ctx.strokeStyle = "#e8b84f";
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(shankTop.x, shankTop.y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = "#d6dde0";
      ctx.fill();
      ctx.strokeStyle = "#637078";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(toolPoint.x, toolPoint.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#f6d06d";
      ctx.fill();
      ctx.strokeStyle = "#172027";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.font = '700 9px ui-monospace, "SFMono-Regular", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(227,235,239,.86)";
      ctx.fillText(
        activeSegment?.tool && activeSegment.tool !== "—"
          ? activeSegment.tool
          : "TOOL",
        holderTop.x + 11,
        holderTop.y,
      );
      ctx.restore();
    } else if (view !== "iso") {
      ctx.beginPath();
      ctx.arc(toolPoint.x, toolPoint.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(12,18,23,.88)";
      ctx.fill();
      ctx.strokeStyle = "#26d9e8";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toolPoint.x - 15, toolPoint.y);
      ctx.lineTo(toolPoint.x + 15, toolPoint.y);
      ctx.moveTo(toolPoint.x, toolPoint.y - 15);
      ctx.lineTo(toolPoint.x, toolPoint.y + 15);
      ctx.strokeStyle = "rgba(38,217,232,.86)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const axisOrigin = { x: 34, y: height - 30 };
    const axisColors: Record<string, string> = {
      X: "#ff5f5f",
      Y: "#72df61",
      Z: "#5aa9ff",
    };
    ctx.font = "600 11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 2;
    if (view === "iso" && orbitAxisVector) {
      (
        [
          ["X", { x: 1, y: 0, z: 0 }],
          ["Y", { x: 0, y: 1, z: 0 }],
          ["Z", { x: 0, y: 0, z: 1 }],
        ] as Array<[string, Vec3]>
      ).forEach(([label, vector]) => {
        const projectedVector = orbitAxisVector?.(vector) ?? { x: 0, y: 0 };
        const vectorLength = Math.max(
          0.001,
          Math.hypot(projectedVector.x, projectedVector.y),
        );
        const end = {
          x: axisOrigin.x + (projectedVector.x / vectorLength) * 33,
          y: axisOrigin.y + (projectedVector.y / vectorLength) * 33,
        };
        ctx.beginPath();
        ctx.moveTo(axisOrigin.x, axisOrigin.y);
        ctx.lineTo(end.x, end.y);
        ctx.strokeStyle = axisColors[label];
        ctx.stroke();
        ctx.fillStyle = axisColors[label];
        ctx.fillText(
          label,
          end.x + (projectedVector.x / vectorLength) * 8,
          end.y + (projectedVector.y / vectorLength) * 8,
        );
      });
      ctx.beginPath();
      ctx.arc(axisOrigin.x, axisOrigin.y, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = "#d7e0e5";
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(axisOrigin.x, axisOrigin.y);
      ctx.lineTo(axisOrigin.x + 32, axisOrigin.y);
      ctx.strokeStyle = axisColors[axisLabels[0]];
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(axisOrigin.x, axisOrigin.y);
      ctx.lineTo(axisOrigin.x, axisOrigin.y - 32);
      ctx.strokeStyle = axisColors[axisLabels[1]];
      ctx.stroke();
      ctx.fillStyle = axisColors[axisLabels[0]];
      ctx.fillText(axisLabels[0], axisOrigin.x + 38, axisOrigin.y);
      ctx.fillStyle = axisColors[axisLabels[1]];
      ctx.fillText(axisLabels[1], axisOrigin.x, axisOrigin.y - 39);
    }
  }, [
    simulation,
    stock,
    cursor,
    segmentProgress,
    view,
    zoom,
    pan,
    orbit,
    showRapids,
    showBounds,
    showTool,
    showStock,
    showGrid,
    size,
    quality,
    playing,
  ]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (activePointersRef.current.size >= 2) {
      const [first, second] = Array.from(activePointersRef.current.values());
      pinchRef.current = {
        distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
        zoom,
        centerX: (first.x + second.x) / 2,
        centerY: (first.y + second.y) / 2,
        panX: pan.x,
        panY: pan.y,
      };
      dragRef.current = null;
      return;
    }
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
      yaw: orbit.yaw,
      pitch: orbit.pitch,
      mode:
        view === "iso" &&
        event.button === 0 &&
        !event.shiftKey
          ? "orbit"
          : "pan",
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    }
    if (activePointersRef.current.size >= 2 && pinchRef.current) {
      const [first, second] = Array.from(activePointersRef.current.values());
      const distance = Math.max(
        1,
        Math.hypot(second.x - first.x, second.y - first.y),
      );
      const centerX = (first.x + second.x) / 2;
      const centerY = (first.y + second.y) / 2;
      onZoom(
        Math.max(
          0.15,
          Math.min(25, pinchRef.current.zoom * (distance / pinchRef.current.distance)),
        ),
      );
      onPan({
        x: pinchRef.current.panX + centerX - pinchRef.current.centerX,
        y: pinchRef.current.panY + centerY - pinchRef.current.centerY,
      });
      return;
    }
    if (!dragRef.current) return;
    if (dragRef.current.mode === "orbit") {
      onOrbit({
        yaw:
          dragRef.current.yaw +
          (event.clientX - dragRef.current.x) * 0.007,
        pitch: Math.max(
          -1.5,
          Math.min(
            1.5,
            dragRef.current.pitch +
              (event.clientY - dragRef.current.y) * 0.007,
          ),
        ),
      });
      return;
    }
    onPan({
      x: dragRef.current.panX + event.clientX - dragRef.current.x,
      y: dragRef.current.panY + event.clientY - dragRef.current.y,
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointersRef.current.delete(event.pointerId);
    if (activePointersRef.current.size < 2) pinchRef.current = null;
    dragRef.current = null;
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 0.87;
    onZoom(Math.max(0.15, Math.min(25, zoom * factor)));
  };

  const currentSegment =
    simulation.segments[Math.min(cursor, simulation.segments.length - 1)];
  const activeUnits = currentSegment?.units ?? simulation.finalState.units;
  const currentPositionMm = currentSegment
    ? pointOnSegmentInTelemetryCoordinates(currentSegment, segmentProgress)
    : { x: stock.originX, y: stock.originY, z: stock.safeZ };
  const currentPosition = pointInProgramUnits(currentPositionMm, activeUnits);
  const activeCoordinateSystem =
    currentSegment?.coordinateSystem ?? simulation.finalState.coordinateSystem;
  const activeCoordinateLabel = currentSegment?.machineCoordinates
    ? "MACHINE · G53"
    : activeCoordinateSystem;
  const completedMoves = simulation.segments.length
    ? Math.min(
        simulation.segments.length,
        Math.max(0, cursor + segmentProgress),
      )
    : 0;
  const progressRatio = simulation.segments.length
    ? completedMoves / simulation.segments.length
    : 0;

  return (
    <div
      className={`canvas-frame${view !== "xoy" ? " is-3d" : ""}${
        isMeasuring && view === "solid" ? " has-measurement-dock" : ""
      }`}
      ref={frameRef}
    >
      <div className="active-command-hud" aria-hidden="true">
        <span className="command-mode">
          <b>{motionLabel(currentSegment, t)}</b>
          <small>
            BLOCK {currentSegment?.lineNumber ?? 0} · MOVE{" "}
            {Math.min(cursor + 1, simulation.segments.length)}/
            {simulation.segments.length}
          </small>
        </span>
        <code>{currentSegment?.raw.trim() || "—"}</code>
      </div>
      <div className="plane-badge" aria-hidden="true">
        <strong>{getViewMeta(view, t).short}</strong>
        <span>{getViewMeta(view, t).title}</span>
        <small>{getViewMeta(view, t).description}</small>
      </div>
      <div
        className="canvas-telemetry"
        aria-label={`${activeCoordinateLabel}: tọa độ dao X ${currentPosition.x.toFixed(3)}, Y ${currentPosition.y.toFixed(3)}, Z ${currentPosition.z.toFixed(3)} ${activeUnits}`}
      >
        <span className={`telemetry-state${playing ? " is-running" : ""}`}>
          <i />
          {playing ? "RUN" : t.ready} · {activeCoordinateLabel}
        </span>
        {(["x", "y", "z"] as const).map((axis) => (
          <span className={`telemetry-axis is-${axis}`} key={axis}>
            <small>{axis.toUpperCase()}</small>
            <strong>{currentPosition[axis].toFixed(3)}</strong>
          </span>
        ))}
        <span className="telemetry-meta">
          <small>FEED</small>
          <strong>F{currentSegment?.feed.toFixed(0) ?? "0"}</strong>
        </span>
        <span className="telemetry-meta">
          <small>SPINDLE</small>
          <strong>S{currentSegment?.spindle.toFixed(0) ?? "0"}</strong>
        </span>
        <span className="telemetry-meta">
          <small>TIME</small>
          <strong>
            {formatTime(simulation.estimatedSeconds * progressRatio)}
          </strong>
        </span>
      </div>
      {(view === "iso" || view === "solid") && (
        <>
          <button
            type="button"
            className="orientation-widget"
            onClick={onResetView}
            aria-label={t.resetView}
            title={t.resetView}
          >
            <span className="cube-shell">
              <span
                className="cube-core"
                style={{
                  transform: `rotateX(-${(orbit.pitch * 180) / Math.PI}deg) rotateY(${(orbit.yaw * 180) / Math.PI}deg)`,
                }}
              >
                <i className="cube-face cube-front">Y−</i>
                <i className="cube-face cube-back">Y+</i>
                <i className="cube-face cube-right">X+</i>
                <i className="cube-face cube-left">X−</i>
                <i className="cube-face cube-top">Z+</i>
                <i className="cube-face cube-bottom">Z−</i>
              </span>
            </span>
            <small>ORBIT</small>
          </button>
          <div className="backplot-controls" aria-label="Tùy chọn 3D Backplot">
            <button
              type="button"
              className={showStock ? "is-active" : ""}
              aria-pressed={showStock}
              onClick={() => setShowStock((value) => !value)}
            >
              {t.stock}
            </button>
            <button
              type="button"
              className={showTool ? "is-active" : ""}
              aria-pressed={showTool}
              onClick={() => setShowTool((value) => !value)}
            >
              {t.tool}
            </button>
            <button
              type="button"
              className={showToolpath ? "is-active" : ""}
              aria-pressed={showToolpath}
              onClick={() => setShowToolpath((value) => !value)}
            >
              {t.toolpath}
            </button>
            <button
              type="button"
              className={showBounds ? "is-active" : ""}
              aria-pressed={showBounds}
              onClick={() => setShowBounds((value) => !value)}
            >
              {t.bounds}
            </button>
            <button
              type="button"
              className={showGrid ? "is-active" : ""}
              aria-pressed={showGrid}
              onClick={() => setShowGrid((value) => !value)}
            >
              {t.grid}
            </button>
            <button type="button" onClick={onResetView}>
              {t.reset}
            </button>
          </div>
          <div className="orbit-hint" aria-hidden="true">
            <span>{t.orbitHintLeft}</span>
            <span>{t.orbitHintRight}</span>
            <span>{t.orbitHintScroll}</span>
          </div>
        </>
      )}
      {view === "machine" ? (
        <SimulatorErrorBoundary
          key="machine"
          message={
            lang === "VN"
              ? "Không thể tải mô phỏng máy 3D."
              : "The 3D machine view could not load."
          }
          retryLabel={lang === "VN" ? "Tải lại" : "Reload"}
        >
          <Suspense fallback={<div className="simulator-loading" role="status">Đang tải mô phỏng máy 3D…</div>}>
            <MachineSimulator
              simulation={simulation}
              stock={simulatorStock}
              cursor={cursor}
              segmentProgress={segmentProgress}
              playing={playing}
              showTool={showTool}
              showStock={showStock}
              resetTrigger={resetTrigger}
              onOrbitChange={onOrbit}
              quality={quality}
            />
          </Suspense>
        </SimulatorErrorBoundary>
        ) : view === "solid" ? (
        <SimulatorErrorBoundary
          key="solid"
          message={
            lang === "VN"
              ? "Không thể tải mô phỏng phôi 3D."
              : "The 3D solid view could not load."
          }
          retryLabel={lang === "VN" ? "Tải lại" : "Reload"}
        >
          <Suspense fallback={<div className="simulator-loading" role="status">Đang tải mô phỏng phôi 3D…</div>}>
            <SolidSimulator
              lang={lang}
              simulation={simulation}
              stock={simulatorStock}
              cursor={cursor}
              segmentProgress={segmentProgress}
              playing={playing}
              showRapids={showRapids}
              showBounds={showBounds}
              showTool={showTool}
              showStock={showStock}
              showToolpath={showToolpath}
              showGrid={showGrid}
              resetTrigger={resetTrigger}
              onOrbitChange={onOrbit}
              quality={quality}
              isMeasuring={isMeasuring}
              measurementSession={measurementSession}
              onMeasurementClose={onMeasurementClose}
            />
          </Suspense>
        </SimulatorErrorBoundary>
      ) : (
        <canvas
          ref={canvasRef}
          aria-label={`Mô phỏng đường chạy dao CNC · ${getViewMeta(view, t).title}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={handlePointerUp}
          onWheel={handleWheel}
          onDoubleClick={onResetView}
          onContextMenu={(event) => event.preventDefault()}
        />
      )}
    </div>
  );
}



export default function Home() {
  const [code, setCode] = useState(SAMPLE_GCODE);
  const [draftCode, setDraftCode] = useState(SAMPLE_GCODE);
  const [fileName, setFileName] = useState("tu-bep-can-a01.nc");
  const [projectName, setProjectName] = useState("Tủ bếp căn A-01");
  const [stock, setStock] = useState(DEFAULT_STOCK);
  const [profile, setProfile] = useState<MachineProfile>("router-custom");
  const [workOffsets, setWorkOffsets] = useState(
    createZeroWorkspaceWorkOffsets,
  );
  const [lang, setLang] = useState<Lang>("VN");

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("lax_cnc_lang");
    } catch {
      // Private browsing/storage policies must not prevent the app from mounting.
    }
    if (saved !== "EN" && saved !== "VN") return;

    const frame = window.requestAnimationFrame(() => setLang(saved));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const toggleLanguage = useCallback((newLang: Lang) => {
    setLang(newLang);
    try {
      localStorage.setItem("lax_cnc_lang", newLang);
    } catch {
      // Language still changes for this session when storage is unavailable.
    }
  }, []);

  const t = translations[lang];
  const [view, setView] = useState<ViewMode>("xoy");
  const [machineViewEnabled, setMachineViewEnabled] = useState(false);
  const [mobilePanel, setMobilePanel] =
    useState<MobileWorkspacePanel>("simulation");
  const [cursor, setCursor] = useState(0);
  const [focusedCodeLine, setFocusedCodeLine] = useState(0);
  const [segmentProgress, setSegmentProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [quality, setQuality] = useState<SimulationQuality>("medium");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [orbit, setOrbit] = useState<OrbitCamera>({ ...DEFAULT_ORBIT });
  const [showRapids, setShowRapids] = useState(true);
  const [codeCollapsed, setCodeCollapsed] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurementSession, setMeasurementSession] = useState(0);
  const [simulatorExpanded, setSimulatorExpanded] = useState(false);
  const [drawer, setDrawer] = useState<
    "diagnostics" | "parts" | "offcuts" | "resume" | "export" | null
  >(null);
  const [resumeSegment, setResumeSegment] = useState(5);
  const [resumeSafeZ, setResumeSafeZ] = useState(50);
  const [exportType, setExportType] = useState<PostProcessorType>("ncstudio");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<WorkspacePreferences>(
    createDefaultWorkspacePreferences,
  );
  const [workOffsetInputDraft, setWorkOffsetInputDraft] = useState(() =>
    createWorkOffsetInputDraft(createZeroWorkspaceWorkOffsets()),
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [minicamOpen, setMinicamOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isPreparingProgram, setIsPreparingProgram] = useState(false);
  const [codeViewport, setCodeViewport] = useState({
    scrollTop: 0,
    height: 600,
  });
  const [toast, setToast] = useState<string | null>(null);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [machineSound, setMachineSound] = useState(false);
  const [finishSound, setFinishSound] = useState(true);
  const [soundMenuOpen, setSoundMenuOpen] = useState(false);
  const [soundMenuPosition, setSoundMenuPosition] = useState({ left: 8, top: 8 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const codeScrollRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const soundButtonRef = useRef<HTMLButtonElement>(null);
  const soundPopoverRef = useRef<HTMLDivElement>(null);
  const preferencesHydratedRef = useRef(false);
  const dragDepthRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const drawerWasOpenRef = useRef(false);
  const drawerReturnFocusRef = useRef<HTMLElement | null>(null);
  const applyCodeRequestRef = useRef(0);
  const prepareAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    if (connection?.saveData) return;

    const warmSimulatorChunks = () => {
      void loadSolidSimulatorModule().catch(() => undefined);
      if (machineViewEnabled) {
        void loadMachineSimulatorModule().catch(() => undefined);
      }
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: Window["requestIdleCallback"];
      cancelIdleCallback?: Window["cancelIdleCallback"];
    };
    if (typeof idleWindow.requestIdleCallback === "function") {
      const idleCallback = idleWindow.requestIdleCallback(warmSimulatorChunks, {
        timeout: 4_000,
      });
      return () => idleWindow.cancelIdleCallback?.(idleCallback);
    }

    const timeout = window.setTimeout(warmSimulatorChunks, 1_500);
    return () => window.clearTimeout(timeout);
  }, [machineViewEnabled]);

  useEffect(() => {
    let saved: WorkspacePreferences | null = null;
    try {
      saved = parseWorkspacePreferences(
        localStorage.getItem(WORKSPACE_PREFERENCES_KEY),
      );
    } catch {
      // Invalid or blocked storage falls back to safe workstation defaults.
    }
    const frame = window.requestAnimationFrame(() => {
      if (saved) {
        const restoredStock = cloneStockSettings(saved.stock);
        const orientedStock = orientStockForProgram(
          SAMPLE_GCODE,
          restoredStock,
          saved.profile,
          saved.workOffsets,
        ).stock;
        setStock(orientedStock);
        setProfile(saved.profile);
        setSpeed(saved.speed);
        setQuality(saved.quality);
        setShowRapids(saved.showRapids);
        setMachineSound(saved.machineSound);
        setFinishSound(saved.finishSound);
        setWorkOffsets(cloneWorkspaceWorkOffsets(saved.workOffsets));
      }
      preferencesHydratedRef.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!preferencesHydratedRef.current) return;
    const preferences: WorkspacePreferences = {
      version: 1,
      profile,
      stock: cloneStockSettings(stock),
      speed,
      quality,
      showRapids,
      machineSound,
      finishSound,
      workOffsets: cloneWorkspaceWorkOffsets(workOffsets),
    };
    try {
      localStorage.setItem(
        WORKSPACE_PREFERENCES_KEY,
        serializeWorkspacePreferences(preferences),
      );
    } catch {
      // The workstation remains usable when storage is unavailable or full.
    }
  }, [
    finishSound,
    machineSound,
    profile,
    quality,
    showRapids,
    speed,
    stock,
    workOffsets,
  ]);

  useEffect(() => {
    document.documentElement.lang = lang === "EN" ? "en" : "vi";
  }, [lang]);

  useEffect(() => {
    if (drawer && !drawerWasOpenRef.current) {
      drawerReturnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const frame = window.requestAnimationFrame(() =>
        document.getElementById(`drawer-tab-${drawer}`)?.focus(),
      );
      drawerWasOpenRef.current = true;
      return () => window.cancelAnimationFrame(frame);
    }
    if (!drawer && drawerWasOpenRef.current) {
      drawerWasOpenRef.current = false;
      if (
        settingsOpen ||
        editorOpen ||
        compareOpen ||
        minicamOpen ||
        isGuideOpen
      ) {
        return;
      }
      const frame = window.requestAnimationFrame(() =>
        drawerReturnFocusRef.current?.focus({ preventScroll: true }),
      );
      return () => window.cancelAnimationFrame(frame);
    }
  }, [compareOpen, drawer, editorOpen, isGuideOpen, minicamOpen, settingsOpen]);

  const drawerOpen = drawer !== null;
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const trapDrawerFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = getSurfaceFocusableElements(drawerRef.current);
      if (!focusable.length) {
        event.preventDefault();
        drawerRef.current.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === drawerRef.current)
      ) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", trapDrawerFocus, true);
    return () => {
      document.removeEventListener("keydown", trapDrawerFocus, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  const {
    simulation,
    isProcessing: isSimulationProcessing,
    error: simulationProcessingError,
    cancel: cancelSimulationProcessing,
    acceptPrepared: acceptPreparedSimulation,
  } = useProgramAnalysis({ source: code, stock, profile, workOffsets });
  const analysisBusy = isPreparingProgram || isSimulationProcessing;
  const cancelProgramAnalysis = useCallback(() => {
    applyCodeRequestRef.current += 1;
    prepareAbortRef.current?.abort();
    prepareAbortRef.current = null;
    setIsPreparingProgram(false);
    cancelSimulationProcessing();
  }, [cancelSimulationProcessing]);

  const errorCount = simulation.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;
  const warningCount = simulation.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  ).length;
  const activeSegment =
    simulation.segments[Math.min(cursor, Math.max(0, simulation.segments.length - 1))];
  const activeUnits = activeSegment?.units ?? simulation.finalState.units;
  const currentPositionMm = activeSegment
    ? pointOnSegmentInTelemetryCoordinates(activeSegment, segmentProgress)
    : { x: stock.originX, y: stock.originY, z: stock.safeZ };
  const currentPosition = pointInProgramUnits(currentPositionMm, activeUnits);
  const activeCoordinateSystem =
    activeSegment?.coordinateSystem ?? simulation.finalState.coordinateSystem;
  const activeCoordinateLabel = activeSegment?.machineCoordinates
    ? "MACHINE · G53"
    : activeCoordinateSystem;
  const activeModeLabel = activeSegment?.machineCoordinates
    ? `G53 MCS · ${activeCoordinateSystem} ACTIVE`
    : activeCoordinateSystem;
  const activeDistanceMode = activeSegment?.machineCoordinates
    ? "absolute"
    : activeSegment?.distanceMode ??
      (simulation.finalState.absolute ? "absolute" : "incremental");
  const activeDistanceCodeLabel = activeSegment?.machineCoordinates
    ? "ABS MACHINE"
    : activeDistanceMode === "absolute"
      ? "G90 ABS"
      : "G91 INC";
  const activeDistanceFooterLabel = activeSegment?.machineCoordinates
    ? "ABS · G53"
    : activeDistanceMode === "absolute"
      ? "ABS · G90"
      : "INC · G91";
  const activePlane = activeSegment?.plane ?? simulation.finalState.plane;
  const currentLine = activeSegment?.lineIndex ?? 0;
  const totalProgress = simulation.segments.length
    ? Math.max(
        0,
        Math.min(
          100,
          ((Math.min(cursor, simulation.segments.length) + segmentProgress) /
            simulation.segments.length) *
            100,
        ),
      )
    : 0;
  const visibleCodeRange = useMemo(() => {
    const firstVisible = Math.floor(codeViewport.scrollTop / CODE_ROW_HEIGHT);
    const visibleRows = Math.ceil(codeViewport.height / CODE_ROW_HEIGHT);
    const start = Math.max(0, firstVisible - CODE_OVERSCAN_ROWS);
    const end = Math.min(
      simulation.lines.length,
      firstVisible + visibleRows + CODE_OVERSCAN_ROWS,
    );
    return { start, end };
  }, [codeViewport.height, codeViewport.scrollTop, simulation.lines.length]);

  useEffect(() => {
    const container = codeScrollRef.current;
    if (!container) return;
    const updateViewport = () => {
      setCodeViewport({
        scrollTop: container.scrollTop,
        height: container.clientHeight,
      });
    };
    const observer = new ResizeObserver(updateViewport);
    container.addEventListener("scroll", updateViewport, { passive: true });
    observer.observe(container);
    updateViewport();
    return () => {
      container.removeEventListener("scroll", updateViewport);
      observer.disconnect();
    };
  }, []);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      prepareAbortRef.current?.abort();
    },
    [],
  );

  const copyText = useCallback(
    async (value: string, successMessage: string) => {
      try {
        if (!navigator.clipboard) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(value);
        notify(successMessage);
      } catch {
        notify(t.copyErrorMsg);
      }
    },
    [notify, t.copyErrorMsg],
  );

  const ensureAudio = useCallback(async () => {
    try {
      await cncAudio.init();
      return true;
    } catch {
      return false;
    }
  }, []);

  const positionSoundMenu = useCallback(() => {
    const anchor = soundButtonRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const padding = 8;
    const popoverWidth = 180;
    const popoverHeight = 116;
    const left = Math.max(
      padding,
      Math.min(
        window.innerWidth - popoverWidth - padding,
        rect.left + rect.width / 2 - popoverWidth / 2,
      ),
    );
    const below = rect.bottom + padding;
    const top =
      below + popoverHeight <= window.innerHeight - padding
        ? below
        : Math.max(padding, rect.top - popoverHeight - padding);
    setSoundMenuPosition({ left, top });
  }, []);

  useEffect(() => {
    if (!soundMenuOpen) return;
    positionSoundMenu();

    const handleViewportChange = () => positionSoundMenu();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        (target && soundButtonRef.current?.contains(target)) ||
        (target && soundPopoverRef.current?.contains(target))
      ) {
        return;
      }
      setSoundMenuOpen(false);
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [positionSoundMenu, soundMenuOpen]);

  const resetPlayback = useCallback(() => {
    setPlaying(false);
    setCursor(0);
    setSegmentProgress(0);
    cncAudio.stopAll();
  }, []);

  const openSettings = useCallback(() => {
    const nextWorkOffsets = cloneWorkspaceWorkOffsets(workOffsets);
    setSettingsDraft({
      version: 1,
      profile,
      stock: cloneStockSettings(stock),
      speed,
      quality,
      showRapids,
      machineSound,
      finishSound,
      workOffsets: nextWorkOffsets,
    });
    setWorkOffsetInputDraft(createWorkOffsetInputDraft(nextWorkOffsets));
    setDrawer(null);
    setSoundMenuOpen(false);
    setSettingsOpen(true);
  }, [
    finishSound,
    machineSound,
    profile,
    quality,
    showRapids,
    speed,
    stock,
    workOffsets,
  ]);

  const updateDraftStock = useCallback(
    (update: (current: StockSettings) => StockSettings) => {
      setSettingsDraft((current) => ({
        ...current,
        stock: update(current.stock),
      }));
    },
    [],
  );

  const updateDraftWorkOffset = useCallback(
    (coordinateSystem: CoordinateSystem, axis: Axis, value: string) => {
      setWorkOffsetInputDraft((current) => ({
        ...current,
        [coordinateSystem]: {
          ...current[coordinateSystem],
          [axis]: value,
        },
      }));
    },
    [],
  );

  const applySettings = useCallback(async () => {
    const parsedWorkOffsets = parseWorkOffsetInputDraft(workOffsetInputDraft);
    if (!parsedWorkOffsets) {
      notify(t.invalidSettingsMsg);
      return;
    }
    const nextSettingsDraft: WorkspacePreferences = {
      ...settingsDraft,
      workOffsets: parsedWorkOffsets,
    };
    try {
      serializeWorkspacePreferences(nextSettingsDraft);
    } catch {
      notify(t.invalidSettingsMsg);
      return;
    }
    let nextMachineSound = nextSettingsDraft.machineSound;
    let nextFinishSound = nextSettingsDraft.finishSound;
    let audioReady = true;
    if (nextMachineSound || nextFinishSound) {
      audioReady = await ensureAudio();
      if (!audioReady) {
        nextMachineSound = false;
        nextFinishSound = false;
      }
    }

    setStock(cloneStockSettings(nextSettingsDraft.stock));
    setProfile(nextSettingsDraft.profile);
    setSpeed(nextSettingsDraft.speed);
    setQuality(nextSettingsDraft.quality);
    setShowRapids(nextSettingsDraft.showRapids);
    setMachineSound(nextMachineSound);
    setFinishSound(nextFinishSound);
    setWorkOffsets(cloneWorkspaceWorkOffsets(parsedWorkOffsets));
    setSettingsOpen(false);
    resetPlayback();
    notify(
      audioReady
        ? t.settingsAppliedMsg
        : `${t.settingsAppliedMsg} ${t.audioUnavailableMsg}`,
    );
  }, [
    ensureAudio,
    notify,
    resetPlayback,
    settingsDraft,
    t.audioUnavailableMsg,
    t.invalidSettingsMsg,
    t.settingsAppliedMsg,
    workOffsetInputDraft,
  ]);

  const onResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setOrbit({ ...DEFAULT_ORBIT });
    setResetTrigger((prev) => prev + 1);
  }, []);

  const changeView = useCallback((nextView: ViewMode) => {
    setView(nextView);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    if (nextView !== "solid") setIsMeasuring(false);
    if (nextView === "iso") setOrbit({ ...DEFAULT_ORBIT });
  }, []);

  useEffect(() => {
    let enabled = false;
    try {
      enabled = localStorage.getItem(MACHINE_VIEW_STORAGE_KEY) === "true";
    } catch {
      // Experimental features remain disabled when storage is unavailable.
    }
    if (!enabled) return;

    const frame = window.requestAnimationFrame(() => setMachineViewEnabled(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const availableViewModes = useMemo<ViewMode[]>(
    () =>
      machineViewEnabled
        ? ["xoy", "solid", "machine"]
        : ["xoy", "solid"],
    [machineViewEnabled],
  );

  const toggleMachineView = useCallback(
    (enabled: boolean) => {
      setMachineViewEnabled(enabled);
      try {
        localStorage.setItem(MACHINE_VIEW_STORAGE_KEY, String(enabled));
      } catch {
        // The switch still applies for this session when storage is unavailable.
      }
      if (!enabled && view === "machine") changeView("solid");
      notify(enabled ? t.machine3DEnableMsg : t.machine3DDisableMsg);
    },
    [changeView, notify, t.machine3DDisableMsg, t.machine3DEnableMsg, view],
  );

  const toggleMeasurement = useCallback(() => {
    if (isMeasuring) {
      setIsMeasuring(false);
      return;
    }

    changeView("solid");
    setMeasurementSession((session) => session + 1);
    setIsMeasuring(true);
    notify(
      lang === "EN"
        ? "3D measurement enabled · select A/B; use X/Y/Z to lock direction."
        : "Đo 3D đã bật · chọn A/B; dùng X/Y/Z để khóa hướng.",
    );
  }, [changeView, isMeasuring, lang, notify]);

  const applyCode = useCallback(
    async (nextCode: string, nextFileName?: string) => {
      const violation = programLimitViolation(nextCode);
      if (violation) {
        notify(
          violation === "lines"
            ? lang === "EN"
              ? `Program exceeds ${MAX_PROGRAM_LINES.toLocaleString()} lines. Split it before analysis.`
              : `Chương trình vượt ${MAX_PROGRAM_LINES.toLocaleString()} dòng. Hãy chia nhỏ trước khi phân tích.`
            : t.fileTooLarge,
        );
        return null;
      }

      const requestId = ++applyCodeRequestRef.current;
      prepareAbortRef.current?.abort();
      const abortController = new AbortController();
      prepareAbortRef.current = abortController;
      setIsPreparingProgram(true);
      try {
        const prepared = await prepareProgramOffThread({
          source: nextCode,
          stock,
          profile,
          workOffsets,
        }, abortController.signal);
        if (requestId !== applyCodeRequestRef.current) return null;
        const preparedFor = {
          source: nextCode,
          stock: prepared.stock,
          profile,
          workOffsets,
        };
        acceptPreparedSimulation(prepared, preparedFor);
        setStock(prepared.stock);
        setCode(nextCode);
        setDraftCode(nextCode);
        if (nextFileName) {
          setFileName(nextFileName);
          setProjectName(nextFileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
        }
        resetPlayback();
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setOrbit({ ...DEFAULT_ORBIT });
        return prepared.rotated;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return null;
        }
        if (requestId === applyCodeRequestRef.current) {
          notify(
            lang === "EN"
              ? "Could not analyze this program. The current workspace was kept."
              : "Không thể phân tích chương trình này. Không gian làm việc hiện tại được giữ nguyên.",
          );
        }
        return null;
      } finally {
        if (requestId === applyCodeRequestRef.current) {
          prepareAbortRef.current = null;
          setIsPreparingProgram(false);
        }
      }
    },
    [
      acceptPreparedSimulation,
      lang,
      notify,
      profile,
      resetPlayback,
      stock,
      t.fileTooLarge,
      workOffsets,
    ],
  );

  const readFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_PROGRAM_BYTES) {
        notify(t.fileTooLarge);
        return;
      }
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!extension || !["nc", "txt", "tap", "gcode", "cnc"].includes(extension)) {
        notify(t.unsupportedFormat);
        return;
      }
      setIsImporting(true);
      try {
        const text = await file.text();
        if (!text.trim()) {
          notify(t.emptyFileMsg);
          return;
        }
        const violation = programLimitViolation(text);
        if (violation) {
          notify(
            violation === "lines"
              ? lang === "EN"
                ? `Program exceeds ${MAX_PROGRAM_LINES.toLocaleString()} lines. Split it before importing.`
                : `Chương trình vượt ${MAX_PROGRAM_LINES.toLocaleString()} dòng. Hãy chia nhỏ trước khi nhập.`
              : t.fileTooLarge,
          );
          return;
        }
        const rotated = await applyCode(text, file.name);
        if (rotated === null) return;
        setMobilePanel("simulation");
        notify(
          rotated
            ? `Đã đọc ${file.name} và tự xoay phôi sang ${stock.height.toFixed(0)} × ${stock.width.toFixed(0)} mm.`
            : `Đã đọc ${file.name} hoàn toàn trên trình duyệt.`,
        );
      } catch {
        notify(t.fileReadErrorMsg);
      } finally {
        setIsImporting(false);
      }
    },
    [
      applyCode,
      lang,
      notify,
      stock.height,
      stock.width,
      t.emptyFileMsg,
      t.fileReadErrorMsg,
      t.fileTooLarge,
      t.unsupportedFormat,
    ],
  );

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void readFile(file);
    event.target.value = "";
  };

  const seekToLine = useCallback(
    (lineIndex: number, revealSimulation = true) => {
      const target = simulation.segments.findIndex(
        (segment) => segment.lineIndex >= lineIndex,
      );
      if (target >= 0) {
        setPlaying(false);
        setCursor(target);
        setSegmentProgress(0);
      }
      setDrawer(null);
      if (revealSimulation) setMobilePanel("simulation");
    },
    [simulation.segments],
  );

  const stepForward = useCallback(() => {
    setPlaying(false);
    if (!simulation.segments.length) return;
    setSegmentProgress(0);
    setCursor((current) =>
      current >= simulation.segments.length - 1 ? 0 : current + 1,
    );
  }, [simulation.segments.length]);

  const togglePlayback = useCallback(async () => {
    if (!simulation.segments.length) {
      notify(t.noMotionPlaybackMsg);
      return;
    }
    if (playing) {
      setPlaying(false);
      return;
    }
    if (
      cursor >= simulation.segments.length - 1 &&
      segmentProgress >= 1
    ) {
      setCursor(0);
      setSegmentProgress(0);
    }
    if (machineSound || finishSound) {
      const audioReady = await ensureAudio();
      if (!audioReady) {
        setMachineSound(false);
        setFinishSound(false);
        notify(t.audioUnavailableMsg);
      }
    }
    setPlaying(true);
  }, [
    cursor,
    ensureAudio,
    finishSound,
    machineSound,
    notify,
    playing,
    segmentProgress,
    simulation.segments.length,
    t.audioUnavailableMsg,
    t.noMotionPlaybackMsg,
  ]);

  useEffect(() => {
    if (!playing || !simulation.segments.length) return;
    let animationFrame = 0;
    let previousTime = performance.now();
    const targetInterval =
      renderPerformanceProfile(quality).playbackFrameIntervalMs;

    const tick = (now: number) => {
      const delta = Math.min(80, now - previousTime);
      if (delta < targetInterval) {
        animationFrame = window.requestAnimationFrame(tick);
        return;
      }
      previousTime = now;
      const segment =
        simulation.segments[Math.min(cursor, simulation.segments.length - 1)];
      if (!segment) {
        setPlaying(false);
        cncAudio.stopAll();
        return;
      }
      
      if (machineSound) {
        cncAudio.setSpindle(true, 18000); 
        cncAudio.setMove(true, segment.kind === "rapid", segment.feed || 1000);
      } else {
        cncAudio.stopAll();
      }

      const nominalFeed =
        segment.kind === "rapid"
          ? stock.rapidFeed
          : Math.max(1, segment.feed || 1000);
      const realDurationMs = (segment.length / (nominalFeed / 60)) * 1000;
      const displayDuration = Math.max(16 / speed, realDurationMs / speed);
      const increment = displayDuration > 0 ? delta / displayDuration : 1;

      setSegmentProgress((current) => {
        const next = current + increment;
        if (next >= 1) {
          const stepsToAdvance = Math.floor(next);
          const remainder = next - stepsToAdvance;
          if (cursor + stepsToAdvance >= simulation.segments.length) {
            setCursor(simulation.segments.length - 1);
            setPlaying(false);
            if (finishSound) cncAudio.playComplete();
            return 1;
          }
          setCursor((index) =>
            Math.min(index + stepsToAdvance, simulation.segments.length - 1),
          );
          return remainder;
        }
        return next;
      });
      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      cncAudio.stopAll();
    };
  }, [
    playing,
    cursor,
    simulation.segments,
    speed,
    stock.rapidFeed,
    quality,
    machineSound,
    finishSound,
  ]);

  useEffect(() => {
    const container = codeScrollRef.current;
    if (!container) return;
    const lineTop = currentLine * CODE_ROW_HEIGHT;
    const lineBottom = lineTop + CODE_ROW_HEIGHT;
    if (lineTop < container.scrollTop) {
      container.scrollTop = lineTop;
    } else if (lineBottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = lineBottom - container.clientHeight;
    }
    if (!container.contains(document.activeElement)) {
      setFocusedCodeLine(currentLine);
    }
  }, [currentLine]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        if (soundMenuOpen) {
          setSoundMenuOpen(false);
          return;
        }
        if (isGuideOpen) {
          setIsGuideOpen(false);
          return;
        }
        if (compareOpen) {
          setCompareOpen(false);
          return;
        }
        if (minicamOpen) {
          setMinicamOpen(false);
          return;
        }
        if (editorOpen) {
          setEditorOpen(false);
          return;
        }
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (drawer) {
          setDrawer(null);
          return;
        }
        if (isMeasuring) {
          setIsMeasuring(false);
          return;
        }
        if (simulatorExpanded && !document.fullscreenElement) {
          setSimulatorExpanded(false);
        }
        return;
      }

      const hasBlockingSurface = Boolean(
        drawer ||
          settingsOpen ||
          editorOpen ||
          compareOpen ||
          minicamOpen ||
          isGuideOpen ||
          soundMenuOpen,
      );
      const usesAppBrowserShortcut =
        ((event.ctrlKey || event.metaKey) &&
          (event.code === "KeyO" || event.code === "Comma")) ||
        event.code === "F1" ||
        event.code === "F5" ||
        event.code === "F8" ||
        event.code === "F10";
      if (usesAppBrowserShortcut) event.preventDefault();
      if (hasBlockingSurface) return;

      if ((event.ctrlKey || event.metaKey) && event.code === "KeyO") {
        event.preventDefault();
        fileInputRef.current?.click();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.code === "Comma") {
        event.preventDefault();
        openSettings();
        return;
      }
      if (event.code === "F1") {
        event.preventDefault();
        setIsGuideOpen(true);
        return;
      }
      if (event.code === "F5") {
        event.preventDefault();
        void togglePlayback();
        return;
      }
      if (event.code === "F10") {
        event.preventDefault();
        stepForward();
        return;
      }
      if (event.code === "F8") {
        event.preventDefault();
        resetPlayback();
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, a, [contenteditable='true']")) {
        return;
      }

      if (event.code === "KeyM") {
        event.preventDefault();
        toggleMeasurement();
      } else if (event.code === "KeyG") {
        event.preventDefault();
        setCodeCollapsed(false);
        setMobilePanel("code");
      } else if (event.code === "Space") {
        event.preventDefault();
        void togglePlayback();
      } else if (event.code === "Digit1") {
        changeView("xoy");
      } else if (event.code === "Digit2") {
        changeView("solid");
      } else if (event.code === "Digit3") {
        if (machineViewEnabled) {
          changeView("machine");
        } else {
          notify(t.machine3DShortcutMsg);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    compareOpen,
    changeView,
    drawer,
    editorOpen,
    isGuideOpen,
    isMeasuring,
    machineViewEnabled,
    minicamOpen,
    notify,
    openSettings,
    resetPlayback,
    settingsOpen,
    simulatorExpanded,
    soundMenuOpen,
    stepForward,
    t.machine3DShortcutMsg,
    toggleMeasurement,
    togglePlayback,
  ]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) setSimulatorExpanded(false);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handleFullscreen = async () => {
    if (simulatorExpanded) {
      if (document.fullscreenElement) await document.exitFullscreen();
      setSimulatorExpanded(false);
      return;
    }

    setSimulatorExpanded(true);
    try {
      await appRef.current?.requestFullscreen();
    } catch {
      notify("Đã mở chế độ tập trung. Nhấn Esc để quay lại.");
    }
  };

  return (
    <main
      className={`cnc-app${dragActive ? " is-dragging" : ""}${simulatorExpanded ? " is-simulator-expanded" : ""}`}
      ref={appRef}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!event.dataTransfer.types.includes("Files")) return;
        dragDepthRef.current += 1;
        setDragActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setDragActive(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void readFile(file);
      }}
    >
      <div className="top-navigation-island">
        <header className="app-header">
          <div className="header-left">
        <div className="brand" aria-label="Lax's CNC Pro Workstation">
          <div className="brand-badge" title="Lax's CNC Workstation PRO">
            <div className="brand-logo-icon">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="cnc-logo-svg">
                <defs>
                  <linearGradient id="lax-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00f2fe" />
                    <stop offset="100%" stopColor="#4facfe" />
                  </linearGradient>
                  <linearGradient id="lax-glow" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#26d9e8" />
                    <stop offset="100%" stopColor="#70eccb" />
                  </linearGradient>
                  <filter id="glow-drop" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#00f2fe" floodOpacity="0.5" />
                  </filter>
                </defs>
                <path
                  d="M 26 12 A 11 11 0 1 1 20 6"
                  stroke="url(#lax-grad)"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  fill="none"
                  filter="url(#glow-drop)"
                />
                <circle cx="20" cy="6" r="3" fill="#70eccb" filter="drop-shadow(0 0 4px #70eccb)" />
                <circle cx="20" cy="6" r="1.2" fill="#ffffff" />
                <path
                  d="M 16 9 L 18 14 L 23 16 L 18 18 L 16 23 L 14 18 L 9 16 L 14 14 Z"
                  fill="url(#lax-glow)"
                  filter="drop-shadow(0 0 3px rgba(112, 236, 203, 0.4))"
                />
                <circle cx="16" cy="16" r="2" fill="#ffffff" />
              </svg>
            </div>
          </div>
          <div className="brand-copy">
            <span className="brand-title">
              <span className="brand-accent">{"Lax's"}</span> CNC
            </span>
          </div>
        </div>
        
        <label className="project-field">
          <span>{t.projectLabel}</span>
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            aria-label={t.projectLabel}
          />
          <Icon name="edit" size={15} />
        </label>
          </div>
          <div className="header-center">
        <div className="program-chip" title={fileName}>
          <span>{t.programLabel}</span>
          <strong>{fileName}</strong>
          <small>{simulation.lines.length} {t.statusLine.toUpperCase()}</small>
        </div>
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          accept=".nc,.txt,.tap,.gcode,.cnc"
          onChange={handleFileInput}
        />
        <button
          className="import-button"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title={t.uploadFile}
          disabled={isImporting}
          aria-busy={isImporting}
        >
          <Icon name="upload" size={18} />
          <span>{isImporting ? t.loadingGcode : t.importBtn}</span>
        </button>
        <button
          className="guide-button"
          type="button"
          onClick={() => setIsGuideOpen(true)}
          title={t.guideBtn}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <span>{t.guideBtn}</span>
        </button>
        <button
          className="lang-toggle"
          type="button"
          onClick={() => toggleLanguage(lang === "VN" ? "EN" : "VN")}
          title={lang === "VN" ? "Switch to English" : "Chuyển sang Tiếng Việt"}
        >
          <span className={`lang-opt ${lang === "EN" ? "is-active" : ""}`}>EN</span>
          <span className="lang-divider">|</span>
          <span className={`lang-opt ${lang === "VN" ? "is-active" : ""}`}>VN</span>
        </button>
          </div>
          <div className="header-right">
        <label className="profile-select">
          <span className="visually-hidden">{t.profileLabel}</span>
          <select
            value={profile}
            onChange={(event) => {
              setProfile(event.target.value as MachineProfile);
              resetPlayback();
            }}
          >
            <option value="router-custom">{t.routerCustom}</option>
            <option value="iso">{t.isoBasic}</option>
          </select>
        </label>
        <div className="connection-state">
          <span className="status-dot" />
          <span>
            <b>CNC-01</b>
            <small>{t.localProcessing}</small>
          </span>
        </div>
          </div>
      </header>

      <section
        className="command-bar"
        aria-label={lang === "EN" ? "Simulation controls" : "Điều khiển mô phỏng"}
      >
        <div className="playback-controls">
          <button
            className="primary-control"
            type="button"
            onClick={togglePlayback}
            disabled={!simulation.segments.length}
            aria-label={playing ? t.pause : t.play}
            title={`${playing ? t.pause : t.play} · Space / F5`}
          >
            <Icon name={playing ? "pause" : "play"} size={22} />
          </button>
          <button
            className="secondary-control"
            type="button"
            onClick={stepForward}
            disabled={!simulation.segments.length}
            aria-label={t.stepForward}
            title={`${t.stepForward} · F10`}
          >
            <Icon name="step" size={20} />
          </button>
          <div style={{ position: "relative" }}>
            <button
              ref={soundButtonRef}
              className={`secondary-control ${(machineSound || finishSound) ? "is-active" : ""}`}
              type="button"
              onClick={async () => {
                if (!soundMenuOpen) positionSoundMenu();
                setSoundMenuOpen((open) => !open);
                if (!(await ensureAudio())) {
                  setMachineSound(false);
                  setFinishSound(false);
                  notify(t.audioUnavailableMsg);
                }
              }}
              aria-label={lang === "EN" ? "Sound settings" : "Thiết lập âm thanh"}
              aria-expanded={soundMenuOpen}
              aria-controls="sound-settings-popover"
            >
              <Icon name={(machineSound || finishSound) ? "volume" : "volume-x"} size={20} />
            </button>
          </div>
          <button
            className="secondary-control"
            type="button"
            onClick={resetPlayback}
            aria-label={t.reset}
            title={`${t.reset} · F8`}
          >
            <Icon name="reset" size={20} />
          </button>
        </div>
        <div className={`playback-readout${playing ? " is-running" : ""}`}>
          <span>
            <small>BLOCK</small>
            <strong>{activeSegment?.lineNumber ?? 0}</strong>
          </span>
          <i />
          <b>{playing ? "RUNNING" : "READY"}</b>
        </div>
        
        <div className="view-switch" aria-label="Góc nhìn mô phỏng">
          {availableViewModes.map((viewMode, index) => (
            <button
              type="button"
              className={view === viewMode ? "is-active" : ""}
              aria-pressed={view === viewMode}
              title={`${getViewMeta(viewMode, t).title} · phím ${index + 1}`}
              onClick={() => changeView(viewMode)}
              key={viewMode}
            >
              {viewMode === "iso" || viewMode === "solid" || viewMode === "machine" ? (
                <Icon name="cube" size={16} />
              ) : (
                <Icon name="panel" size={16} />
              )}
              <span>{getViewMeta(viewMode, t).short}</span>
              {viewMode === "machine" && (
                <em className="view-switch__beta">{t.experimentalBadge}</em>
              )}
              <kbd>{index + 1}</kbd>
            </button>
          ))}
        </div>
        <label className="speed-control">
          <span>{t.speedControl}</span>
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={5}>5×</option>
            <option value={10}>10×</option>
            <option value={20}>20×</option>
          </select>
        </label>
        <label className="speed-control quality-control">
          <span>{t.configLabel}</span>
          <select
            value={quality}
            onChange={(event) =>
              setQuality(event.target.value as SimulationQuality)
            }
            title={
              quality === "high"
                ? lang === "EN"
                  ? "Maximum local graphics: 4K stock map, 2× render scale"
                  : "Đồ họa máy người dùng ở mức tối đa: phôi 4K, tỷ lệ dựng 2×"
                : lang === "EN"
                  ? "Balanced simulation quality using this device's GPU"
                  : "Chất lượng mô phỏng cân bằng theo GPU của thiết bị này"
            }
          >
            <option value="low">{t.perfLow}</option>
            <option value="medium">{t.perfMedium}</option>
            <option value="high">{t.perfHigh}</option>
          </select>
        </label>
        
        <div className="canvas-tools">
          <ToolbarButton
            icon="ruler"
            label={
              isMeasuring
                ? lang === "EN"
                  ? "Close smart measurement"
                  : "Đóng công cụ đo thông minh"
                : lang === "EN"
                  ? "Smart 3D measurement · switches to Solid automatically"
                  : "Đo thông minh 3D · tự chuyển sang Solid"
            }
            onClick={toggleMeasurement}
            active={isMeasuring}
          />
          <ToolbarButton
            icon="crosshair"
            label={t.fitToScreen}
            onClick={onResetView}
          />
          <ToolbarButton
            icon={simulatorExpanded ? "collapse" : "fullscreen"}
            label={
              simulatorExpanded
                ? "Thoát toàn màn hình"
                : "Toàn màn hình mô phỏng"
            }
            onClick={() => void handleFullscreen()}
            active={simulatorExpanded}
          />
          <ToolbarButton
            icon="panel"
            label={t.analysisDrawerTooltip}
            onClick={() => setDrawer(drawer ? null : "diagnostics")}
            active={!!drawer}
          />
          <ToolbarButton
            icon="settings"
            label={t.machineSetupTooltip}
            onClick={openSettings}
          />
        </div>
      </section>
      </div>


      <section
        className={`workspace${codeCollapsed ? " is-code-collapsed" : ""} is-mobile-${mobilePanel}`}
        aria-label={lang === "EN" ? "CNC workspace" : "Không gian làm việc CNC"}
      >
        <aside
          className="code-panel"
          aria-label={lang === "EN" ? "G-code program" : "Chương trình G-code"}
        >
          <div className="panel-titlebar">
            <div className="panel-title-copy">
              <strong>PROGRAM</strong>
              <span>{fileName}</span>
            </div>
            <div className="panel-title-actions">
              <span className="program-count">
                {simulation.lines.length} LINES · {simulation.segments.length} MOVES
              </span>
              <button
                type="button"
                onClick={() => {
                  setCodeCollapsed(true);
                  setMobilePanel("simulation");
                }}
                aria-label="Thu gọn bảng G-code"
                title="Thu gọn bảng G-code"
              >
                <Icon name="panel" size={17} />
              </button>
              <button
                type="button"
                onClick={() => setCompareOpen(true)}
                aria-label="So sánh File (File Compare)"
                title="So sánh File (File Compare)"
              >
                <Icon name="compare" size={17} fallback="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </button>
              <button
                type="button"
                onClick={() => setMinicamOpen(true)}
                aria-label="Mini CAM (CNC-Calc)"
                title="Mini CAM (CNC-Calc)"
              >
                <Icon name="layer" size={17} fallback="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftCode(code);
                  setEditorOpen(true);
                }}
                aria-label="Sửa G-code"
                title="Sửa hoặc dán G-code"
              >
                <Icon name="edit" size={17} />
              </button>
            </div>
          </div>
          <div
            className="code-lines"
            ref={codeScrollRef}
            role="listbox"
            aria-label={lang === "EN" ? "G-code program lines" : "Các dòng chương trình G-code"}
          >
            <div
              className="code-lines-virtual-space"
              style={{ height: simulation.lines.length * CODE_ROW_HEIGHT }}
            >
            {simulation.lines
              .slice(visibleCodeRange.start, visibleCodeRange.end)
              .map((line, visibleIndex) => {
              const index = visibleCodeRange.start + visibleIndex;
              return (
              <button
                type="button"
                role="option"
                aria-selected={index === currentLine}
                aria-current={index === currentLine ? "true" : undefined}
                tabIndex={index === focusedCodeLine ? 0 : -1}
                className={`code-line${index === currentLine ? " is-active" : ""}`}
                data-code-line={index}
                aria-posinset={index + 1}
                aria-setsize={simulation.lines.length}
                title={line || undefined}
                key={`${index}-${line}`}
                style={{ transform: `translateY(${index * CODE_ROW_HEIGHT}px)` }}
                onFocus={() => setFocusedCodeLine(index)}
                onClick={() => seekToLine(index)}
                onKeyDown={(event) => {
                  if (
                    event.key !== "ArrowUp" &&
                    event.key !== "ArrowDown" &&
                    event.key !== "Home" &&
                    event.key !== "End"
                  ) {
                    return;
                  }
                  event.preventDefault();
                  const nextIndex =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? simulation.lines.length - 1
                        : Math.max(
                            0,
                            Math.min(
                              simulation.lines.length - 1,
                              index + (event.key === "ArrowDown" ? 1 : -1),
                            ),
                          );
                  setFocusedCodeLine(nextIndex);
                  seekToLine(nextIndex, false);
                  window.requestAnimationFrame(() =>
                    document
                      .querySelector<HTMLElement>(`[data-code-line="${nextIndex}"]`)
                      ?.focus(),
                  );
                }}
              >
                <span className="line-marker">
                  {index === currentLine ? "▶" : ""}
                </span>
                <span className="line-number">
                  {String(index + 1).padStart(4, "0")}
                </span>
                <code>{line ? syntaxLine(line) : " "}</code>
              </button>
              );
            })}
            </div>
          </div>
          <div className="code-statusbar">
            <span>
              Dòng {currentLine + 1} / {simulation.lines.length}
            </span>
            <span className="code-mode-badges">
              <b>{activeModeLabel}</b>
              <b>{activeDistanceCodeLabel}</b>
              <b>{activeUnits === "mm" ? "G21 MM" : "G20 INCH"}</b>
              <b>{PLANE_GCODE[activePlane]} {activePlane}</b>
            </span>
          </div>
        </aside>

        <section
          className="simulation-panel"
          aria-label={lang === "EN" ? "Toolpath simulation" : "Mô phỏng đường chạy dao"}
          aria-busy={analysisBusy}
        >
          <div className="simulation-titlebar">
            <div className="simulation-heading">
              {codeCollapsed ? (
                <button
                  type="button"
                  onClick={() => {
                    setCodeCollapsed(false);
                    setMobilePanel("code");
                  }}
                  className="show-code-button"
                  aria-label="Hiện bảng G-code"
                  title="Hiện bảng G-code"
                >
                  <Icon name="panel" size={15} />
                  <span>G-CODE</span>
                </button>
              ) : null}
              <span>{getViewMeta(view, t).title.toUpperCase()}</span>
              <strong
                className={`simulation-state${playing ? " is-running" : ""}${analysisBusy ? " is-processing" : ""}`}
                aria-live="polite"
              >
                <i />
                {analysisBusy ? (lang === "EN" ? "ANALYZING" : "ĐANG PHÂN TÍCH") : playing ? "LIVE" : "READY"}
              </strong>
              <small>
                BLOCK {activeSegment?.lineNumber ?? 0} · {simulation.segments.length}{" "}
                {lang === "EN" ? "moves" : "chuyển động"} · {simulation.parts.length} {lang === "EN" ? "parts" : "chi tiết"}
              </small>
              {analysisBusy ? (
                <button
                  type="button"
                  className="cancel-analysis-button"
                  onClick={cancelProgramAnalysis}
                >
                  {lang === "EN" ? "Cancel" : "Hủy"}
                </button>
              ) : null}
              {simulationProcessingError ? (
                <small className="analysis-error" title={simulationProcessingError}>
                  {lang === "EN" ? "Analysis failed; previous result kept" : "Phân tích lỗi; đang giữ kết quả trước"}
                </small>
              ) : null}
            </div>
            <div className="path-legend">
              <span>
                <i className="legend-line cut" /> {t.cuts}
              </span>
              <button
                type="button"
                className={`rapid-toggle${showRapids ? " is-active" : ""}`}
                aria-pressed={showRapids}
                onClick={() => setShowRapids((value) => !value)}
                title={lang === "EN" ? "Toggle rapid G0 moves" : "Ẩn hoặc hiện đường chạy nhanh G0"}
              >
                <i className="legend-line rapid" /> {t.rapids}
                <small>{showRapids ? (lang === "EN" ? "ON" : "HIỆN") : (lang === "EN" ? "OFF" : "ẨN")}</small>
              </button>
              <span>
                <i className="legend-dot" /> {t.toolPos}
              </span>
            </div>
          </div>
          <ToolpathCanvas
            lang={lang}
            simulation={simulation}
            stock={stock}
            cursor={cursor}
            segmentProgress={segmentProgress}
            playing={playing}
            view={view}
            zoom={zoom}
            pan={pan}
            orbit={orbit}
            showRapids={showRapids}
            quality={quality}
            t={t}
            onZoom={setZoom}
            onPan={setPan}
            onOrbit={setOrbit}
            onResetView={onResetView}
            resetTrigger={resetTrigger}
            isMeasuring={isMeasuring}
            measurementSession={measurementSession}
            onMeasurementClose={() => setIsMeasuring(false)}
          />
          <div className="scrubber">
            <span className="scrubber-clock">
              <small>{t.statusRunTime.toUpperCase()}</small>
              <strong>
                {formatTime(
                  simulation.estimatedSeconds * (totalProgress / 100),
                )}
              </strong>
            </span>
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(totalProgress * 10)}
              aria-label="Tiến độ mô phỏng"
              onChange={(event) => {
                const ratio = Number(event.target.value) / 1000;
                const exact = ratio * simulation.segments.length;
                setPlaying(false);
                setCursor(
                  Math.min(
                    simulation.segments.length - 1,
                    Math.max(0, Math.floor(exact)),
                  ),
                );
                setSegmentProgress(exact - Math.floor(exact));
              }}
            />
            <span className="scrubber-progress">
              <strong>{totalProgress.toFixed(0)}%</strong>
              <small>
                {Math.min(cursor + 1, simulation.segments.length)}/
                {simulation.segments.length} {t.statusLine.toUpperCase()}
              </small>
            </span>
            <span className="scrubber-clock">
              <small>{t.statusTotalTime.toUpperCase()}</small>
              <strong>{formatTime(simulation.estimatedSeconds)}</strong>
            </span>
          </div>
        </section>
      </section>

      <section
        className="metrics-strip"
        aria-label={lang === "EN" ? "Program metrics" : "Chỉ số chương trình"}
      >
        <MetricCard
          icon="sheet"
          label={t.stockMetric}
          detail={lang === "EN" ? `Thick ${stock.thickness.toFixed(1)} mm · Origin X${stock.originX} Y${stock.originY}` : `Dày ${stock.thickness.toFixed(1)} mm · Gốc X${stock.originX} Y${stock.originY}`}
          onClick={openSettings}
        >
          {stock.width.toFixed(0)} × {stock.height.toFixed(0)}
          <small> mm</small>
        </MetricCard>
        <MetricCard
          icon="tool"
          label={t.tool}
          detail={`F${activeSegment?.feed.toFixed(0) ?? 0} · S${activeSegment?.spindle.toFixed(0) ?? 0}`}
        >
          {activeSegment?.tool === "—" ? simulation.finalState.tool : activeSegment?.tool}
          <small> · Ø{stock.toolDiameter} mm</small>
        </MetricCard>
        <MetricCard
          icon="route"
          label={t.cutDistance}
          detail={lang === "EN" ? `Rapid ${formatLength(simulation.rapidLength)}` : `Chạy nhanh ${formatLength(simulation.rapidLength)}`}
        >
          {formatLength(simulation.cutLength)}
        </MetricCard>
        <MetricCard
          icon="clock"
          label={t.estTime}
          detail={`${lang === "EN" ? "Rem." : "Còn"} ${formatTime(simulation.estimatedSeconds * (1 - totalProgress / 100))}`}
        >
          {formatTime(simulation.estimatedSeconds)}
        </MetricCard>
        <MetricCard
          icon={errorCount ? "warning" : "check"}
          label={t.errorsMetric}
          tone={errorCount ? "danger" : "success"}
          detail={errorCount ? t.errorsAction : t.errorsNone}
          onClick={() => setDrawer("diagnostics")}
        >
          {errorCount}
        </MetricCard>
        <MetricCard
          icon="warning"
          label={t.warningsMetric}
          tone={warningCount ? "warning" : "success"}
          detail={warningCount ? t.warningsAction : t.warningsNone}
          onClick={() => setDrawer("diagnostics")}
        >
          {warningCount}
        </MetricCard>
        <div className="position-metric">
          <span>{t.currentPos} · {activeCoordinateLabel}</span>
          <div className="position-grid">
            <span>
              <b>X</b>
              {currentPosition.x.toFixed(3)}
            </span>
            <span>
              <b>Y</b>
              {currentPosition.y.toFixed(3)}
            </span>
            <span>
              <b>Z</b>
              {currentPosition.z.toFixed(3)}
            </span>
          </div>
        </div>
        <div className="progress-metric">
          <span>{t.progressLabel}</span>
          <div className="progress-row">
            <div
              className="progress-track"
              role="progressbar"
              aria-label={t.progressLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(totalProgress)}
            >
              <i style={{ width: `${totalProgress}%` }} />
            </div>
            <strong>{totalProgress.toFixed(0)}%</strong>
          </div>
          <small className="progress-detail">
            {t.blockLabel.toUpperCase()} {activeSegment?.lineNumber ?? 0} ·{" "}
            {Math.min(cursor + 1, simulation.segments.length)}/
            {simulation.segments.length}
          </small>
        </div>
      </section>

      <footer
        className="machine-statebar"
        aria-label={lang === "EN" ? "Machine state" : "Trạng thái máy"}
      >
        <span>
          <small>{t.modeLabel.toUpperCase()}</small>
          <b>
            {activeModeLabel} · {activeDistanceFooterLabel}
          </b>
        </span>
        <span>
          <small>{t.unitLabel.toUpperCase()}</small>
          <b>
            {activeUnits === "mm" ? "MM · G21" : "INCH · G20"}
          </b>
        </span>
        <span>
          <small>{t.planeLabel.toUpperCase()}</small>
          <b>{activePlane} · {PLANE_GCODE[activePlane]}</b>
        </span>
        <span>
          <small>{t.spindleLabel.toUpperCase()}</small>
          <b>{activeSegment?.spindle || simulation.finalState.spindle || 0} RPM</b>
        </span>
        <span>
          <small>{t.feedLabel.toUpperCase()}</small>
          <b>F {activeSegment?.feed.toFixed(0) ?? 0}</b>
        </span>
        <span>
          <small>{t.safeZLabel.toUpperCase()}</small>
          <b>{stock.safeZ.toFixed(3)}</b>
        </span>
        <span>
          <small>{t.drillLabel.toUpperCase()}</small>
          <b>{simulation.drillHoles} {lang === "EN" ? "HOLES" : "LỖ"}</b>
        </span>
        <span className="statebar-spacer" />
        <span className={`statebar-health${errorCount ? " has-error" : ""}`}>
          <i />
          <b>{errorCount ? t.checkRequired : t.programOk}</b>
        </span>
      </footer>

      <nav
        className="mobile-navigation"
        aria-label={lang === "EN" ? "Mobile workspace" : "Điều hướng không gian làm việc"}
      >
        <button
          type="button"
          className={mobilePanel === "simulation" ? "is-active" : ""}
          aria-current={mobilePanel === "simulation" ? "page" : undefined}
          onClick={() => setMobilePanel("simulation")}
        >
          <Icon name="cube" size={19} />
          <span>{t.mobileSimulation}</span>
        </button>
        <button
          type="button"
          className={mobilePanel === "code" ? "is-active" : ""}
          aria-current={mobilePanel === "code" ? "page" : undefined}
          onClick={() => {
            setCodeCollapsed(false);
            setMobilePanel("code");
          }}
        >
          <Icon name="panel" size={19} />
          <span>{t.mobileCode}</span>
        </button>
        <button
          type="button"
          className={drawer ? "is-active" : ""}
          aria-expanded={Boolean(drawer)}
          onClick={() => setDrawer(drawer ? null : "diagnostics")}
        >
          <Icon name="warning" size={19} />
          <span>{t.mobileAnalysis}</span>
        </button>
        <button type="button" onClick={openSettings}>
          <Icon name="settings" size={19} />
          <span>{t.mobileSettings}</span>
        </button>
      </nav>

      {drawer && (
        <>
          <button
            className="drawer-backdrop"
            type="button"
            aria-label={lang === "EN" ? "Close analysis drawer" : "Đóng bảng phân tích"}
            onClick={() => setDrawer(null)}
          />
          <aside
            ref={drawerRef}
            className="analysis-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="analysis-drawer-title"
            tabIndex={-1}
          >
            <div className="drawer-header">
              <div>
                <small>{t.analysisTitle}</small>
                <h2 id="analysis-drawer-title">
                  {drawer === "diagnostics"
                    ? t.tabErrors
                    : drawer === "parts"
                      ? t.tabDimensions
                      : drawer === "offcuts"
                        ? t.tabRemnants
                        : drawer === "resume"
                          ? t.tabSmartResume
                          : t.tabPostProc}
                </h2>
              </div>
              <button type="button" onClick={() => setDrawer(null)} aria-label={lang === "EN" ? "Close" : "Đóng"}>
                <Icon name="close" />
              </button>
            </div>
            <div
              className="drawer-tabs"
              role="tablist"
              aria-label={t.analysisTitle}
              onKeyDown={(event) => {
                if (
                  event.key !== "ArrowLeft" &&
                  event.key !== "ArrowRight" &&
                  event.key !== "Home" &&
                  event.key !== "End"
                ) {
                  return;
                }
                event.preventDefault();
                const tabs = [
                  "diagnostics",
                  "parts",
                  "offcuts",
                  "resume",
                  "export",
                ] as const;
                const currentIndex = tabs.indexOf(drawer);
                const nextIndex =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : event.key === "ArrowRight"
                        ? (currentIndex + 1) % tabs.length
                        : (currentIndex - 1 + tabs.length) % tabs.length;
                const nextTab = tabs[nextIndex];
                setDrawer(nextTab);
                window.requestAnimationFrame(() =>
                  document.getElementById(`drawer-tab-${nextTab}`)?.focus(),
                );
              }}
            >
              <button
                type="button"
                id="drawer-tab-diagnostics"
                role="tab"
                aria-controls="analysis-drawer-panel"
                aria-selected={drawer === "diagnostics"}
                tabIndex={drawer === "diagnostics" ? 0 : -1}
                className={drawer === "diagnostics" ? "is-active" : ""}
                onClick={() => setDrawer("diagnostics")}
              >
                {lang === "EN" ? "Errors" : "Kiểm lỗi"} <span>{simulation.diagnostics.length}</span>
              </button>
              <button
                type="button"
                id="drawer-tab-parts"
                role="tab"
                aria-controls="analysis-drawer-panel"
                aria-selected={drawer === "parts"}
                tabIndex={drawer === "parts" ? 0 : -1}
                className={drawer === "parts" ? "is-active" : ""}
                onClick={() => setDrawer("parts")}
              >
                {lang === "EN" ? "Parts" : "Chi tiết"} <span>{simulation.parts.length}</span>
              </button>
              <button
                type="button"
                id="drawer-tab-offcuts"
                role="tab"
                aria-controls="analysis-drawer-panel"
                aria-selected={drawer === "offcuts"}
                tabIndex={drawer === "offcuts" ? 0 : -1}
                className={drawer === "offcuts" ? "is-active" : ""}
                onClick={() => setDrawer("offcuts")}
              >
                {lang === "EN" ? "Remnants" : "Phôi dư"} <span>{simulation.offcuts?.length ?? 0}</span>
              </button>
              <button
                type="button"
                id="drawer-tab-resume"
                role="tab"
                aria-controls="analysis-drawer-panel"
                aria-selected={drawer === "resume"}
                tabIndex={drawer === "resume" ? 0 : -1}
                className={drawer === "resume" ? "is-active" : ""}
                onClick={() => setDrawer("resume")}
              >
                {lang === "EN" ? "Resume" : "Phục hồi"}
              </button>
              <button
                type="button"
                id="drawer-tab-export"
                role="tab"
                aria-controls="analysis-drawer-panel"
                aria-selected={drawer === "export"}
                tabIndex={drawer === "export" ? 0 : -1}
                className={drawer === "export" ? "is-active" : ""}
                onClick={() => setDrawer("export")}
              >
                {lang === "EN" ? "CAM Export" : "Xuất CAM"}
              </button>
            </div>
            <div
              className="drawer-content"
              id="analysis-drawer-panel"
              role="tabpanel"
              aria-labelledby={`drawer-tab-${drawer}`}
              tabIndex={0}
            >
              {drawer === "diagnostics" ? (
                simulation.diagnostics.length ? (
                  <div className="diagnostic-list">
                    {simulation.diagnostics.map((diagnostic) => (
                      <button
                        type="button"
                        className={`diagnostic-item is-${diagnostic.severity}`}
                        key={diagnostic.id}
                        onClick={() => seekToLine(diagnostic.lineIndex)}
                      >
                        <span className="diagnostic-icon">
                          <Icon
                            name={
                              diagnostic.severity === "info" ? "info" : "warning"
                            }
                            size={18}
                          />
                        </span>
                        <span className="diagnostic-text">
                          <div className="diagnostic-header">
                            <span className="line-badge">{lang === "EN" ? "Line" : "Dòng"} {diagnostic.lineIndex + 1}</span>
                            <span className="error-code">{diagnostic.code}</span>
                          </div>
                            <small>{translateDiagnostic(diagnostic.message, lang)}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Icon name="check" size={38} />
                    <h3>{t.noErrorsTitle}</h3>
                    <p>{t.noErrorsDesc}</p>
                  </div>
                )
              ) : drawer === "offcuts" ? (
                simulation.offcuts && simulation.offcuts.length ? (
                  <>
                    <div className="part-summary">
                      <div>
                        <small>{t.remnantTitle}</small>
                        <strong>{simulation.offcuts.length} {lang === "EN" ? "empty regions (MER)" : "vùng trống (MER)"}</strong>
                      </div>
                      <div>
                        <small>{t.mainStockSize}</small>
                        <strong>{stock.width} × {stock.height} mm</strong>
                      </div>
                    </div>
                    <div className="parts-table">
                      <div className="parts-table-head">
                        <span>{t.colCode}</span>
                        <span>{t.colSize}</span>
                        <span>{lang === "EN" ? "Coord (X, Y)" : "Tọa độ (X, Y)"}</span>
                        <span>{t.colAreaPct}</span>
                      </div>
                      {simulation.offcuts.map((off) => {
                        const pct = ((off.area / (stock.width * stock.height)) * 100).toFixed(1);
                        return (
                          <button
                            type="button"
                            key={off.id}
                            onClick={() => {
                              setPan({ x: -off.minX, y: -off.minY });
                              setZoom(1.5);
                            }}
                          >
                            <b>{off.id}</b>
                            <span>{off.width.toFixed(1)} × {off.height.toFixed(1)} mm</span>
                            <span>({off.minX.toFixed(1)}, {off.minY.toFixed(1)})</span>
                            <span><b>{pct}%</b> {lang === "EN" ? "stock" : "phôi"}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="method-note">
                      {t.merExplanation}
                    </p>
                  </>
                ) : (
                  <div className="empty-state">
                    <Icon name="cube" size={38} />
                    <h3>{t.noRemnantsTitle}</h3>
                    <p>{t.noRemnantsDesc}</p>
                  </div>
                )
              ) : drawer === "resume" ? (
                <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", color: "#e0e0e0" }}>
                  <div className="part-summary" style={{ background: "#181818", padding: "12px", borderRadius: "6px" }}>
                    <div>
                      <small>{lang === "EN" ? "Smart Resume Recovery Function" : "Chức năng phục hồi cắt dở (Smart Resume)"}</small>
                      <strong style={{ display: "block", marginTop: "4px" }}>{t.smartResumeDesc}</strong>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "12px" }}>
                    <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                      <small style={{ color: "#aaa" }}>{lang === "EN" ? "Resume from Block #:" : "Tiếp tục từ Block số:"}</small>
                      <input
                        type="number"
                        min={1}
                        max={simulation.segments.length}
                        value={resumeSegment}
                        onChange={(e) => setResumeSegment(Math.max(1, Math.min(simulation.segments.length, Number(e.target.value))))}
                        autoFocus
                        style={{ padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#1e1e1e", color: "#fff" }}
                      />
                    </label>
                    <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
                      <small style={{ color: "#aaa" }}>{t.safeZLabel}:</small>
                      <input
                        type="number"
                        value={resumeSafeZ}
                        onChange={(e) => setResumeSafeZ(Number(e.target.value))}
                        style={{ padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#1e1e1e", color: "#fff" }}
                      />
                    </label>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <small style={{ color: "#aaa" }}>{lang === "EN" ? `Safe recovery G-code (Insert before Block #${resumeSegment}):` : `G-code khôi phục an toàn (Chèn vào trước Block ${resumeSegment}):`}</small>
                    <textarea
                      readOnly
                      rows={8}
                      value={generateSmartResume(simulation, resumeSegment, resumeSafeZ, lang)}
                      style={{ width: "100%", padding: "10px", borderRadius: "4px", border: "1px solid #444", background: "#0d0d0d", color: "#00ff66", fontFamily: "monospace", fontSize: "12px", resize: "vertical" }}
                    />
                  </div>
                  <button
                    type="button"
                    className="accent-button"
                    style={{ alignSelf: "flex-start", padding: "8px 16px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
                    onClick={() =>
                      void copyText(
                        generateSmartResume(
                          simulation,
                          resumeSegment,
                          resumeSafeZ,
                          lang,
                        ),
                        t.copiedRecoveryAlert,
                      )
                    }
                  >
                    <Icon name="copy" size={16} /> {lang === "EN" ? "Copy Recovery G-code" : "Sao chép G-code phục hồi"}
                  </button>
                </div>
              ) : drawer === "export" ? (
                <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", color: "#e0e0e0" }}>
                  <div className="part-summary" style={{ background: "#181818", padding: "12px", borderRadius: "6px" }}>
                    <div>
                      <small>{t.postProcTitle}</small>
                      <strong style={{ display: "block", marginTop: "4px" }}>{t.postProcDesc}</strong>
                    </div>
                  </div>
                  <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <small style={{ color: "#aaa" }}>{t.controllerDialect}:</small>
                    <select
                      value={exportType}
                      onChange={(e) => setExportType(e.target.value as PostProcessorType)}
                      style={{ padding: "8px", borderRadius: "4px", border: "1px solid #444", background: "#1e1e1e", color: "#fff" }}
                    >
                      <option value="ncstudio">{t.ncstudioLabel}</option>
                      <option value="syntec">{t.syntecLabel}</option>
                    </select>
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <small style={{ color: "#aaa" }}>{t.camPostResult}:</small>
                    <textarea
                      readOnly
                      rows={10}
                      value={exportCAM(simulation, exportType, projectName, lang)}
                      style={{ width: "100%", padding: "10px", borderRadius: "4px", border: "1px solid #444", background: "#0d0d0d", color: "#00eaff", fontFamily: "monospace", fontSize: "12px", resize: "vertical" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button
                      type="button"
                      className="accent-button"
                      style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
                      onClick={() => {
                        const content = exportCAM(simulation, exportType, projectName, lang);
                        const blob = new Blob([content], { type: "text/plain" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${projectName.toLowerCase().replace(/\s+/g, "-")}-${exportType}.nc`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Icon name="upload" size={16} /> {lang === "EN" ? "Download .NC File" : "Tải xuống file .NC"} ({exportType.toUpperCase()})
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
                      onClick={() =>
                        void copyText(
                          exportCAM(simulation, exportType, projectName, lang),
                          t.copiedAlert,
                        )
                      }
                    >
                      <Icon name="copy" size={16} /> {t.copyBtn}
                    </button>
                  </div>
                </div>
              ) : simulation.parts.length ? (
                <>
                  <div className="part-summary">
                    <div>
                      <small>{t.detected}</small>
                      <strong>{simulation.parts.length} {lang === "EN" ? "parts" : "chi tiết"}</strong>
                    </div>
                    <div>
                      <small>{t.requiredClearance}</small>
                      <strong>{stock.clearance.toFixed(1)} mm</strong>
                    </div>
                  </div>
                  <div className="parts-table">
                    <div className="parts-table-head">
                      <span>{t.colCode}</span>
                      <span>{t.colDim}</span>
                      <span>{t.colNearest}</span>
                      <span>{t.colEdge}</span>
                    </div>
                    {simulation.parts.map((part) => (
                      <button
                        type="button"
                        className={
                          (part.nearestGap ?? Number.POSITIVE_INFINITY) <
                            stock.clearance || part.edgeGap < stock.clearance
                            ? "has-warning"
                            : ""
                        }
                        key={part.id}
                        onClick={() => seekToLine(part.sourceLine)}
                      >
                        <b>{part.id}</b>
                        <span>
                          {part.width.toFixed(1)} × {part.height.toFixed(1)}
                        </span>
                        <span
                          className={
                            (part.nearestGap ?? Number.POSITIVE_INFINITY) <
                            stock.clearance
                              ? "is-warning"
                              : ""
                          }
                        >
                          {part.nearestGap === null
                            ? "—"
                            : `${part.nearestGap.toFixed(1)} mm`}
                        </span>
                        <span
                          className={
                            part.edgeGap < stock.clearance ? "is-warning" : ""
                          }
                        >
                          {part.edgeGap.toFixed(1)} mm
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="method-note">
                    {t.partMethodNote}
                  </p>
                </>
              ) : (
                <div className="empty-state">
                  <Icon name="ruler" size={38} />
                  <h3>{t.noPartsTitle}</h3>
                  <p>
                    {t.noPartsDesc}
                  </p>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {settingsOpen && (
        <ResponsiveDialog
          className="settings-modal"
          size="large"
          height="tall"
          titleId="settings-dialog-title"
          onClose={() => setSettingsOpen(false)}
        >
            <div className="modal-header">
              <div>
                <small>{t.machineProfile}</small>
                <h2 id="settings-dialog-title">{t.stockToolTitle}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label={lang === "EN" ? "Close" : "Đóng"}
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="modal-body">
              <section
                className="simulation-preferences"
                aria-labelledby="simulation-preferences-title"
              >
                <div className="simulation-preferences__heading">
                  <Icon name="settings" size={18} />
                  <div>
                    <strong id="simulation-preferences-title">
                      {t.preferenceTitle}
                    </strong>
                    <small>{t.preferenceDescription}</small>
                  </div>
                </div>
                <div className="simulation-preferences__grid">
                  <label>
                    <span>{t.profileLabel}</span>
                    <select
                      value={settingsDraft.profile}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          profile: event.target.value as MachineProfile,
                        }))
                      }
                    >
                      <option value="router-custom">{t.routerCustom}</option>
                      <option value="iso">{t.isoBasic}</option>
                    </select>
                  </label>
                  <label>
                    <span>{t.speedControl}</span>
                    <select
                      value={settingsDraft.speed}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          speed: Number(event.target.value),
                        }))
                      }
                    >
                      {[0.5, 1, 2, 5, 10, 20].map((option) => (
                        <option value={option} key={option}>
                          {option}×
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t.configLabel}</span>
                    <select
                      value={settingsDraft.quality}
                      onChange={(event) =>
                        setSettingsDraft((current) => ({
                          ...current,
                          quality: event.target.value as SimulationQuality,
                        }))
                      }
                    >
                      <option value="low">{t.perfLow}</option>
                      <option value="medium">{t.perfMedium}</option>
                      <option value="high">{t.perfHigh}</option>
                    </select>
                  </label>
                </div>
                <div className="simulation-preferences__toggles">
                  {([
                    ["showRapids", t.showRapidPreference],
                    ["machineSound", t.machineSoundLabel],
                    ["finishSound", t.finishSoundLabel],
                  ] as const).map(([key, label]) => (
                    <label className="settings-option" key={key}>
                      <input
                        type="checkbox"
                        checked={settingsDraft[key]}
                        onChange={(event) =>
                          setSettingsDraft((current) => ({
                            ...current,
                            [key]: event.target.checked,
                          }))
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </section>

              <div className="settings-grid">
                {([
                  ["width", t.lblWidth, "mm"],
                  ["height", t.lblHeight, "mm"],
                  ["thickness", t.lblThickness, "mm"],
                  ["toolDiameter", t.lblToolDia, "mm"],
                  ["originX", t.lblOriginX, "mm"],
                  ["originY", t.lblOriginY, "mm"],
                  ["safeZ", t.lblSafeZ, "mm"],
                  ["clearance", t.lblClearance, "mm"],
                  ["rapidFeed", t.lblRapidFeed, "mm/min"],
                ] as const).map(([key, label, unit]) => (
                <label key={key}>
                  <span>{label}</span>
                  <div>
                    <input
                      type="number"
                      step="0.1"
                      value={settingsDraft.stock[key]}
                      min={
                        key === "clearance"
                          ? 0
                          : key === "width" ||
                              key === "height" ||
                              key === "thickness" ||
                              key === "toolDiameter" ||
                              key === "rapidFeed"
                            ? 0.001
                            : undefined
                      }
                      max={key === "rapidFeed" ? 1000000 : 100000}
                      aria-invalid={isInvalidStockField(
                        key,
                        settingsDraft.stock[key],
                      )}
                      onChange={(event) =>
                        updateDraftStock((current) => {
                          const value = Number(event.target.value) || 0;
                          if (key === "width") {
                            return resizeStockPreservingPinnedOrigin(
                              current,
                              value,
                              current.height,
                            );
                          }
                          if (key === "height") {
                            return resizeStockPreservingPinnedOrigin(
                              current,
                              current.width,
                              value,
                            );
                          }
                          return { ...current, [key]: value };
                        })
                      }
                    />
                      <small>{unit}</small>
                    </div>
                  </label>
                ))}
                <label>
                  <span>{t.stockZReference}</span>
                  <div>
                    <select
                      value={settingsDraft.stock.zZero ?? "auto"}
                      onChange={(event) =>
                        updateDraftStock((current) => ({
                          ...current,
                          zZero: event.target.value as NonNullable<
                            StockSettings["zZero"]
                          >,
                        }))
                      }
                    >
                      <option value="auto">{t.stockZAuto}</option>
                      <option value="top">{t.stockZTop}</option>
                      <option value="bottom">{t.stockZBottom}</option>
                    </select>
                    <small>Z0</small>
                  </div>
                  <em>{t.stockZReferenceHelp}</em>
                </label>
              </div>

              <details className="work-offset-settings">
                <summary>
                  <span>{t.workOffsetsTitle}</span>
                  <small>{t.workOffsetsBadge}</small>
                </summary>
                <div className="work-offset-settings__body">
                  <p>{t.workOffsetsDesc}</p>
                  <div className="work-offset-table-wrap">
                    <table aria-label={t.workOffsetsTableLabel}>
                      <thead>
                        <tr>
                          <th scope="col">WCS</th>
                          <th scope="col">X</th>
                          <th scope="col">Y</th>
                          <th scope="col">Z</th>
                        </tr>
                      </thead>
                      <tbody>
                        {WORK_COORDINATE_SYSTEMS.map((coordinateSystem) => (
                          <tr key={coordinateSystem}>
                            <th scope="row">
                              {coordinateSystem}
                              {coordinateSystem === "G54" ? (
                                <small>REF</small>
                              ) : null}
                            </th>
                            {(["x", "y", "z"] as const).map((axis) => (
                              <td key={axis}>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={workOffsetInputDraft[coordinateSystem][axis]}
                                  aria-label={`${coordinateSystem} ${axis.toUpperCase()}`}
                                  aria-invalid={
                                    parseWorkOffsetInput(
                                      workOffsetInputDraft[coordinateSystem][axis],
                                    ) === null
                                  }
                                  onChange={(event) =>
                                    updateDraftWorkOffset(
                                      coordinateSystem,
                                      axis,
                                      event.target.value,
                                    )
                                  }
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    className="ghost-button work-offset-settings__reset"
                    onClick={() => {
                      const zeroWorkOffsets = createZeroWorkspaceWorkOffsets();
                      setSettingsDraft((current) => ({
                        ...current,
                        workOffsets: zeroWorkOffsets,
                      }));
                      setWorkOffsetInputDraft(
                        createWorkOffsetInputDraft(zeroWorkOffsets),
                      );
                    }}
                  >
                    {t.workOffsetsReset}
                  </button>
                </div>
              </details>

              <section
                className="experimental-settings"
                aria-labelledby="experimental-settings-title"
              >
                <div className="experimental-settings__header">
                  <span className="experimental-settings__icon" aria-hidden="true">
                    <Icon name="cube" size={18} />
                  </span>
                  <div>
                    <strong id="experimental-settings-title">
                      {t.experimentalTitle}
                    </strong>
                    <p id="machine3d-experimental-description">
                      {t.machine3DDesc}
                    </p>
                  </div>
                  <span className="experimental-settings__badge">
                    {t.experimentalBadge}
                  </span>
                </div>
                <label className="experimental-toggle">
                  <span>
                    <strong>{t.machine3DTitle}</strong>
                    <small>
                      {machineViewEnabled
                        ? t.machine3DEnabled
                        : t.machine3DDisabled}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={machineViewEnabled}
                    onChange={(event) => toggleMachineView(event.target.checked)}
                    aria-label={t.machine3DTitle}
                    aria-describedby="machine3d-experimental-description"
                  />
                  <i className="experimental-toggle__switch" aria-hidden="true" />
                </label>
              </section>

              <div className="quick-origin-widget">
                <span className="quick-origin-title">
                  {t.quickOrigin}
                </span>
                <div className="quick-origin-grid">
                  {[
                    { id: "tl", x: 0, y: -settingsDraft.stock.height, title: "Top-Left" },
                    { id: "tc", x: -settingsDraft.stock.width / 2, y: -settingsDraft.stock.height, title: "Top-Center" },
                    { id: "tr", x: -settingsDraft.stock.width, y: -settingsDraft.stock.height, title: "Top-Right" },
                    { id: "c", x: -settingsDraft.stock.width / 2, y: -settingsDraft.stock.height / 2, title: "Center" },
                    { id: "bl", x: 0, y: 0, title: "Bottom-Left" },
                    { id: "bc", x: -settingsDraft.stock.width / 2, y: 0, title: "Bottom-Center" },
                    { id: "br", x: -settingsDraft.stock.width, y: 0, title: "Bottom-Right" },
                  ].map((preset) => {
                    const isActive = settingsDraft.stock.originX === preset.x && settingsDraft.stock.originY === preset.y;
                    return (
                      <button
                        key={preset.id}
                        className={isActive ? "is-active" : ""}
                        type="button"
                        title={preset.title}
                        aria-pressed={isActive}
                        onClick={() =>
                          updateDraftStock((current) => ({
                            ...current,
                            originX: preset.x,
                            originY: preset.y,
                          }))
                        }
                      >
                        <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ overflow: "visible" }}>
                          <rect x="15" y="15" width="70" height="70" fill="none" stroke="currentColor" strokeWidth="6" />
                          <circle cx="15" cy="15" r="10" fill={preset.id.includes('t') && preset.id.includes('l') ? "currentColor" : "#0d1317"} stroke="currentColor" strokeWidth="6" />
                          <circle cx="50" cy="15" r="10" fill={preset.id === 'tc' ? "currentColor" : "#0d1317"} stroke="currentColor" strokeWidth="6" />
                          <circle cx="85" cy="15" r="10" fill={preset.id.includes('t') && preset.id.includes('r') ? "currentColor" : "#0d1317"} stroke="currentColor" strokeWidth="6" />
                          <circle cx="15" cy="85" r="10" fill={preset.id.includes('b') && preset.id.includes('l') ? "currentColor" : "#0d1317"} stroke="currentColor" strokeWidth="6" />
                          <circle cx="50" cy="85" r="10" fill={preset.id === 'bc' ? "currentColor" : "#0d1317"} stroke="currentColor" strokeWidth="6" />
                          <circle cx="85" cy="85" r="10" fill={preset.id.includes('b') && preset.id.includes('r') ? "currentColor" : "#0d1317"} stroke="currentColor" strokeWidth="6" />
                          <circle cx="50" cy="50" r="10" fill={preset.id === 'c' ? "currentColor" : "#0d1317"} stroke="currentColor" strokeWidth="6" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="tool-library">
                <h3>{t.toolLibrary}</h3>
                <div className="tool-list">
                  {(settingsDraft.stock.tools || []).map((tool, index) => (
                    <div key={index} className="tool-item">
                      <label style={{ flex: 1 }}>
                        <span>{t.toolId}</span>
                        <div>
                          <input
                            type="text"
                            value={tool.id}
                            onChange={(e) => {
                              const newTools = [...(settingsDraft.stock.tools || [])];
                              newTools[index] = { ...tool, id: e.target.value };
                              updateDraftStock((current) => ({ ...current, tools: newTools }));
                            }}
                          />
                        </div>
                      </label>
                      <label style={{ flex: 1.5 }}>
                        <span>{t.toolType}</span>
                        <div>
                          <select
                            value={tool.type}
                            onChange={(e) => {
                              const newTools = [...(settingsDraft.stock.tools || [])];
                              const type = e.target.value as "flat" | "ball" | "vbit";
                              const nextTool = { ...tool, type };
                              if (type === "vbit") {
                                nextTool.angle = tool.angle ?? 90;
                                nextTool.tipDiameter = tool.tipDiameter ?? 0.2;
                              } else {
                                delete nextTool.angle;
                                delete nextTool.tipDiameter;
                              }
                              newTools[index] = nextTool;
                              updateDraftStock((current) => ({ ...current, tools: newTools }));
                            }}
                          >
                            <option value="flat">{t.typeFlat}</option>
                            <option value="ball">{t.typeBall}</option>
                            <option value="vbit">{t.typeVBit}</option>
                          </select>
                        </div>
                      </label>
                      <label style={{ flex: 1 }}>
                        <span>{t.lblToolDia}</span>
                        <div>
                          <input
                            type="number"
                            step="0.1"
                            value={tool.diameter}
                            onChange={(e) => {
                              const newTools = [...(settingsDraft.stock.tools || [])];
                              newTools[index] = { ...tool, diameter: Number(e.target.value) || 0 };
                              updateDraftStock((current) => ({ ...current, tools: newTools }));
                            }}
                          />
                          <small>mm</small>
                        </div>
                      </label>
                      {tool.type === "vbit" && (
                        <>
                          <label style={{ flex: 1 }}>
                            <span>{t.toolAngle}</span>
                            <div>
                              <input
                                type="number"
                                min="1"
                                max="179"
                                step="1"
                                value={tool.angle ?? 90}
                                onChange={(e) => {
                                  const newTools = [...(settingsDraft.stock.tools || [])];
                                  newTools[index] = { ...tool, angle: Number(e.target.value) || 90 };
                                  updateDraftStock((current) => ({ ...current, tools: newTools }));
                                }}
                              />
                              <small>°</small>
                            </div>
                          </label>
                          <label style={{ flex: 1 }}>
                            <span>{t.toolTipDiameter}</span>
                            <div>
                              <input
                                type="number"
                                min="0"
                                max={Math.max(0, tool.diameter - 0.01)}
                                step="0.01"
                                value={tool.tipDiameter ?? 0}
                                onChange={(e) => {
                                  const newTools = [...(settingsDraft.stock.tools || [])];
                                  newTools[index] = {
                                    ...tool,
                                    tipDiameter: Math.max(0, Number(e.target.value) || 0),
                                  };
                                  updateDraftStock((current) => ({ ...current, tools: newTools }));
                                }}
                              />
                              <small>mm</small>
                            </div>
                            <small className="tool-geometry-hint">
                              {t.toolVDepth}: {resolveVBitGeometry(tool).taperHeight.toFixed(2)} mm
                            </small>
                          </label>
                        </>
                      )}
                      <button
                        type="button"
                        className="btn-delete-tool"
                        title={t.deleteTool}
                        onClick={() => {
                          const newTools = [...(settingsDraft.stock.tools || [])];
                          newTools.splice(index, 1);
                          updateDraftStock((current) => ({ ...current, tools: newTools }));
                        }}
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="tool-library-actions">
                  <button
                    type="button"
                    className="ghost-button add-tool-button"
                    onClick={() => {
                      updateDraftStock((current) => ({
                        ...current,
                        tools: [
                          ...(current.tools || []),
                          {
                            id: `${(current.tools?.length || 0) + 1}`,
                            diameter: 6,
                            type: "flat",
                          },
                        ],
                      }));
                    }}
                    style={{ width: "100%", borderStyle: "dashed" }}
                  >
                    <Icon name="play" size={14} /> {t.addTool}
                  </button>

                  <button
                    type="button"
                    className="ghost-button add-tool-button"
                    onClick={() => {
                      updateDraftStock((current) => ({
                        ...current,
                        tools: [
                          ...(current.tools || []),
                          {
                            id: `${(current.tools?.length || 0) + 1}`,
                            diameter: 12.7,
                            type: "vbit",
                            angle: 90,
                            tipDiameter: 0.2,
                          },
                        ],
                      }));
                    }}
                    style={{ width: "100%", borderStyle: "dashed" }}
                  >
                    <Icon name="sparkles" size={14} /> {t.addVBit}
                  </button>
                  
                  <button
                    type="button"
                    className="ghost-button add-tool-button"
                    title="Phát hiện dao từ G-code"
                    onClick={() => {
                      const detected = new Set<string>();
                      simulation.segments.forEach(seg => {
                        if (seg.tool) detected.add(String(seg.tool));
                      });
                      
                      const newTools = [...(settingsDraft.stock.tools || [])];
                      let addedCount = 0;
                      
                      detected.forEach(tId => {
                        if (!newTools.find(t => String(t.id) === tId)) {
                          newTools.push({ id: tId, diameter: 6, type: "flat" });
                          addedCount++;
                        }
                      });
                      
                      if (addedCount > 0) {
                        updateDraftStock((current) => ({ ...current, tools: newTools }));
                      } else if (detected.size === 0) {
                        notify(t.noToolsDetectedMsg);
                      }
                    }}
                    style={{ width: "100%", borderStyle: "dashed", borderColor: "rgba(38, 217, 232, 0.4)", color: "var(--cyan)" }}
                  >
                    <Icon name="sparkles" size={14} /> {t.autoDetectTool}
                  </button>
                </div>
              </div>

              <div className="profile-note">
                <Icon name="info" size={20} />
                <p>
                  <b>Router Custom:</b> {t.routerNote}
                </p>
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  const defaults = createDefaultWorkspacePreferences();
                  setSettingsDraft(defaults);
                  setWorkOffsetInputDraft(
                    createWorkOffsetInputDraft(defaults.workOffsets),
                  );
                }}
              >
                {t.restoreDefault}
              </button>
              <button
                type="button"
                className="accent-button"
                onClick={applySettings}
              >
                {t.applyRecalc}
              </button>
            </div>
        </ResponsiveDialog>
      )}

      {editorOpen && (
        <ResponsiveDialog
          className="code-editor-modal"
          size="large"
          height="tall"
          titleId="code-editor-dialog-title"
          onClose={() => setEditorOpen(false)}
        >
            <div className="modal-header">
              <div>
                <small>{t.editorTitle}</small>
                <h2 id="code-editor-dialog-title">{fileName}</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                aria-label={lang === "EN" ? "Close" : "Đóng"}
              >
                <Icon name="close" />
              </button>
            </div>
            <textarea
              value={draftCode}
              onChange={(event) => setDraftCode(event.target.value)}
              spellCheck={false}
              aria-label={lang === "EN" ? "G-code content" : "Nội dung G-code"}
            />
            <div className="editor-help">
              <span>{t.editorHelp1}</span>
              <span>{t.editorHelp2}</span>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setDraftCode(SAMPLE_GCODE)}
              >
                {t.reloadSample}
              </button>
              <button
                type="button"
                className="accent-button"
                disabled={isPreparingProgram}
                onClick={async () => {
                  const rotated = await applyCode(draftCode);
                  if (rotated === null) return;
                  setEditorOpen(false);
                  notify(
                    rotated
                      ? (lang === "EN" ? "Re-parsed G-code and automatically rotated stock orientation." : "Đã dịch lại G-code và tự xoay chiều phôi cho đúng tọa độ.")
                      : (lang === "EN" ? "Re-parsed G-code and updated simulation." : "Đã dịch lại G-code và cập nhật mô phỏng."),
                  );
                }}
              >
                {t.parseSimulate}
              </button>
            </div>
        </ResponsiveDialog>
      )}

      {isGuideOpen && <UserGuideModal t={t} onClose={() => setIsGuideOpen(false)} />}

      {compareOpen && (
        <FileCompareModal 
          t={t} 
          currentCode={code} 
          onClose={() => setCompareOpen(false)} 
          onApply={(newCode) => {
            void applyCode(newCode).then((result) => {
              if (result === null) return;
              setCompareOpen(false);
              notify("Đã áp dụng thay đổi từ File Compare.");
            });
          }} 
        />
      )}
      
      {minicamOpen && (
        <MiniCamModal
          t={t}
          onClose={() => setMinicamOpen(false)}
          onGenerate={(generatedCode) => {
            const newCode = code ? `${code}\n${generatedCode}` : generatedCode;
            void applyCode(newCode).then((result) => {
              if (result === null) return;
              setMinicamOpen(false);
              notify("Đã sinh G-Code và chèn vào Editor.");
            });
          }}
        />
      )}

      {soundMenuOpen &&
        createPortal(
          <div
            ref={soundPopoverRef}
            className="sound-settings-popover is-viewport"
            id="sound-settings-popover"
            role="group"
            aria-label={lang === "EN" ? "Sound settings" : "Thiết lập âm thanh"}
            style={{ left: soundMenuPosition.left, top: soundMenuPosition.top }}
          >
            <label>
              <input
                type="checkbox"
                checked={machineSound}
                onChange={async (event) => {
                  const enabled = event.target.checked;
                  if (enabled && !(await ensureAudio())) {
                    setMachineSound(false);
                    notify(t.audioUnavailableMsg);
                    return;
                  }
                  setMachineSound(enabled);
                  if (!enabled) cncAudio.stopAll();
                }}
              />
              {t.machineSoundLabel}
            </label>
            <label>
              <input
                type="checkbox"
                checked={finishSound}
                onChange={async (event) => {
                  const enabled = event.target.checked;
                  if (enabled && !(await ensureAudio())) {
                    setFinishSound(false);
                    notify(t.audioUnavailableMsg);
                    return;
                  }
                  setFinishSound(enabled);
                }}
              />
              {t.finishSoundLabel}
            </label>
          </div>,
          document.body,
        )}

      {dragActive && (
        <div className="drop-overlay">
          <Icon name="upload" size={44} />
          <strong>{t.dropTitle}</strong>
          <span>{t.dropSub}</span>
        </div>
      )}

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </main>
  );
}

