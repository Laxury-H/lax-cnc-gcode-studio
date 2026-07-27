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
} from "@/core/geometry/line";
import {
  DEFAULT_STOCK,
  orientStockForProgram,
  parseProgram,
} from "@/core/simulation/studio-program";
import type {
  Segment,
  Simulation,
  StockSettings,
  StudioMachineProfile as MachineProfile,
  Vec3,
} from "@/core/simulation/types";

type ViewMode = "xoy" | "xoz" | "yoz" | "iso";
type OrbitCamera = { yaw: number; pitch: number };

const EPSILON = 0.001;
const DEFAULT_ORBIT: OrbitCamera = {
  yaw: Math.PI / 4,
  pitch: Math.PI / 5.2,
};

const PLANE_GCODE = { XY: "G17", XZ: "G18", YZ: "G19" } as const;

const VIEW_META: Record<
  ViewMode,
  { short: string; title: string; description: string }
> = {
  xoy: {
    short: "XOY",
    title: "Mặt phẳng XOY",
    description: "Nhìn từ trên",
  },
  xoz: {
    short: "XOZ",
    title: "Mặt phẳng XOZ",
    description: "Nhìn chính diện · Z phóng đại",
  },
  yoz: {
    short: "YOZ",
    title: "Mặt phẳng YOZ",
    description: "Nhìn cạnh · Z phóng đại",
  },
  iso: {
    short: "3D",
    title: "3D Backplot",
    description: "Kéo để xoay · Shift+kéo để pan",
  },
};

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
    "(LAX CNC STUDIO - TU BEP CAN A-01)",
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

function pointOnSegment(segment: Segment, progress: number): Vec3 {
  const clamped = Math.max(0, Math.min(1, progress));
  if (segment.points.length <= 2) {
    return {
      x: segment.start.x + (segment.end.x - segment.start.x) * clamped,
      y: segment.start.y + (segment.end.y - segment.start.y) * clamped,
      z: segment.start.z + (segment.end.z - segment.start.z) * clamped,
    };
  }

  const total = segment.length || 1;
  let target = total * clamped;
  for (let index = 1; index < segment.points.length; index += 1) {
    const from = segment.points[index - 1];
    const to = segment.points[index];
    const length = distance3(from, to);
    if (target <= length || index === segment.points.length - 1) {
      const ratio = length <= EPSILON ? 0 : target / length;
      return {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
        z: from.z + (to.z - from.z) * ratio,
      };
    }
    target -= length;
  }
  return cloneVec(segment.end);
}

function partialPoints(segment: Segment, progress: number) {
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped >= 1) return segment.points;
  if (clamped <= 0) return [segment.start];
  const total = segment.length || 1;
  let remaining = total * clamped;
  const result = [segment.points[0]];
  for (let index = 1; index < segment.points.length; index += 1) {
    const from = segment.points[index - 1];
    const to = segment.points[index];
    const length = distance3(from, to);
    if (remaining >= length) {
      result.push(to);
      remaining -= length;
    } else {
      const ratio = length <= EPSILON ? 0 : remaining / length;
      result.push({
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
        z: from.z + (to.z - from.z) * ratio,
      });
      break;
    }
  }
  return result;
}

