"use client";

import {
  ChangeEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  cloneVec3 as cloneVec,
  distance2D as distance2,
  distance3D as distance3,
  lerpVec3 as lerpVec,
} from "@/core/geometry/line";
import {
  DEFAULT_STOCK,
  exportCAM,
  generateSmartResume,
  orientStockForProgram,
  parseProgram,
} from "@/core/simulation/studio-program";
import type {
  PostProcessorType,
  Segment,
  Simulation,
  StockSettings,
  StudioMachineProfile as MachineProfile,
  Vec3,
} from "@/core/simulation/types";
import { Lang, translations, translateDiagnostic, type TranslationDict } from "./i18n";
import { cncAudio } from "@/core/simulation/audio";
import { SolidSimulator } from "@/core/components/SolidSimulator";
import { UserGuideModal } from "@/core/components/UserGuideModal";

import { Icon } from "@/core/components/ui/Icon";
import { MetricCard } from "@/core/components/ui/MetricCard";
import { ToolbarButton } from "@/core/components/ui/ToolbarButton";
import { 
  ViewMode, 
  OrbitCamera, 
  getViewMeta, 
  pointOnSegment, 
  partialPoints, 
  formatTime, 
  formatLength, 
  motionLabel 
} from "@/core/utils/gcode-utils";

const EPSILON = 0.001;
const DEFAULT_ORBIT: OrbitCamera = {
  yaw: Math.PI / 4,
  pitch: Math.PI / 5.2,
};

const PLANE_GCODE = { XY: "G17", XZ: "G18", YZ: "G19" } as const;


function buildSampleProgram() {
  const panels = [
    [20, 20, 720, 380],
    [20, 420, 720, 360],
    [760, 20, 680, 380],
    [760, 420, 680, 360],
    [1460, 20, 600, 220],
    [1460, 260, 285, 200],
    [1755, 260, 305, 200],
    [2080, 20, 340, 1120],
    [1460, 480, 285, 260],
    [1755, 480, 305, 260],
    [1460, 760, 285, 380],
    [1755, 760, 305, 380],
  ];

  const lines = [
    "%",
    "(Lax's CNC - TU BEP CAN A-01)",
    "(PHOI 2440 X 1220 X 18)",
    "G90 G21 G17",
    "G54",
    "M33 S18000",
    "G600 T25",
    "M73",
    "G0 Z22.000",
  ];

  panels.forEach(([x, y, width, height], index) => {
    const x2 = x + width;
    const y2 = y + height;
    lines.push(
      `(P${String(index + 1).padStart(2, "0")} - ${width} X ${height})`,
      `G0 X${x.toFixed(3)} Y${y.toFixed(3)}`,
      "G1 Z7.000 F1000.0",
      `G1 X${x2.toFixed(3)} Y${y.toFixed(3)} F3200.0`,
      `G1 X${x2.toFixed(3)} Y${y2.toFixed(3)}`,
      `G1 X${x.toFixed(3)} Y${y2.toFixed(3)}`,
      `G1 X${x.toFixed(3)} Y${y.toFixed(3)}`,
      "G0 Z22.000",
    );
  });

  lines.push(
    "(KHOAN BAN LE)",
    "G81 X60.000 Y70.000 Z7.000 R22.000 F1000.0",
    "X700.000 Y70.000",
    "X60.000 Y350.000",
    "X700.000 Y350.000",
    "G80",
    "M83",
    "M5",
    "M30",
    "%",
  );

  return lines.join("\n");
}

