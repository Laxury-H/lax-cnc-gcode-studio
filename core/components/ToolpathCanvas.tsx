import {
  Component,
  lazy,
  PointerEvent as ReactPointerEvent,
  type ReactNode,
  Suspense,
  WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ViewMode,
  OrbitCamera,
  getViewMeta,
  pointOnSegment,
  pointOnSegmentInTelemetryCoordinates,
  pointInProgramUnits,
  partialPoints,
  formatTime,
  motionLabel
} from "@/core/utils/gcode-utils";
import type { Segment, Simulation, StockSettings, Vec3 } from "@/core/simulation/types";
import { resolveStockZBounds } from "@/core/measurement/measurement-utils";
import {
  cutSurfaceColor,
  resolveSegmentTool,
} from "@/core/simulation/stock-removal-coordinates";
import { renderPerformanceProfile, shouldRenderFrame } from "@/core/simulation/render-performance";
import type { Lang, TranslationDict } from "@/app/i18n";
import type { SimulationQuality } from "@/core/ui/workspace-preferences";

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
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,248,229,.86)";
      ctx.strokeText(part.id, center.x, center.y - 6);
      ctx.fillStyle = "rgba(35,24,16,.94)";
      ctx.fillText(part.id, center.x, center.y - 6);
      ctx.font = `650 ${Math.max(9, Math.min(12, scale * 16))}px ui-monospace, monospace`;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "rgba(255,248,229,.82)";
      ctx.strokeText(
        `${Math.round(part.width)} × ${Math.round(part.height)}`,
        center.x,
        center.y + 10,
      );
      ctx.fillStyle = "rgba(48,31,19,.9)";
      ctx.fillText(
        `${Math.round(part.width)} × ${Math.round(part.height)}`,
        center.x,
        center.y + 10,
      );
    });

    const cutColor = "71,224,168";
    const activeCutColor = "255,240,166";
    const rapidColor = "255,173,85";

    const drawBatchedSegments = (
      segs: Segment[],
      filterKind: "rapid" | "cut" | "drill",
      color: string,
      alpha: number,
      lineWidth: number,
      isRapid = false,
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

      ctx.strokeStyle = `rgba(${color},${alpha})`;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (isRapid) ctx.setLineDash([7, 5]);
      ctx.stroke();
      if (isRapid) ctx.setLineDash([]);
    };

    const drawMaterialRemoval = (
      entries: Array<{ segment: Segment; points: Vec3[] }>,
    ) => {
      const groups = new Map<
        string,
        { color: string; diameter: number; entries: Array<{ segment: Segment; points: Vec3[] }> }
      >();
      const depthRange = Math.max(0.01, originZ - stockBottomZ);

      entries.forEach((entry) => {
        const { segment, points } = entry;
        if (
          points.length < 2 ||
          segment.machineCoordinates ||
          segment.kind === "rapid" ||
          segment.kind === "dwell" ||
          segment.spindleState === "off" ||
          segment.spindle <= 0
        ) {
          return;
        }
        let minimumZ = Number.POSITIVE_INFINITY;
        for (const point of points) {
          minimumZ = Math.min(minimumZ, point.z);
        }
        if (minimumZ >= originZ - 0.000001) return;
        const tool = resolveSegmentTool(stock, segment.tool) ?? {
          id: "fallback",
          diameter: stock.toolDiameter || 6,
          type: "flat" as const,
        };
        const depthRatio = Math.max(0, Math.min(1, (originZ - minimumZ) / depthRange));
        const depthBucket = Math.max(1, Math.round(depthRatio * 10));
        const bucketZ = originZ - (depthBucket / 10) * depthRange;
        const color = cutSurfaceColor(bucketZ, {
          topZ: originZ,
          bottomZ: stockBottomZ,
        });
        const key = `${tool.diameter.toFixed(4)}:${depthBucket}`;
        const group = groups.get(key) ?? {
          color,
          diameter: tool.diameter,
          entries: [],
        };
        group.entries.push(entry);
        groups.set(key, group);
      });

      groups.forEach((group) => {
        const toolWidth = Math.max(1.2, group.diameter * scale);
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        group.entries.forEach(({ segment, points }) => {
          if (segment.kind === "drill") {
            const end = project(points[points.length - 1]);
            ctx.moveTo(end.x + 0.01, end.y);
            ctx.arc(end.x, end.y, Math.max(0.5, toolWidth * 0.5), 0, Math.PI * 2);
            return;
          }
          const start = project(points[0]);
          ctx.moveTo(start.x, start.y);
          for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
            const point = project(points[pointIndex]);
            ctx.lineTo(point.x, point.y);
          }
        });
        ctx.strokeStyle = "rgba(58, 34, 19, 0.78)";
        ctx.lineWidth = toolWidth + 1.5;
        ctx.stroke();
        ctx.strokeStyle = group.color;
        ctx.lineWidth = Math.max(0.8, toolWidth - 0.8);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255, 221, 169, 0.2)";
        ctx.lineWidth = Math.max(0.55, toolWidth * 0.16);
        ctx.stroke();
        ctx.restore();
      });
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
      const color = isTravel ? rapidColor : active ? activeCutColor : cutColor;

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
    const currentSeg = simulation.segments[cursor];
    const currentPoints = currentSeg
      ? partialPoints(currentSeg, segmentProgress)
      : [];

    drawMaterialRemoval([
      ...completedSegs.map((segment) => ({ segment, points: segment.points })),
      ...(currentSeg ? [{ segment: currentSeg, points: currentPoints }] : []),
    ]);

    if (showRapids) {
      drawBatchedSegments(completedSegs, "rapid", rapidColor, 0.7, view === "iso" ? 1 : 1.15, true);
      drawBatchedSegments(futureSegs, "rapid", rapidColor, 0.2, view === "iso" ? 0.9 : 1, true);
    }
    drawBatchedSegments(completedSegs, "drill", "", 0.88, 1);
    drawBatchedSegments(futureSegs, "drill", "", 0.2, 1);

    drawBatchedSegments(completedSegs, "cut", cutColor, 0.92, view === "iso" ? 1.3 : 1.5);
    drawBatchedSegments(futureSegs, "cut", cutColor, 0.2, view === "iso" ? 0.9 : 1.1);

    if (currentSeg) {
      drawSingleSegmentDetail(currentSeg, currentSeg.points, 0.22);
      drawSingleSegmentDetail(currentSeg, currentPoints, 1, true);
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

export { ToolpathCanvas, loadSolidSimulatorModule, loadMachineSimulatorModule };