function formatTime(totalSeconds: number) {
  const rounded = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatLength(mm: number) {
  return mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${mm.toFixed(1)} mm`;
}

function motionLabel(segment: Segment | undefined) {
  if (!segment) return "CHƯA CÓ CHUYỂN ĐỘNG";
  if (segment.kind === "rapid") return "G0 · CHẠY NHANH";
  if (segment.kind === "cut") return "G1 · CẮT TUYẾN TÍNH";
  if (segment.kind === "arc-cw") return "G2 · CUNG TRÒN CW";
  if (segment.kind === "arc-ccw") return "G3 · CUNG TRÒN CCW";
  if (segment.kind === "dwell") return "G4 · TẠM DỪNG";
  return "CHU TRÌNH KHOAN";
}

function Icon({
  name,
  size = 20,
}: {
  name: string;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<string, ReactNode> = {
    play: <path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none" />,
    pause: (
      <>
        <path d="M9 5v14" />
        <path d="M15 5v14" />
      </>
    ),
    step: (
      <>
        <path d="m6 5 9 7-9 7Z" />
        <path d="M18 5v14" />
      </>
    ),
    reset: (
      <>
        <path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68" />
        <path d="M4 4v4.68h4.68" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 20h14" />
      </>
    ),
    cube: (
      <>
        <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z" />
        <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
      </>
    ),
    crosshair: (
      <>
        <circle cx="12" cy="12" r="7" />
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      </>
    ),
    fit: (
      <>
        <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
      </>
    ),
    zoomIn: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5M10.5 7.5v6M7.5 10.5h6" />
      </>
    ),
    zoomOut: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5M7.5 10.5h6" />
      </>
    ),
    hand: (
      <>
        <path d="M7 11V7a2 2 0 0 1 4 0v3-5a2 2 0 0 1 4 0v5-3a2 2 0 0 1 4 0v7c0 4-3 7-7 7h-1c-2.5 0-4-1-5.5-3L3 14.5a2 2 0 0 1 3-2.5Z" />
      </>
    ),
    ruler: (
      <>
        <path d="m4 17 13-13 3 3L7 20H4Z" />
        <path d="m14 7 3 3M11 10l2 2M8 13l3 3" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.1A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.38.36.72.65 1 .3.26.68.4 1.07.4H21v4h-.1A1.7 1.7 0 0 0 19.4 15Z" />
      </>
    ),
    sheet: (
      <>
        <path d="m3 9 9-5 9 5-9 5Z" />
        <path d="m3 13 9 5 9-5M3 17l9 5 9-5" />
      </>
    ),
    tool: (
      <>
        <path d="M9 3h6l-1 6h-4Z" />
        <path d="M10.5 9v10l1.5 2 1.5-2V9" />
        <path d="M10.5 12h3M10.5 16h3" />
      </>
    ),
    route: (
      <>
        <circle cx="5" cy="18" r="2" />
        <circle cx="19" cy="6" r="2" />
        <path d="M7 18c5 0 2-8 7-8h3" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16 9" />
      </>
    ),
    warning: (
      <>
        <path d="M12 3 2.5 20h19Z" />
        <path d="M12 9v5M12 17.5h.01" />
      </>
    ),
    edit: (
      <>
        <path d="m4 16-.8 4.8L8 20l11-11-4-4Z" />
        <path d="m13 7 4 4" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),
    panel: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16M5.5 8h1M5.5 12h1M5.5 16h1" />
      </>
    ),
    fullscreen: (
      <>
        <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
      </>
    ),
    collapse: (
      <>
        <path d="M8 8H3V3M16 8h5V3M8 16H3v5M16 16h5v5" />
        <path d="m3 3 6 6m12-6-6 6M3 21l6-6m12 6-6-6" />
      </>
    ),
  };

  return <svg {...common}>{paths[name] ?? paths.info}</svg>;
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
  onZoom,
  onPan,
  onOrbit,
  onResetView,
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
  onZoom: (zoom: number) => void;
  onPan: (pan: { x: number; y: number }) => void;
  onOrbit: (orbit: OrbitCamera) => void;
  onResetView: () => void;
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    ctx.fillStyle = "#0c1217";
    ctx.fillRect(0, 0, width, height);

    const originX = stock.originX;
    const originY = stock.originY;
    const originZ = 0;
    const stockBottomZ = originZ - stock.thickness;
    let project: (point: Vec3) => { x: number; y: number };
    let boardCorners: Array<{ x: number; y: number }> = [];
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
    const sideView = view === "xoz" || view === "yoz";

    if (view !== "iso") {
      const zMin = Math.min(stockBottomZ, simulation.bounds.minZ);
      const zMax = Math.max(
        originZ,
        stock.safeZ,
        simulation.bounds.maxZ,
      );
      const uMin =
        view === "yoz"
          ? Math.min(originY, simulation.bounds.minY)
          : Math.min(originX, simulation.bounds.minX);
      const uMax =
        view === "yoz"
          ? Math.max(originY + stock.height, simulation.bounds.maxY)
          : Math.max(originX + stock.width, simulation.bounds.maxX);
      const vMin =
        view === "xoy"
          ? Math.min(originY, simulation.bounds.minY)
          : zMin;
      const vMax =
        view === "xoy"
          ? Math.max(originY + stock.height, simulation.bounds.maxY)
          : zMax;
      const uSpan = Math.max(1, uMax - uMin);
      const vSpan = Math.max(1, vMax - vMin);
      const fitWidth = Math.max(160, width - 110);
      const fitHeight = Math.max(160, height - 110);

      if (sideView) {
        horizontalScale = (fitWidth / uSpan) * zoom;
        verticalScale = (fitHeight / vSpan) * zoom;
      } else {
        const uniformScale =
          Math.min(fitWidth / uSpan, fitHeight / vSpan) * zoom;
        horizontalScale = uniformScale;
        verticalScale = uniformScale;
      }
      scale = Math.min(horizontalScale, verticalScale);
      const left = (width - uSpan * horizontalScale) / 2 + pan.x;
      const top = (height - vSpan * verticalScale) / 2 + pan.y + 6;
      const readU = (point: Vec3) =>
        view === "yoz" ? point.y : point.x;
      const readV = (point: Vec3) =>
        view === "xoy" ? point.y : point.z;
      project = (point) => ({
        x: left + (readU(point) - uMin) * horizontalScale,
        y: top + (vMax - readV(point)) * verticalScale,
      });

      if (view === "xoy") {
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
      } else if (view === "xoz") {
        axisLabels = ["X", "Z"];
        boardCorners = [
          project({ x: originX, y: originY, z: originZ }),
          project({
            x: originX + stock.width,
            y: originY,
            z: originZ,
          }),
          project({ x: originX + stock.width, y: originY, z: stockBottomZ }),
          project({ x: originX, y: originY, z: stockBottomZ }),
        ];
      } else if (view === "yoz") {
        axisLabels = ["Y", "Z"];
        boardCorners = [
          project({ x: originX, y: originY, z: originZ }),
          project({
            x: originX,
            y: originY + stock.height,
            z: originZ,
          }),
          project({ x: originX, y: originY + stock.height, z: stockBottomZ }),
          project({ x: originX, y: originY, z: stockBottomZ }),
        ];
      }
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
          v: rotatedY * sinPitch - z * cosPitch,
          depth: rotatedY * cosPitch + z * sinPitch,
        };
      };
      const rotatePoint = (point: Vec3) =>
        rotateVector({
          x: point.x - center.x,
          y: point.y - center.y,
          z: point.z - center.z,
        });
      const fitPoints: Vec3[] = [];
      [xMin, xMax].forEach((x) => {
        [yMin, yMax].forEach((y) => {
          [zMin, zMax].forEach((z) => fitPoints.push({ x, y, z }));
        });
      });
      const rotatedFit = fitPoints.map(rotatePoint);
      const minU = Math.min(...rotatedFit.map((point) => point.u));
      const maxU = Math.max(...rotatedFit.map((point) => point.u));
      const minV = Math.min(...rotatedFit.map((point) => point.v));
      const maxV = Math.max(...rotatedFit.map((point) => point.v));
      const centerU = (minU + maxU) / 2;
      const centerV = (minV + maxV) / 2;
      const fitWidth = Math.max(180, width - 150);
      const fitHeight = Math.max(180, height - 130);
      scale =
        Math.min(
          fitWidth / Math.max(1, maxU - minU),
          fitHeight / Math.max(1, maxV - minV),
        ) * zoom;
      horizontalScale = scale;
      verticalScale = scale;
      project = (point) => {
        const rotated = rotatePoint(point);
        return {
          x: width / 2 + (rotated.u - centerU) * scale + pan.x,
          y: height / 2 + (rotated.v - centerV) * scale + pan.y,
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
      const stockBottom = stockTop.map((point) => ({
        ...point,
        z: stockBottomZ,
      }));
      boardCorners = stockTop.map(project);
      stockSideFaces = [
        {
          points: [stockTop[0], stockTop[1], stockBottom[1], stockBottom[0]],
          fill: "#4c555c",
        },
        {
          points: [stockTop[1], stockTop[2], stockBottom[2], stockBottom[1]],
          fill: "#3e474d",
        },
        {
          points: [stockTop[2], stockTop[3], stockBottom[3], stockBottom[2]],
          fill: "#465057",
        },
        {
          points: [stockTop[3], stockTop[0], stockBottom[0], stockBottom[3]],
          fill: "#596269",
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
          "rgba(190,205,214,.62)",
          0.8,
        );
      });
      drawPolygon(boardCorners, "#6f797f", "#c0cbd1", 1.15);
    } else if (shouldDrawStock) {
      drawPolygon(boardCorners, "#b9905d", "#d1a56b", 1.2);
    }

    if (shouldDrawStock) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(boardCorners[0].x, boardCorners[0].y);
      boardCorners.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.clip();

      const grainLines = view === "iso" ? 18 : sideView ? 14 : 32;
      for (let index = 0; index < grainLines; index += 1) {
        const ratio = (index + 0.5) / grainLines;
        const from =
          view === "xoz"
            ? project({
                x: originX,
                y: originY,
                z: -ratio * stock.thickness,
              })
            : view === "yoz"
              ? project({
                  x: originX,
                  y: originY,
                  z: -ratio * stock.thickness,
                })
              : project({
                  x: originX,
                  y: originY + ratio * stock.height,
                  z: originZ,
                });
        const to =
          view === "xoz"
            ? project({
                x: originX + stock.width,
                y: originY,
                z: -ratio * stock.thickness,
              })
            : view === "yoz"
              ? project({
                  x: originX,
                  y: originY + stock.height,
                  z: -ratio * stock.thickness,
                })
              : project({
                  x: originX + stock.width,
                  y: originY + ratio * stock.height,
                  z: originZ,
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
        ctx.strokeStyle =
          view === "iso"
            ? index % 3 === 0
              ? "rgba(11,21,27,.18)"
              : "rgba(235,244,248,.08)"
            : index % 3 === 0
              ? "rgba(66,38,18,.18)"
              : "rgba(255,232,191,.1)";
        ctx.lineWidth =
          view === "iso" ? 0.65 : index % 5 === 0 ? 1.2 : 0.65;
        ctx.stroke();
      }

      const gridStep = stock.width > 3000 ? 500 : 200;
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
      } else if (view === "xoz") {
        for (
          let x = Math.ceil(originX / gridStep) * gridStep;
          x <= originX + stock.width;
          x += gridStep
        ) {
          drawGridLine(
            { x, y: originY, z: stockBottomZ },
            { x, y: originY, z: originZ },
          );
        }
        for (
          let z = -Math.floor(stock.thickness / 5) * 5;
          z <= 0;
          z += 5
        ) {
          drawGridLine(
            { x: originX, y: originY, z },
            { x: originX + stock.width, y: originY, z },
            z === 0,
          );
        }
      } else if (view === "yoz") {
        for (
          let y = Math.ceil(originY / gridStep) * gridStep;
          y <= originY + stock.height;
          y += gridStep
        ) {
          drawGridLine(
            { x: originX, y, z: stockBottomZ },
            { x: originX, y, z: originZ },
          );
        }
        for (
          let z = -Math.floor(stock.thickness / 5) * 5;
          z <= 0;
          z += 5
        ) {
          drawGridLine(
            { x: originX, y: originY, z },
            { x: originX, y: originY + stock.height, z },
            z === 0,
          );
        }
      }
      ctx.restore();
    }

    if (view === "xoy") simulation.parts.forEach((part) => {
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

    const drawPath = (
      segment: Segment,
      points: Vec3[],
      alpha: number,
      active = false,
    ) => {
      if (points.length < 2) {
        if (segment.kind === "drill") {
          const point = project(segment.end);
          ctx.beginPath();
          ctx.arc(point.x, point.y, Math.max(3.5, stock.toolDiameter * scale * 0.5), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(174,103,255,${alpha})`;
          ctx.lineWidth = active ? 2.5 : 1.4;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(point.x - 4, point.y);
          ctx.lineTo(point.x + 4, point.y);
          ctx.moveTo(point.x, point.y - 4);
          ctx.lineTo(point.x, point.y + 4);
          ctx.stroke();
        }
        return;
      }
      const projected = points.map(project);
      const isRapid = segment.kind === "rapid";
      const color = isRapid
        ? "255,138,31"
        : view === "iso"
          ? "91,238,198"
          : "38,217,232";

      if (!isRapid && active) {
        ctx.beginPath();
        ctx.moveTo(projected[0].x, projected[0].y);
        projected.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.strokeStyle =
          view === "iso"
            ? `rgba(8,15,18,${Math.min(0.72, alpha * 0.72)})`
            : `rgba(38,217,232,${Math.min(0.16, alpha * 0.16)})`;
        ctx.lineWidth =
          view === "iso"
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
      ctx.lineWidth =
        view === "iso"
          ? active
            ? 2
            : isRapid
              ? 1
              : 1.25
          : active
            ? 2.2
            : isRapid
              ? 1.15
              : 1.45;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash(isRapid ? [7, 5] : []);
      ctx.stroke();
      ctx.setLineDash([]);

      if (
        !isRapid &&
        active &&
        distance2(segment.start, segment.end) > 140 &&
        projected.length >= 2
      ) {
        const midIndex = Math.floor(projected.length / 2);
        const before = projected[Math.max(0, midIndex - 1)];
        const at = projected[midIndex];
        const angle = Math.atan2(at.y - before.y, at.x - before.x);
        ctx.save();
        ctx.translate(at.x, at.y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(-4, -3.5);
        ctx.lineTo(-4, 3.5);
        ctx.closePath();
        ctx.fillStyle = `rgba(${color},${alpha})`;
        ctx.fill();
        ctx.restore();
      }
    };

    simulation.segments.forEach((segment, index) => {
      if (!showRapids && segment.kind === "rapid") return;
      const isFuture = index > cursor;
      const isCompleted = index < cursor;
      const isCurrent = index === cursor;
      if (isFuture) drawPath(segment, segment.points, 0.2);
      else if (isCompleted) drawPath(segment, segment.points, 0.88, true);
      else if (isCurrent) {
        drawPath(segment, segment.points, 0.22);
        drawPath(segment, partialPoints(segment, segmentProgress), 1, true);
      }
    });

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
      const horizontalDimension =
        view === "yoz" ? stock.height : stock.width;
      ctx.beginPath();
      ctx.moveTo(topLeft.x, dimY);
      ctx.lineTo(topRight.x, dimY);
      ctx.stroke();
      ctx.fillText(
        `${horizontalDimension.toFixed(0)} mm`,
        (topLeft.x + topRight.x) / 2,
        dimY - 4,
      );
      const verticalDimension =
        view === "xoy" ? stock.height : stock.thickness;
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
          (event.clientX - dragRef.current.x) * 0.009,
        pitch: Math.max(
          0.12,
          Math.min(
            1.42,
            dragRef.current.pitch -
              (event.clientY - dragRef.current.y) * 0.009,
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
    const factor = event.deltaY < 0 ? 1.12 : 0.89;
    onZoom(Math.max(0.35, Math.min(6, zoom * factor)));
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
          <b>{motionLabel(currentSegment)}</b>
          <small>
            BLOCK {currentSegment?.lineNumber ?? 0} · MOVE{" "}
            {Math.min(cursor + 1, simulation.segments.length)}/
            {simulation.segments.length}
          </small>
        </span>
        <code>{currentSegment?.raw.trim() || "—"}</code>
      </div>
      <div className="plane-badge" aria-hidden="true">
        <strong>{VIEW_META[view].short}</strong>
        <span>{VIEW_META[view].title}</span>
        <small>{VIEW_META[view].description}</small>
      </div>
      <div
        className="canvas-telemetry"
        aria-label={`Tọa độ dao X ${currentPosition.x.toFixed(3)}, Y ${currentPosition.y.toFixed(3)}, Z ${currentPosition.z.toFixed(3)}`}
      >
        <span className={`telemetry-state${playing ? " is-running" : ""}`}>
          <i />
          {playing ? "RUN" : "READY"}
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
      {view === "iso" && (
        <>
          <button
            type="button"
            className="orientation-widget"
            onClick={onResetView}
            aria-label="Đặt lại hướng camera 3D"
            title="Nhấn để đặt lại camera 3D"
          >
            <span className="cube-shell">
              <span
                className="cube-core"
                style={{
                  transform: `rotateX(${58 - (orbit.pitch * 180) / Math.PI}deg) rotateZ(${(orbit.yaw * 180) / Math.PI - 45}deg)`,
                }}
              >
                <i className="cube-face cube-front">X+</i>
                <i className="cube-face cube-back">X−</i>
                <i className="cube-face cube-right">Y+</i>
                <i className="cube-face cube-left">Y−</i>
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
              PHÔI
            </button>
            <button
              type="button"
              className={showTool ? "is-active" : ""}
              aria-pressed={showTool}
              onClick={() => setShowTool((value) => !value)}
            >
              DAO
            </button>
            <button
              type="button"
              className={showBounds ? "is-active" : ""}
              aria-pressed={showBounds}
              onClick={() => setShowBounds((value) => !value)}
            >
              KHUNG
            </button>
            <button
              type="button"
              className={showGrid ? "is-active" : ""}
              aria-pressed={showGrid}
              onClick={() => setShowGrid((value) => !value)}
            >
              LƯỚI
            </button>
            <button type="button" onClick={onResetView}>
              ĐẶT LẠI
            </button>
          </div>
          <div className="orbit-hint" aria-hidden="true">
            <span>Chuột trái: xoay</span>
            <span>Shift/chuột phải: pan</span>
            <span>Con lăn: zoom</span>
          </div>
        </>
      )}
      <canvas
        ref={canvasRef}
        aria-label={`Mô phỏng đường chạy dao CNC · ${VIEW_META[view].title}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={onResetView}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}

function MetricCard({
  icon,
  label,
  children,
  detail,
  tone,
  onClick,
}: {
  icon: string;
  label: string;
  children: ReactNode;
  detail?: ReactNode;
  tone?: "success" | "warning" | "danger";
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={`metric-card${tone ? ` is-${tone}` : ""}${onClick ? " is-clickable" : ""}`}
      onClick={onClick}
      type={onClick ? "button" : undefined}
    >
      <div className="metric-heading">
        <Icon name={icon} size={20} />
        <span>{label}</span>
      </div>
      <div className="metric-value">{children}</div>
      {detail && <div className="metric-detail">{detail}</div>}
    </Tag>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      className={`icon-button${active ? " is-active" : ""}`}
      onClick={onClick}
      aria-label={label}
      title={label}
      type="button"
    >
      <Icon name={icon} size={19} />
    </button>
  );
}

export default function Home() {
  const [code, setCode] = useState(SAMPLE_GCODE);
  const [draftCode, setDraftCode] = useState(SAMPLE_GCODE);
  const [fileName, setFileName] = useState("tu-bep-can-a01.nc");
  const [projectName, setProjectName] = useState("Tủ bếp căn A-01");
  const [stock, setStock] = useState(DEFAULT_STOCK);
  const [profile, setProfile] = useState<MachineProfile>("router-custom");
  const [view, setView] = useState<ViewMode>("xoy");
  const [cursor, setCursor] = useState(0);
  const [segmentProgress, setSegmentProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [orbit, setOrbit] = useState<OrbitCamera>({ ...DEFAULT_ORBIT });
  const [showRapids, setShowRapids] = useState(false);
  const [codeCollapsed, setCodeCollapsed] = useState(false);
  const [simulatorExpanded, setSimulatorExpanded] = useState(false);
  const [drawer, setDrawer] = useState<"diagnostics" | "parts" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
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
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setOrbit({ ...DEFAULT_ORBIT });
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

    const tick = (now: number) => {
      const delta = Math.min(80, now - previousTime);
      previousTime = now;
      const segment =
        simulation.segments[Math.min(cursor, simulation.segments.length - 1)];
      if (!segment) {
        setPlaying(false);
        return;
      }
      const nominalFeed =
        segment.kind === "rapid"
          ? stock.rapidFeed
          : Math.max(1, segment.feed || 1000);
      const realDuration = (segment.length / nominalFeed) * 60 * 1000;
      const displayDuration = Math.max(180, Math.min(1500, realDuration / speed));
      const increment = displayDuration > 0 ? delta / displayDuration : 1;

      setSegmentProgress((current) => {
        const next = current + increment;
        if (next >= 1) {
          if (cursor >= simulation.segments.length - 1) {
            setPlaying(false);
            return 1;
          }
          setCursor((index) => Math.min(index + 1, simulation.segments.length - 1));
          return 0;
        }
        return next;
      });
      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [
    playing,
    cursor,
    simulation.segments,
    speed,
    stock.rapidFeed,
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
        changeView("xoz");
      } else if (event.code === "Digit3") {
        changeView("yoz");
      } else if (event.code === "Digit4") {
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
        <div className="brand">
          <span className="brand-mark">
            <Icon name="crosshair" size={23} />
          </span>
          <span className="brand-copy">
            <b>LAX CNC STUDIO</b>
            <small>G-CODE WORKSTATION · PRO</small>
          </span>
        </div>
        <div className="header-divider" />
        <label className="project-field">
          <span>Dự án:</span>
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            aria-label="Tên dự án"
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
        >
          <Icon name="upload" size={18} />
          <span>Import .NC/.TXT</span>
        </button>
        <div className="header-spacer" />
        <label className="profile-select">
          <span className="visually-hidden">Hồ sơ máy</span>
          <select
            value={profile}
            onChange={(event) => {
              setProfile(event.target.value as MachineProfile);
              resetPlayback();
            }}
          >
            <option value="router-custom">Router 3 trục · Custom</option>
            <option value="iso">ISO / Fanuc cơ bản</option>
          </select>
        </label>
        <div className="connection-state">
          <span className="status-dot" />
          <span>
            <b>CNC-01</b>
            <small>Xử lý cục bộ</small>
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
          {(["xoy", "xoz", "yoz", "iso"] as ViewMode[]).map(
            (viewMode, index) => (
              <button
                type="button"
                className={view === viewMode ? "is-active" : ""}
                aria-pressed={view === viewMode}
                title={`${VIEW_META[viewMode].title} · phím ${index + 1}`}
                onClick={() => changeView(viewMode)}
                key={viewMode}
              >
                {viewMode === "iso" && <Icon name="cube" size={15} />}
                <span>{VIEW_META[viewMode].short}</span>
                <kbd>{index + 1}</kbd>
              </button>
            ),
          )}
        </div>
        <label className="speed-control">
          <span>Tốc độ</span>
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </label>
        <div className="toolbar-spacer" />
        <div className="canvas-tools">
          <ToolbarButton
            icon="panel"
            label={codeCollapsed ? "Hiện bảng G-code" : "Ẩn bảng G-code"}
            onClick={() => setCodeCollapsed((value) => !value)}
            active={codeCollapsed}
          />
          <ToolbarButton
            icon="crosshair"
            label="Về gốc và vừa khung"
            onClick={resetView}
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
            icon="hand"
            label={
              view === "iso"
                ? "Xoay và di chuyển góc nhìn 3D"
                : "Kéo để di chuyển bản vẽ"
            }
            onClick={() =>
              notify(
                view === "iso"
                  ? "Chuột trái để xoay; Shift hoặc chuột phải để pan."
                  : "Giữ và kéo trực tiếp trên vùng mô phỏng.",
              )
            }
          />
          <ToolbarButton
            icon="ruler"
            label="Kích thước và khoảng cách chi tiết"
            onClick={() => setDrawer("parts")}
            active={drawer === "parts"}
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
              <span>{VIEW_META[view].title.toUpperCase()}</span>
              <strong className={`simulation-state${playing ? " is-running" : ""}`}>
                <i />
                {playing ? "LIVE" : "READY"}
              </strong>
              <small>
                BLOCK {activeSegment?.lineNumber ?? 0} · {simulation.segments.length}{" "}
                chuyển động · {simulation.parts.length} chi tiết
              </small>
            </div>
            <div className="path-legend">
              <span>
                <i className="legend-line cut" /> Cắt
              </span>
              <button
                type="button"
                className={`rapid-toggle${showRapids ? " is-active" : ""}`}
                aria-pressed={showRapids}
                onClick={() => setShowRapids((value) => !value)}
                title="Ẩn hoặc hiện đường chạy nhanh G0"
              >
                <i className="legend-line rapid" /> Chạy nhanh
                <small>{showRapids ? "HIỆN" : "ẨN"}</small>
              </button>
              <span>
                <i className="legend-dot" /> Vị trí dao
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
            onZoom={setZoom}
            onPan={setPan}
            onOrbit={setOrbit}
            onResetView={resetView}
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
          label="Thời gian"
          detail={`Còn ${formatTime(simulation.estimatedSeconds * (1 - totalProgress / 100))}`}
        >
          {formatTime(simulation.estimatedSeconds)}
        </MetricCard>
        <MetricCard
          icon={errorCount ? "warning" : "check"}
          label="Lỗi"
          tone={errorCount ? "danger" : "success"}
          detail={errorCount ? "Cần xử lý" : "Không phát hiện"}
          onClick={() => setDrawer("diagnostics")}
        >
          {errorCount}
        </MetricCard>
        <MetricCard
          icon="warning"
          label="Cảnh báo"
          tone={warningCount ? "warning" : "success"}
          detail={warningCount ? "Nhấn để kiểm tra" : "An toàn"}
          onClick={() => setDrawer("diagnostics")}
        >
          {warningCount}
        </MetricCard>
        <div className="position-metric">
          <span>Vị trí hiện tại (mm)</span>
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
          <span>Tiến độ</span>
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
          <b>{simulation.drillHoles} LỖ</b>
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
            aria-label="Đóng bảng phân tích"
            onClick={() => setDrawer(null)}
          />
          <aside className="analysis-drawer" aria-label="Kết quả phân tích">
            <div className="drawer-header">
              <div>
                <small>PHÂN TÍCH CHƯƠNG TRÌNH</small>
                <h2>
                  {drawer === "diagnostics"
                    ? "Lỗi & cảnh báo"
                    : "Kích thước chi tiết"}
                </h2>
              </div>
              <button type="button" onClick={() => setDrawer(null)} aria-label="Đóng">
                <Icon name="close" />
              </button>
            </div>
            <div className="drawer-tabs">
              <button
                type="button"
                className={drawer === "diagnostics" ? "is-active" : ""}
                onClick={() => setDrawer("diagnostics")}
              >
                Kiểm lỗi <span>{simulation.diagnostics.length}</span>
              </button>
              <button
                type="button"
                className={drawer === "parts" ? "is-active" : ""}
                onClick={() => setDrawer("parts")}
              >
                Chi tiết <span>{simulation.parts.length}</span>
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
                        <span>
                          <b>
                            Dòng {diagnostic.lineIndex + 1} · {diagnostic.code}
                          </b>
                          <small>{diagnostic.message}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Icon name="check" size={38} />
                    <h3>Không phát hiện lỗi</h3>
                    <p>
                      Chương trình nằm trong giới hạn phôi và các trạng thái chính
                      đã hợp lệ.
                    </p>
                  </div>
                )
              ) : simulation.parts.length ? (
                <>
                  <div className="part-summary">
                    <div>
                      <small>Đã nhận diện</small>
                      <strong>{simulation.parts.length} chi tiết</strong>
                    </div>
                    <div>
                      <small>Khoảng cách yêu cầu</small>
                      <strong>{stock.clearance.toFixed(1)} mm</strong>
                    </div>
                  </div>
                  <div className="parts-table">
                    <div className="parts-table-head">
                      <span>Mã</span>
                      <span>Kích thước bao</span>
                      <span>Gần nhất</span>
                      <span>Mép phôi</span>
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
                    Với biên dạng bo góc có bù dao, kích thước thành phẩm được trừ
                    bán kính dao ở mỗi mép. Biên dạng lồng bên trong được xem là
                    lỗ/rãnh và không tính thành tấm riêng.
                  </p>
                </>
              ) : (
                <div className="empty-state">
                  <Icon name="ruler" size={38} />
                  <h3>Chưa tìm thấy đường bao kín</h3>
                  <p>
                    Hãy nhập chương trình có chuỗi G1/G2/G3 khép kín để đo chi tiết.
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
            aria-label="Đóng thiết lập"
            onClick={() => setSettingsOpen(false)}
          />
          <section className="settings-modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <small>HỒ SƠ MÁY</small>
                <h2>Phôi, dao và vùng an toàn</h2>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Đóng"
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="settings-grid">
              {[
                ["width", "Dài phôi", "mm"],
                ["height", "Rộng phôi", "mm"],
                ["thickness", "Dày phôi", "mm"],
                ["toolDiameter", "Đường kính dao", "mm"],
                ["originX", "Gốc phôi X", "mm"],
                ["originY", "Gốc phôi Y", "mm"],
                ["safeZ", "Z an toàn", "mm"],
                ["clearance", "Khoảng cách tối thiểu", "mm"],
                ["rapidFeed", "Tốc độ G0", "mm/min"],
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
                <b>Router Custom:</b> `M33 S…` được hiểu là bật spindle và `G600
                T…` là chọn dao. `M73/M83` được giữ như lệnh phụ trợ, không làm thay
                đổi hình học cho đến khi bạn cung cấp quy tắc máy chính xác.
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setStock(DEFAULT_STOCK)}
              >
                Khôi phục mặc định
              </button>
              <button
                type="button"
                className="accent-button"
                onClick={() => {
                  setSettingsOpen(false);
                  resetPlayback();
                  notify("Đã tính lại toàn bộ chương trình theo cấu hình mới.");
                }}
              >
                Áp dụng & tính lại
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
            aria-label="Đóng trình sửa code"
            onClick={() => setEditorOpen(false)}
          />
          <section className="code-editor-modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <small>TRÌNH SOẠN THẢO</small>
                <h2>{fileName}</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                aria-label="Đóng"
              >
                <Icon name="close" />
              </button>
            </div>
            <textarea
              value={draftCode}
              onChange={(event) => setDraftCode(event.target.value)}
              spellCheck={false}
              aria-label="Nội dung G-code"
            />
            <div className="editor-help">
              <span>Không cần dấu cách: N100G1X20Y30 vẫn đọc được.</span>
              <span>Space/F5: Play · F10: Step · F8: Reset</span>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setDraftCode(SAMPLE_GCODE)}
              >
                Nạp lại code mẫu
              </button>
              <button
                type="button"
                className="accent-button"
                onClick={() => {
                  const rotated = applyCode(draftCode);
                  setEditorOpen(false);
                  notify(
                    rotated
                      ? "Đã dịch lại G-code và tự xoay chiều phôi cho đúng tọa độ."
                      : "Đã dịch lại G-code và cập nhật mô phỏng.",
                  );
                }}
              >
                Dịch & mô phỏng
              </button>
            </div>
          </section>
        </div>
      )}

      {dragActive && (
        <div className="drop-overlay">
          <Icon name="upload" size={44} />
          <strong>Thả file G-code vào đây</strong>
          <span>.NC · .TXT · .TAP · .GCODE · .CNC</span>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