const SAMPLE_GCODE = buildSampleProgram();







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
  t,
  onZoom,
  onPan,
  onOrbit,
  onResetView,
  resetTrigger,
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
  quality?: "low" | "medium" | "high";
  t: TranslationDict;
  onZoom: (zoom: number) => void;
  onPan: (pan: { x: number; y: number }) => void;
  onOrbit: (orbit: OrbitCamera) => void;
  onResetView: () => void;
  resetTrigger?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    yaw: number;
    pitch: number;
    mode: "pan" | "orbit";
  } | null>(null);
  const [size, setSize] = useState({ width: 900, height: 600 });
  const [showBounds, setShowBounds] = useState(true);
  const [showTool, setShowTool] = useState(true);
  const [showStock, setShowStock] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        setSize({
          width: Math.max(320, Math.round(rect.width)),
          height: Math.max(320, Math.round(rect.height)),
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
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    if (canvas.style.width !== `${size.width}px`) {
      canvas.style.width = `${size.width}px`;
    }
    if (canvas.style.height !== `${size.height}px`) {
      canvas.style.height = `${size.height}px`;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = size.width;
    const height = size.height;
    ctx.clearRect(0, 0, width, height);

    const originX = stock.originX;
    const originY = stock.originY;
    const originZ = 0;
    const stockBottomZ = originZ - stock.thickness;
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
      const zMin = Math.min(stockBottomZ, simulation.bounds.minZ);
      const zMax = Math.max(
        originZ,
        stock.safeZ,
        simulation.bounds.maxZ,
      );
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
        z: 0,
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
        if (filterKind === "rapid" && seg.kind !== "rapid") continue;
        if (filterKind === "cut" && (seg.kind === "rapid" || seg.kind === "drill")) continue;
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
      const isRapid = segment.kind === "rapid";
      const color = isRapid ? rapidColor : cutColor;

      if (!isRapid && active) {
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
      ctx.lineWidth = view === "iso" ? (active ? 2 : 1.25) : (active ? 2.2 : 1.45);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (isRapid) ctx.setLineDash([7, 5]);
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
  ]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
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
    dragRef.current = null;
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 0.87;
    onZoom(Math.max(0.15, Math.min(25, zoom * factor)));
  };

  const currentSegment =
    simulation.segments[Math.min(cursor, simulation.segments.length - 1)];
  const currentPosition = currentSegment
    ? pointOnSegment(currentSegment, segmentProgress)
    : { x: stock.originX, y: stock.originY, z: stock.safeZ };
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
      className={`canvas-frame${view === "iso" ? " is-3d" : ""}`}
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
        aria-label={`Tọa độ dao X ${currentPosition.x.toFixed(3)}, Y ${currentPosition.y.toFixed(3)}, Z ${currentPosition.z.toFixed(3)}`}
      >
        <span className={`telemetry-state${playing ? " is-running" : ""}`}>
          <i />
          {playing ? "RUN" : t.ready}
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
      {view === "solid" ? (
        <SolidSimulator 
          simulation={simulation} 
          stock={{ ...stock, toolDiameter: stock.toolDiameter || 6 }} 
          cursor={cursor} 
          segmentProgress={segmentProgress}
          showRapids={showRapids}
          showBounds={showBounds}
          showTool={showTool}
          showStock={showStock}
          showGrid={showGrid}
          resetTrigger={resetTrigger}
          onOrbitChange={onOrbit}
        />
      ) : (
        <canvas
          ref={canvasRef}
          aria-label={`Mô phỏng đường chạy dao CNC · ${getViewMeta(view, t).title}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
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
  const [lang, setLang] = useState<Lang>("VN");

  useEffect(() => {
    const saved = localStorage.getItem("lax_cnc_lang");
    if (saved === "EN" || saved === "VN") {
      setLang(saved);
    }
  }, []);

  const toggleLanguage = useCallback((newLang: Lang) => {
    setLang(newLang);
    localStorage.setItem("lax_cnc_lang", newLang);
  }, []);

  const t = translations[lang];
  const [view, setView] = useState<ViewMode>("xoy");
  const [cursor, setCursor] = useState(0);
  const [segmentProgress, setSegmentProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [orbit, setOrbit] = useState<OrbitCamera>({ ...DEFAULT_ORBIT });
  const [showRapids, setShowRapids] = useState(true);
  const [codeCollapsed, setCodeCollapsed] = useState(false);
  const [simulatorExpanded, setSimulatorExpanded] = useState(false);
  const [drawer, setDrawer] = useState<
    "diagnostics" | "parts" | "offcuts" | "resume" | "export" | null
  >(null);
  const [resumeSegment, setResumeSegment] = useState(5);
  const [resumeSafeZ, setResumeSafeZ] = useState(50);
  const [exportType, setExportType] = useState<PostProcessorType>("ncstudio");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [machineSound, setMachineSound] = useState(false);
  const [finishSound, setFinishSound] = useState(true);
  const [soundMenuOpen, setSoundMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const codeScrollRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<HTMLElement>(null);

  const simulation = useMemo(
    () => parseProgram(code, stock, profile),
    [code, stock, profile],
  );

  const errorCount = simulation.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;
  const warningCount = simulation.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  ).length;
  const activeSegment =
    simulation.segments[Math.min(cursor, Math.max(0, simulation.segments.length - 1))];
  const currentPosition = activeSegment
    ? pointOnSegment(activeSegment, segmentProgress)
    : { x: stock.originX, y: stock.originY, z: stock.safeZ };
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

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const resetPlayback = useCallback(() => {
    setPlaying(false);
    setCursor(0);
    setSegmentProgress(0);
    cncAudio.stopAll();
  }, []);

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
    if (nextView === "iso") setOrbit({ ...DEFAULT_ORBIT });
  }, []);

  const applyCode = useCallback(
    (nextCode: string, nextFileName?: string) => {
      const oriented = orientStockForProgram(nextCode, stock, profile);
      if (oriented.rotated) setStock(oriented.stock);
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
      return oriented.rotated;
    },
    [profile, resetPlayback, stock],
  );

  const readFile = useCallback(
    async (file: File) => {
      if (file.size > 8 * 1024 * 1024) {
        notify("File lớn hơn 8 MB. Hãy chia chương trình trước khi nhập.");
        return;
      }
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!extension || !["nc", "txt", "tap", "gcode", "cnc"].includes(extension)) {
        notify("Định dạng chưa hỗ trợ. Dùng .NC, .TXT, .TAP, .GCODE hoặc .CNC.");
        return;
      }
      const text = await file.text();
      const rotated = applyCode(text, file.name);
      notify(
        rotated
          ? `Đã đọc ${file.name} và tự xoay phôi sang ${stock.height.toFixed(0)} × ${stock.width.toFixed(0)} mm.`
          : `Đã đọc ${file.name} hoàn toàn trên trình duyệt.`,
      );
    },
    [applyCode, notify, stock.height, stock.width],
  );

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void readFile(file);
    event.target.value = "";
  };

  const seekToLine = useCallback(
    (lineIndex: number) => {
      const target = simulation.segments.findIndex(
        (segment) => segment.lineIndex >= lineIndex,
      );
      if (target >= 0) {
        setPlaying(false);
        setCursor(target);
        setSegmentProgress(0);
      }
      setDrawer(null);
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

  useEffect(() => {
    if (!playing || !simulation.segments.length) return;
    let animationFrame = 0;
    let previousTime = performance.now();
    const targetInterval = quality === "low" ? 33 : 16;

    const tick = (now: number) => {
      const delta = Math.min(80, now - previousTime);
      if (quality === "low" && delta < targetInterval) {
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
          if (cursor + stepsToAdvance >= simulation.segments.length - 1) {
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
    const activeLine = document.querySelector(
      `[data-code-line="${currentLine}"]`,
    );
    activeLine?.scrollIntoView({ block: "nearest" });
  }, [currentLine]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"
      ) {
        return;
      }
      if (event.code === "Space" || event.code === "F5") {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (event.code === "F10") {
        event.preventDefault();
        stepForward();
      } else if (event.code === "F8") {
        event.preventDefault();
        resetPlayback();
      } else if (event.code === "Digit1") {
        changeView("xoy");
      } else if (event.code === "Digit2") {
        changeView("iso");
      } else if (
        event.code === "Escape" &&
        simulatorExpanded &&
        !document.fullscreenElement
      ) {
        setSimulatorExpanded(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [changeView, resetPlayback, simulatorExpanded, stepForward]);

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
        setDragActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void readFile(file);
      }}
    >
      <header className="app-header">
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
              <span className="brand-accent">Lax's</span> CNC
            </span>
            <span className="brand-subtitle">
              <span className="status-dot" /> G-CODE WORKSTATION <span className="pro-badge">PRO</span>
            </span>
          </div>
        </div>
        <div className="header-divider" />
        <label className="project-field">
          <span>{t.projectLabel}</span>
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            aria-label={t.projectLabel}
          />
          <Icon name="edit" size={15} />
        </label>
        <div className="program-chip" title={fileName}>
          <span>PROGRAM</span>
          <strong>{fileName}</strong>
          <small>{simulation.lines.length} LINES</small>
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
        >
          <Icon name="upload" size={18} />
          <span>{t.importBtn}</span>
        </button>
        <button
          className="guide-button"
          type="button"
          onClick={() => setIsGuideOpen(true)}
          title={t.guideBtn}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
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
        <div className="header-spacer" />
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
      </header>

      <section className="command-bar">
        <div className="playback-controls">
          <button
            className="primary-control"
            type="button"
            onClick={() => {
              if (
                cursor >= simulation.segments.length - 1 &&
                segmentProgress >= 1
              ) {
                setCursor(0);
                setSegmentProgress(0);
              }
              setPlaying((value) => !value);
            }}
          >
            <Icon name={playing ? "pause" : "play"} size={20} />
            {playing ? "Pause" : "Play"}
          </button>
          <button className="secondary-control" type="button" onClick={stepForward}>
            <Icon name="step" size={19} />
            Step
          </button>
          <div style={{ position: "relative" }}>
            <button
              className={`secondary-control ${(machineSound || finishSound) ? "is-active" : ""}`}
              type="button"
              onClick={async () => {
                setSoundMenuOpen(!soundMenuOpen);
                await cncAudio.init();
              }}
            >
              <Icon name={(machineSound || finishSound) ? "volume" : "volume-x"} size={19} />
              Âm thanh
            </button>
            {soundMenuOpen && (
              <div className="sound-settings-popover">
                <label>
                  <input type="checkbox" checked={machineSound} onChange={async (e) => { 
                    setMachineSound(e.target.checked);
                    if (e.target.checked) await cncAudio.init();
                    else cncAudio.stopAll();
                  }} />
                  Âm thanh máy
                </label>
                <label>
                  <input type="checkbox" checked={finishSound} onChange={async (e) => { 
                    setFinishSound(e.target.checked);
                    if (e.target.checked) await cncAudio.init();
                  }} />
                  Âm kết thúc
                </label>
              </div>
            )}
          </div>
          <button
            className="secondary-control"
            type="button"
            onClick={resetPlayback}
          >
            <Icon name="reset" size={19} />
            Reset
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
        <div className="toolbar-divider" />
        <div className="view-switch" aria-label="Góc nhìn mô phỏng">
          {(["xoy", "solid"] as ViewMode[]).map((viewMode, index) => (
            <button
              type="button"
              className={view === viewMode ? "is-active" : ""}
              aria-pressed={view === viewMode}
              title={`${getViewMeta(viewMode, t).title} · phím ${index + 1}`}
              onClick={() => changeView(viewMode)}
              key={viewMode}
            >
              {viewMode === "iso" || viewMode === "solid" ? (
                <Icon name="cube" size={16} />
              ) : (
                <Icon name="panel" size={16} />
              )}
              <span>{getViewMeta(viewMode, t).short}</span>
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
        <label className="speed-control" style={{ marginLeft: 6 }}>
          <span>Cấu hình</span>
          <select
            value={quality}
            onChange={(event) =>
              setQuality(event.target.value as "low" | "medium" | "high")
            }
            title="Chế độ hiệu năng mô phỏng cho máy Yếu / Trung bình / Cao"
          >
            <option value="low">⚡ Máy Yếu</option>
            <option value="medium">⚖️ Trung bình</option>
            <option value="high">💎 Máy Cao</option>
          </select>
        </label>
        <div className="toolbar-spacer" />
        <div className="canvas-tools">
          <ToolbarButton
            icon="crosshair"
            label="Về gốc và vừa khung"
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
            icon="zoomOut"
            label="Thu nhỏ"
            onClick={() => setZoom((value) => Math.max(0.35, value / 1.18))}
          />
          <ToolbarButton
            icon="zoomIn"
            label="Phóng to"
            onClick={() => setZoom((value) => Math.min(6, value * 1.18))}
          />
          <ToolbarButton
            icon="panel"
            label="Phân tích & Tiện ích (Kích thước, Phôi dư, Smart Resume...)"
            onClick={() => setDrawer(drawer ? null : "diagnostics")}
            active={!!drawer}
          />
          <ToolbarButton
            icon="settings"
            label="Thiết lập phôi và máy"
            onClick={() => setSettingsOpen(true)}
          />
        </div>
      </section>

      <section
        className={`workspace${codeCollapsed ? " is-code-collapsed" : ""}`}
      >
        <aside className="code-panel">
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
                onClick={() => setCodeCollapsed(true)}
                aria-label="Thu gọn bảng G-code"
                title="Thu gọn bảng G-code"
              >
                <Icon name="panel" size={17} />
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
          <div className="code-lines" ref={codeScrollRef}>
            {simulation.lines.map((line, index) => (
              <button
                type="button"
                className={`code-line${index === currentLine ? " is-active" : ""}`}
                data-code-line={index}
                key={`${index}-${line}`}
                onClick={() => seekToLine(index)}
              >
                <span className="line-marker">
                  {index === currentLine ? "▶" : ""}
                </span>
                <span className="line-number">
                  {String(index + 1).padStart(4, "0")}
                </span>
                <code>{line ? syntaxLine(line) : " "}</code>
              </button>
            ))}
          </div>
          <div className="code-statusbar">
            <span>
              Dòng {currentLine + 1} / {simulation.lines.length}
            </span>
            <span className="code-mode-badges">
              <b>{simulation.finalState.absolute ? "G90 ABS" : "G91 INC"}</b>
              <b>{simulation.finalState.units === "mm" ? "G21 MM" : "G20 INCH"}</b>
              <b>{PLANE_GCODE[simulation.finalState.plane]} {simulation.finalState.plane}</b>
            </span>
          </div>
        </aside>

        <section className="simulation-panel">
          <div className="simulation-titlebar">
            <div className="simulation-heading">
              {codeCollapsed ? (
                <button
                  type="button"
                  onClick={() => setCodeCollapsed(false)}
                  className="show-code-button"
                  aria-label="Hiện bảng G-code"
                  title="Hiện bảng G-code"
                >
                  <Icon name="panel" size={15} />
                  <span>G-CODE</span>
                </button>
              ) : null}
              <span>{getViewMeta(view, t).title.toUpperCase()}</span>
              <strong className={`simulation-state${playing ? " is-running" : ""}`}>
                <i />
                {playing ? "LIVE" : "READY"}
              </strong>
              <small>
                BLOCK {activeSegment?.lineNumber ?? 0} · {simulation.segments.length}{" "}
                {lang === "EN" ? "moves" : "chuyển động"} · {simulation.parts.length} {lang === "EN" ? "parts" : "chi tiết"}
              </small>
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
          />
          <div className="scrubber">
            <span className="scrubber-clock">
              <small>ĐÃ CHẠY</small>
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
                {simulation.segments.length} MOVE
              </small>
            </span>
            <span className="scrubber-clock">
              <small>TỔNG</small>
              <strong>{formatTime(simulation.estimatedSeconds)}</strong>
            </span>
          </div>
        </section>
      </section>

      <section className="metrics-strip">
        <MetricCard
          icon="sheet"
          label="Phôi"
          detail={`Dày ${stock.thickness.toFixed(1)} mm · Gốc X${stock.originX} Y${stock.originY}`}
          onClick={() => setSettingsOpen(true)}
        >
          {stock.width.toFixed(0)} × {stock.height.toFixed(0)}
          <small> mm</small>
        </MetricCard>
        <MetricCard
          icon="tool"
          label="Dao"
          detail={`F${activeSegment?.feed.toFixed(0) ?? 0} · S${activeSegment?.spindle.toFixed(0) ?? 0}`}
        >
          {activeSegment?.tool === "—" ? simulation.finalState.tool : activeSegment?.tool}
          <small> · Ø{stock.toolDiameter} mm</small>
        </MetricCard>
        <MetricCard
          icon="route"
          label="Quãng cắt"
          detail={`Chạy nhanh ${formatLength(simulation.rapidLength)}`}
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
          <span>{t.currentPos}</span>
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
            <div className="progress-track">
              <i style={{ width: `${totalProgress}%` }} />
            </div>
            <strong>{totalProgress.toFixed(0)}%</strong>
          </div>
          <small className="progress-detail">
            BLOCK {activeSegment?.lineNumber ?? 0} ·{" "}
            {Math.min(cursor + 1, simulation.segments.length)}/
            {simulation.segments.length}
          </small>
        </div>
      </section>

      <footer className="machine-statebar">
        <span>
          <small>MODE</small>
          <b>{simulation.finalState.absolute ? "ABS · G90" : "INC · G91"}</b>
        </span>
        <span>
          <small>UNIT</small>
          <b>
            {simulation.finalState.units === "mm" ? "MM · G21" : "INCH · G20"}
          </b>
        </span>
        <span>
          <small>PLANE</small>
          <b>{simulation.finalState.plane} · {PLANE_GCODE[simulation.finalState.plane]}</b>
        </span>
        <span>
          <small>SPINDLE</small>
          <b>{activeSegment?.spindle || simulation.finalState.spindle || 0} RPM</b>
        </span>
        <span>
          <small>FEED</small>
          <b>F {activeSegment?.feed.toFixed(0) ?? 0}</b>
        </span>
        <span>
          <small>SAFE Z</small>
          <b>{stock.safeZ.toFixed(3)}</b>
        </span>
        <span>
          <small>DRILL</small>
          <b>{simulation.drillHoles} {lang === "EN" ? "HOLES" : "LỖ"}</b>
        </span>
        <span className="statebar-spacer" />
        <span className={`statebar-health${errorCount ? " has-error" : ""}`}>
          <i />
          <b>{errorCount ? "CHECK REQUIRED" : "PROGRAM OK"}</b>
        </span>
      </footer>

      {drawer && (
        <>
          <button
            className="drawer-backdrop"
            type="button"
            aria-label={lang === "EN" ? "Close analysis drawer" : "Đóng bảng phân tích"}
            onClick={() => setDrawer(null)}
          />
          <aside className="analysis-drawer" aria-label={lang === "EN" ? "Analysis results" : "Kết quả phân tích"}>
            <div className="drawer-header">
              <div>
                <small>{t.analysisTitle}</small>
                <h2>
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
            <div className="drawer-tabs">
              <button
                type="button"
                className={drawer === "diagnostics" ? "is-active" : ""}
                onClick={() => setDrawer("diagnostics")}
              >
                {lang === "EN" ? "Errors" : "Kiểm lỗi"} <span>{simulation.diagnostics.length}</span>
              </button>
              <button
                type="button"
                className={drawer === "parts" ? "is-active" : ""}
                onClick={() => setDrawer("parts")}
              >
                {lang === "EN" ? "Parts" : "Chi tiết"} <span>{simulation.parts.length}</span>
              </button>
              <button
                type="button"
                className={drawer === "offcuts" ? "is-active" : ""}
                onClick={() => setDrawer("offcuts")}
              >
                {lang === "EN" ? "Remnants" : "Phôi dư"} <span>{simulation.offcuts?.length ?? 0}</span>
              </button>
              <button
                type="button"
                className={drawer === "resume" ? "is-active" : ""}
                onClick={() => setDrawer("resume")}
              >
                {lang === "EN" ? "Resume" : "Phục hồi"}
              </button>
              <button
                type="button"
                className={drawer === "export" ? "is-active" : ""}
                onClick={() => setDrawer("export")}
              >
                {lang === "EN" ? "CAM Export" : "Xuất CAM"}
              </button>
            </div>
            <div className="drawer-content">
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
                          <small>{diagnostic.message}</small>
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
                    onClick={() => {
                      navigator.clipboard.writeText(generateSmartResume(simulation, resumeSegment, resumeSafeZ, lang));
                      alert(lang === "EN" ? "Recovery G-code copied to clipboard!" : "Đã sao chép đoạn G-code phục hồi vào Clipboard!");
                    }}
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
                      onClick={() => {
                        navigator.clipboard.writeText(exportCAM(simulation, exportType, projectName, lang));
                        alert(lang === "EN" ? "Exported G-code copied to clipboard!" : "Đã sao chép G-code đã xuất vào Clipboard!");
                      }}
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
        <div className="modal-layer" role="presentation">
          <button
            className="modal-backdrop"
            type="button"
            aria-label={lang === "EN" ? "Close settings" : "Đóng thiết lập"}
            onClick={() => setSettingsOpen(false)}
          />
          <section className="settings-modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <small>{t.machineProfile}</small>
                <h2>{t.stockToolTitle}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label={lang === "EN" ? "Close" : "Đóng"}
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="settings-grid">
              {[
                ["width", t.lblWidth, "mm"],
                ["height", t.lblHeight, "mm"],
                ["thickness", t.lblThickness, "mm"],
                ["toolDiameter", t.lblToolDia, "mm"],
                ["originX", t.lblOriginX, "mm"],
                ["originY", t.lblOriginY, "mm"],
                ["safeZ", t.lblSafeZ, "mm"],
                ["clearance", t.lblClearance, "mm"],
                ["rapidFeed", t.lblRapidFeed, "mm/min"],
              ].map(([key, label, unit]) => (
                <label key={key}>
                  <span>{label}</span>
                  <div>
                    <input
                      type="number"
                      step="0.1"
                      value={stock[key as keyof StockSettings]}
                      onChange={(event) =>
                        setStock((current) => ({
                          ...current,
                          [key]: Number(event.target.value) || 0,
                        }))
                      }
                    />
                    <small>{unit}</small>
                  </div>
                </label>
              ))}
            </div>
            <div className="profile-note">
              <Icon name="info" size={20} />
              <p>
                <b>Router Custom:</b> {t.routerNote}
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setStock(DEFAULT_STOCK)}
              >
                {t.restoreDefault}
              </button>
              <button
                type="button"
                className="accent-button"
                onClick={() => {
                  setSettingsOpen(false);
                  resetPlayback();
                  notify(lang === "EN" ? "Recalculated program with new machine settings." : "Đã tính lại toàn bộ chương trình theo cấu hình mới.");
                }}
              >
                {t.applyRecalc}
              </button>
            </div>
          </section>
        </div>
      )}

      {editorOpen && (
        <div className="modal-layer" role="presentation">
          <button
            className="modal-backdrop"
            type="button"
            aria-label={lang === "EN" ? "Close code editor" : "Đóng trình sửa code"}
            onClick={() => setEditorOpen(false)}
          />
          <section className="code-editor-modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <small>{t.editorTitle}</small>
                <h2>{fileName}</h2>
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
                onClick={() => {
                  const rotated = applyCode(draftCode);
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
          </section>
        </div>
      )}

      {dragActive && (
        <div className="drop-overlay">
          <Icon name="upload" size={44} />
          <strong>{t.dropTitle}</strong>
          <span>{t.dropSub}</span>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {isGuideOpen && <UserGuideModal t={t} onClose={() => setIsGuideOpen(false)} />}
    </main>
  );
}

