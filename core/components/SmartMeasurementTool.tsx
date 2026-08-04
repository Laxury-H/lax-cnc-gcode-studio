import { Html, Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import type { Line2, LineSegments2 } from "three-stdlib";
import type {
  MeasurementConstraint,
  MeasurementPoint,
  MeasurementPreset,
  MeasurementResult,
  SnapCandidate,
  SnapKind,
} from "../measurement/measurement-utils";
import { constrainMeasurementPoint } from "../measurement/measurement-utils";
import { Icon } from "./ui/Icon";

const SNAP_COLORS: Record<SnapKind, string> = {
  corner: "#36d399",
  endpoint: "#26d9e8",
  midpoint: "#ffb347",
  center: "#b59cff",
  free: "#e8f0f2",
};

const SNAP_KIND_LABELS: Record<SnapKind, string> = {
  corner: "Góc",
  endpoint: "Đầu mút",
  midpoint: "Trung điểm",
  center: "Tâm",
  free: "Điểm tự do",
};

type SmartMeasurementOverlayProps = {
  candidates: readonly SnapCandidate[];
  planeZ: number;
  planeBounds: { minX: number; minY: number; maxX: number; maxY: number };
  markerSize: number;
  snapEnabled: boolean;
  constraint: MeasurementConstraint;
  unit: MeasurementUnit;
  start: SnapCandidate | null;
  result: MeasurementResult | null;
  onSelect: (candidate: SnapCandidate) => void;
  onHoverChange: (candidate: SnapCandidate | null) => void;
};

type PointerDownState = {
  pointerId: number;
  x: number;
  y: number;
  allowSelection: boolean;
};

function pointVector(point: { x: number; y: number; z: number }) {
  return new THREE.Vector3(point.x, point.y, point.z);
}

export type MeasurementUnit = "mm" | "in";

function unitSuffix(unit: MeasurementUnit) {
  return unit === "mm" ? "mm" : "in";
}

function formatMeasurementValue(value: number, unit: MeasurementUnit) {
  const converted = unit === "mm" ? value : value / 25.4;
  const precision = unit === "mm" ? 3 : 4;
  const epsilon = 0.5 * 10 ** -precision;
  return Math.abs(converted) < epsilon
    ? (0).toFixed(precision)
    : converted.toFixed(precision);
}

function coordinateLabel(
  point: MeasurementPoint,
  unit: MeasurementUnit,
  coordinateOffset: MeasurementPoint,
) {
  return `X ${formatMeasurementValue(point.x - coordinateOffset.x, unit)} · Y ${formatMeasurementValue(point.y - coordinateOffset.y, unit)} · Z ${formatMeasurementValue(point.z - coordinateOffset.z, unit)} ${unitSuffix(unit)}`;
}

function snapSelectionKey(candidate: SnapCandidate) {
  return `${candidate.id}:${candidate.point.x.toFixed(4)}:${candidate.point.y.toFixed(4)}:${candidate.point.z.toFixed(4)}`;
}

/**
 * Renders the interactive portion inside the CNC-coordinate group. Selection is
 * resolved on pointer-up so dragging, panning and touch gestures never create a
 * measurement point by accident.
 */
export function SmartMeasurementOverlay({
  candidates,
  planeZ,
  planeBounds,
  markerSize,
  snapEnabled,
  constraint,
  unit,
  start,
  result,
  onSelect,
  onHoverChange,
}: SmartMeasurementOverlayProps) {
  const groupRef = useRef<THREE.Group>(null);
  const markerRef = useRef<THREE.Group>(null);
  const markerMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const dynamicLineRef = useRef<Line2 | LineSegments2>(null);
  const hoverReportRef = useRef({ key: "", at: 0 });
  const pointerRef = useRef({ x: 0, y: 0, inside: false, dirty: true });
  const cameraSignatureRef = useRef<number[]>([]);
  const pointerDownRef = useRef<PointerDownState | null>(null);
  const activePointersRef = useRef(new Set<number>());
  const onSelectRef = useRef(onSelect);
  const onHoverChangeRef = useRef(onHoverChange);
  const { camera, gl } = useThree();

  useLayoutEffect(() => {
    onSelectRef.current = onSelect;
    onHoverChangeRef.current = onHoverChange;
  }, [onHoverChange, onSelect]);

  useEffect(() => {
    hoverReportRef.current = { key: "", at: 0 };
  }, [constraint, result, start]);

  const measurementMath = useMemo(
    () => ({
      localPlane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeZ),
      localIntersection: new THREE.Vector3(),
      ndc: new THREE.Vector2(),
      projectedPoint: new THREE.Vector3(),
      raycaster: new THREE.Raycaster(),
      worldIntersection: new THREE.Vector3(),
      worldPlane: new THREE.Plane(),
    }),
    [planeZ],
  );

  const hideHover = useCallback(() => {
    if (hoverReportRef.current.key) {
      hoverReportRef.current = { key: "", at: performance.now() };
      onHoverChangeRef.current(null);
    }
    if (markerRef.current) markerRef.current.visible = false;
    if (dynamicLineRef.current) dynamicLineRef.current.visible = false;
  }, []);

  const resolveSelection = useCallback((clientX: number, clientY: number) => {
    const group = groupRef.current;
    if (!group) return null;

    const rect = gl.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    group.updateWorldMatrix(true, false);
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const snapRadius = Math.max(22, Math.min(32, rect.width * 0.035));
    const snapRadiusSq = snapRadius * snapRadius;
    let closest: SnapCandidate | null = null;
    let closestDistanceSq = snapRadiusSq;
    let closestDepth = Number.POSITIVE_INFINITY;
    const { projectedPoint } = measurementMath;

    if (snapEnabled) {
      for (const candidate of candidates) {
        projectedPoint
          .set(candidate.point.x, candidate.point.y, candidate.point.z)
          .applyMatrix4(group.matrixWorld)
          .project(camera);
        if (projectedPoint.z < -1 || projectedPoint.z > 1) continue;

        const projectedX = (projectedPoint.x * 0.5 + 0.5) * rect.width;
        const projectedY = (-(projectedPoint.y * 0.5) + 0.5) * rect.height;
        const distanceSq =
          (projectedX - mouseX) ** 2 + (projectedY - mouseY) ** 2;
        const samePixelCluster = Math.abs(distanceSq - closestDistanceSq) <= 9;
        const clearlyCloser = distanceSq < closestDistanceSq - 9;
        const closerToCamera = projectedPoint.z < closestDepth - 0.002;
        const sameDepth = Math.abs(projectedPoint.z - closestDepth) <= 0.002;

        if (
          clearlyCloser ||
          (samePixelCluster &&
            (closerToCamera ||
              (sameDepth && candidate.priority > (closest?.priority ?? -1))))
        ) {
          closest = candidate;
          closestDistanceSq = distanceSq;
          closestDepth = projectedPoint.z;
        }
      }
    }

    if (closest) return closest;

    const {
      localPlane,
      localIntersection,
      ndc,
      raycaster,
      worldIntersection,
      worldPlane,
    } = measurementMath;
    ndc.set(
      (mouseX / rect.width) * 2 - 1,
      -(mouseY / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    worldPlane.copy(localPlane).applyMatrix4(group.matrixWorld);
    if (!raycaster.ray.intersectPlane(worldPlane, worldIntersection)) return null;

    group.worldToLocal(localIntersection.copy(worldIntersection));
    if (
      localIntersection.x < planeBounds.minX ||
      localIntersection.x > planeBounds.maxX ||
      localIntersection.y < planeBounds.minY ||
      localIntersection.y > planeBounds.maxY
    ) {
      return null;
    }
    const point = {
      x: localIntersection.x,
      y: localIntersection.y,
      z: localIntersection.z,
    };
    return {
      id: `free:${point.x.toFixed(4)}:${point.y.toFixed(4)}:${point.z.toFixed(4)}`,
      point,
      kind: "free" as const,
      label: `Điểm tự do · Mặt Z ${planeZ.toFixed(3)}`,
      priority: 0,
    };
  }, [
    camera,
    candidates,
    gl.domElement,
    measurementMath,
    planeBounds.maxX,
    planeBounds.maxY,
    planeBounds.minX,
    planeBounds.minY,
    planeZ,
    snapEnabled,
  ]);

  const showSelection = useCallback((selection: SnapCandidate | null) => {
    if (!selection) {
      hideHover();
      return;
    }

    const effectivePoint = start
      ? constrainMeasurementPoint(start.point, selection.point, constraint)
      : selection.point;
    const effectiveSelection =
      effectivePoint === selection.point
        ? selection
        : { ...selection, point: effectivePoint };
    if (markerRef.current) {
      markerRef.current.position.set(
        effectivePoint.x,
        effectivePoint.y,
        effectivePoint.z,
      );
      markerRef.current.visible = true;
    }
    markerMaterialRef.current?.color.set(SNAP_COLORS[selection.kind]);

    const key = snapSelectionKey(effectiveSelection);
    if (key !== hoverReportRef.current.key) {
      const now = performance.now();
      const isStableSnap = selection.kind !== "free";
      if (
        isStableSnap ||
        now - hoverReportRef.current.at >= 60 ||
        !hoverReportRef.current.key
      ) {
        hoverReportRef.current = { key, at: now };
        onHoverChangeRef.current(effectiveSelection);
      }
    }

    const dynamicLine = dynamicLineRef.current;
    if (dynamicLine && start) {
      dynamicLine.geometry.setPositions([
        start.point.x,
        start.point.y,
        start.point.z,
        effectivePoint.x,
        effectivePoint.y,
        effectivePoint.z,
      ]);
      dynamicLine.computeLineDistances();
      dynamicLine.visible = true;
    } else if (dynamicLine) {
      dynamicLine.visible = false;
    }
  }, [constraint, hideHover, start]);

  useEffect(() => {
    const canvas = gl.domElement;
    const activePointers = activePointersRef.current;
    const updatePointer = (event: PointerEvent) => {
      pointerRef.current = {
        x: event.clientX,
        y: event.clientY,
        inside: true,
        dirty: true,
      };
    };
    const handlePointerEnter = (event: PointerEvent) => updatePointer(event);
    const handlePointerMove = (event: PointerEvent) => {
      updatePointer(event);
      const down = pointerDownRef.current;
      if (
        down &&
        Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6
      ) {
        down.allowSelection = false;
      }
    };
    const handlePointerLeave = () => {
      pointerRef.current.inside = false;
      hideHover();
    };
    const handlePointerDown = (event: PointerEvent) => {
      updatePointer(event);
      activePointers.add(event.pointerId);
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Some synthetic pointer sources do not support capture.
      }
      if (activePointers.size > 1) {
        pointerDownRef.current = null;
        return;
      }
      pointerDownRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        allowSelection:
          event.button === 0 &&
          event.isPrimary &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey,
      };
    };
    const finishPointer = (event: PointerEvent, cancelled: boolean) => {
      const down = pointerDownRef.current;
      const isOnlyPointer = activePointers.size === 1;
      activePointers.delete(event.pointerId);
      pointerDownRef.current = null;
      try {
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
      } catch {
        // The browser may already have released capture on cancellation.
      }
      if (
        cancelled ||
        (result && !start) ||
        !down ||
        down.pointerId !== event.pointerId ||
        !down.allowSelection ||
        !isOnlyPointer ||
        Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6
      ) {
        return;
      }

      const selection = resolveSelection(event.clientX, event.clientY);
      if (selection) {
        showSelection(selection);
        onSelectRef.current(selection);
      }
    };
    const handlePointerUp = (event: PointerEvent) => finishPointer(event, false);
    const handlePointerCancel = (event: PointerEvent) => finishPointer(event, true);
    const handleLostPointerCapture = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      if (pointerDownRef.current?.pointerId === event.pointerId) {
        pointerDownRef.current = null;
      }
    };

    canvas.addEventListener("pointerenter", handlePointerEnter);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);
    canvas.addEventListener("lostpointercapture", handleLostPointerCapture);
    return () => {
      canvas.removeEventListener("pointerenter", handlePointerEnter);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      canvas.removeEventListener("lostpointercapture", handleLostPointerCapture);
      activePointers.clear();
      hideHover();
    };
  }, [gl.domElement, hideHover, resolveSelection, result, showSelection, start]);

  useEffect(() => {
    pointerRef.current.dirty = true;
  }, [resolveSelection, showSelection]);

  useFrame(() => {
    if (result && !start) {
      hideHover();
      return;
    }
    const pointer = pointerRef.current;
    if (!pointer.inside) return;
    const signature = [
      ...camera.matrixWorld.elements,
      ...camera.projectionMatrix.elements,
    ];
    const previousSignature = cameraSignatureRef.current;
    const cameraChanged =
      signature.length !== previousSignature.length ||
      signature.some(
        (value, index) =>
          Math.abs(value - (previousSignature[index] ?? Number.NaN)) > 1e-8,
      );
    if (!pointer.dirty && !cameraChanged) return;
    pointer.dirty = false;
    if (cameraChanged) cameraSignatureRef.current = signature;
    showSelection(resolveSelection(pointer.x, pointer.y));
  });

  const startVector = start ? pointVector(start.point) : null;
  const resultStart = result ? pointVector(result.start) : null;
  const resultEnd = result ? pointVector(result.end) : null;
  const resultMidpoint = resultStart && resultEnd
    ? resultStart.clone().add(resultEnd).multiplyScalar(0.5)
    : null;

  return (
    <group ref={groupRef}>
      <group ref={markerRef} visible={false}>
        <mesh>
          <ringGeometry args={[markerSize * 0.75, markerSize * 1.2, 28]} />
          <meshBasicMaterial
            ref={markerMaterialRef}
            color={SNAP_COLORS.endpoint}
            depthTest={false}
            side={THREE.DoubleSide}
            transparent
            opacity={0.95}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[markerSize * 0.26, 12, 12]} />
          <meshBasicMaterial color="#ffffff" depthTest={false} />
        </mesh>
      </group>

      {startVector ? (
        <mesh position={startVector}>
          <sphereGeometry args={[markerSize * 0.58, 16, 16]} />
          <meshBasicMaterial color="#ffca57" depthTest={false} />
        </mesh>
      ) : null}

      <Line
        ref={dynamicLineRef}
        points={[new THREE.Vector3(), new THREE.Vector3()]}
        color="#ffca57"
        lineWidth={2.5}
        dashed
        dashSize={5}
        gapSize={3}
        depthTest={false}
        transparent
        visible={false}
      />

      {result && resultStart && resultEnd && resultMidpoint ? (
        <>
          <Line
            points={[resultStart, resultEnd]}
            color="#26d9e8"
            lineWidth={3.5}
            depthTest={false}
            transparent
          />
          {[resultStart, resultEnd].map((point, index) => (
            <mesh position={point} key={index}>
              <sphereGeometry args={[markerSize * 0.56, 16, 16]} />
              <meshBasicMaterial color="#26d9e8" depthTest={false} />
            </mesh>
          ))}
          <Html
            position={resultMidpoint}
            center
            zIndexRange={[115, 20]}
            style={{ pointerEvents: "none" }}
          >
            <div className="measurement-world-label">
              <strong>
                {formatMeasurementValue(result.distance, unit)} {unitSuffix(unit)}
              </strong>
            </div>
          </Html>
        </>
      ) : null}
    </group>
  );
}

type MeasurementPanelProps = {
  candidateCount: number;
  coordinateOffset: MeasurementPoint;
  coordinateSystem: string;
  hovered: SnapCandidate | null;
  start: SnapCandidate | null;
  result: MeasurementResult | null;
  history: readonly MeasurementResult[];
  presets: readonly MeasurementPreset[];
  snapEnabled: boolean;
  constraint: MeasurementConstraint;
  unit: MeasurementUnit;
  onToggleSnap: () => void;
  onConstraintChange: (constraint: MeasurementConstraint) => void;
  onToggleUnit: () => void;
  onSetDatum: () => void;
  onNew: () => void;
  onUndo: () => void;
  onPreset: (preset: MeasurementPreset) => void;
  onHistorySelect: (result: MeasurementResult) => void;
  onHistoryClear: () => void;
  onClose: () => void;
};

const CONSTRAINT_OPTIONS: readonly {
  value: MeasurementConstraint;
  label: string;
  shortcut: string;
  title: string;
}[] = [
  {
    value: "free",
    label: "Tự do",
    shortcut: "F",
    title: "Đo khoảng cách 3D tự do (F)",
  },
  {
    value: "x",
    label: "Dọc X",
    shortcut: "X",
    title: "Đo dọc trục X; giữ Y và Z theo điểm A (X)",
  },
  {
    value: "y",
    label: "Dọc Y",
    shortcut: "Y",
    title: "Đo dọc trục Y; giữ X và Z theo điểm A (Y)",
  },
  {
    value: "z",
    label: "Dọc Z",
    shortcut: "Z",
    title: "Đo dọc trục Z; giữ X và Y theo điểm A (Z)",
  },
  {
    value: "xy",
    label: "Mặt XY",
    shortcut: "P",
    title: "Đo trên mặt phẳng XY; giữ Z theo điểm A (P)",
  },
];

function formatAngle(value: number) {
  return `${Math.abs(value) < 0.005 ? "0.00" : value.toFixed(2)}°`;
}

export function MeasurementPanel({
  candidateCount,
  coordinateOffset,
  coordinateSystem,
  hovered,
  start,
  result,
  history,
  presets,
  snapEnabled,
  constraint,
  unit,
  onToggleSnap,
  onConstraintChange,
  onToggleUnit,
  onSetDatum,
  onNew,
  onUndo,
  onPreset,
  onHistorySelect,
  onHistoryClear,
  onClose,
}: MeasurementPanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [openDisclosure, setOpenDisclosure] = useState<
    "history" | "quick" | null
  >(null);

  const resultCopyKey = result ? `${result.id}:${unit}` : null;
  const copied = Boolean(resultCopyKey && copiedKey === resultCopyKey);

  useEffect(() => {
    if (!copiedKey) return;
    const timeout = window.setTimeout(() => setCopiedKey(null), 1600);
    return () => window.clearTimeout(timeout);
  }, [copiedKey]);

  const copyResult = async () => {
    if (!result || !navigator.clipboard) return;
    const summary = [
      `${result.label}: ${formatMeasurementValue(result.distance, unit)} ${unitSuffix(unit)}`,
      `A: ${coordinateLabel(result.start, unit, coordinateOffset)}`,
      `B: ${coordinateLabel(result.end, unit, coordinateOffset)}`,
      `ΔX ${formatMeasurementValue(result.delta.x, unit)} · ΔY ${formatMeasurementValue(result.delta.y, unit)} · ΔZ ${formatMeasurementValue(result.delta.z, unit)} ${unitSuffix(unit)}`,
      `Góc XY ${formatAngle(result.angleXYDegrees)} · Độ dốc ${formatAngle(result.inclinationDegrees)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      setCopiedKey(resultCopyKey);
    } catch {
      setCopiedKey(null);
    }
  };

  const firstStepState = result || start ? " is-done" : " is-current";
  const secondStepState = result ? " is-done" : start ? " is-current" : "";
  const stage = result ? "XONG" : start ? "CHỌN B" : "CHỌN A";
  const panelState = result
    ? "is-complete"
    : start
      ? "is-waiting-b"
      : "is-waiting-a";
  const livePoint = result?.end ?? hovered?.point ?? null;
  const liveKind = result
    ? "Điểm B"
    : hovered
      ? SNAP_KIND_LABELS[hovered.kind]
      : "Chưa bắt điểm";
  const liveLabel = result
    ? result.label
    : hovered?.label ?? "Di chuột lên hình học để bắt điểm";

  return (
    <aside
      className={`measurement-panel ${panelState}`}
      aria-label="Công cụ đo thông minh 3D"
      onPointerDown={(event) => event.stopPropagation()}
    >
        <header className="measurement-panel__header">
          <span className="measurement-panel__icon">
            <Icon name="ruler" size={17} />
          </span>
          <span className="measurement-panel__title">
            <strong>ĐO 3D CNC</strong>
            <small>Bắt hình học · khóa hướng · tọa độ {coordinateSystem}</small>
          </span>
          <span className="measurement-stage-badge">{stage}</span>
          <button
            type="button"
            className="measurement-unit-toggle"
            onClick={onToggleUnit}
            aria-label={`Đổi sang ${unit === "mm" ? "inch" : "milimét"}`}
            title="Đổi đơn vị hiển thị; dữ liệu CNC luôn giữ nguyên theo mm"
          >
            {unit.toUpperCase()}
          </button>
          <button
            type="button"
            className="measurement-close"
            onClick={onClose}
            aria-label="Đóng công cụ đo"
            title="Đóng công cụ đo"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="measurement-panel__body">
          <section className="measurement-live-snap" aria-label="Điểm bắt hiện tại">
            <div className="measurement-live-snap__meta">
              <span data-kind={result ? "result" : hovered?.kind ?? "none"}>
                <i />
                <strong>{liveKind}</strong>
                <small>{liveLabel}</small>
              </span>
              <b title="Hệ tọa độ lập trình đang hoạt động ở cuối chương trình">
                {coordinateSystem}
              </b>
            </div>
            <div className="measurement-live-snap__coordinates">
              {(["x", "y", "z"] as const).map((axis) => (
                <span key={axis}>
                  <small>{axis.toUpperCase()}</small>
                  <b>
                    {livePoint
                      ? formatMeasurementValue(
                          livePoint[axis] - coordinateOffset[axis],
                          unit,
                        )
                      : "—"}
                  </b>
                </span>
              ))}
              <em>{unitSuffix(unit)}</em>
            </div>
          </section>

          <div className="measurement-steps" aria-label="Tiến trình đo">
            <span className={`measurement-step${firstStepState}`}>
              <i>{result || start ? "✓" : "A"}</i>
              <b>Chọn điểm A</b>
            </span>
            <i className="measurement-step-connector" />
            <span className={`measurement-step${secondStepState}`}>
              <i>{result ? "✓" : "B"}</i>
              <b>Chọn điểm B</b>
            </span>
          </div>

          <div className="measurement-toolbar">
            <button
              type="button"
              className={`measurement-snap-toggle${snapEnabled ? " is-active" : ""}`}
              aria-pressed={snapEnabled}
              onClick={onToggleSnap}
            >
              <Icon name="crosshair" size={14} />
              <span>Bắt điểm</span>
              <b>{snapEnabled ? "ON" : "OFF"}</b>
            </button>
            <button
              type="button"
              className="measurement-new-button"
              onClick={start || result ? onUndo : onNew}
            >
              <Icon name="reset" size={13} />
              {start || result ? "Hoàn tác" : "Đo mới"}
            </button>
          </div>

          {!result ? (
            <div className="measurement-reference">
              <button
                type="button"
                className="measurement-datum-button"
                onClick={onSetDatum}
                title={`Dùng X0 Y0 Z0 đang lập trình trong ${coordinateSystem} làm điểm A; bao gồm các bù tọa độ đang hoạt động`}
              >
                <Icon name="crosshair" size={13} />
                <span>A = X0 Y0 Z0</span>
                <code>{coordinateSystem}</code>
              </button>
              {start ? (
                <div className="measurement-axis-lock" aria-label="Khóa hướng đo">
                  {CONSTRAINT_OPTIONS.map((option) => (
                    <button
                      type="button"
                      className={constraint === option.value ? "is-active" : ""}
                      aria-pressed={constraint === option.value}
                      onClick={() => onConstraintChange(option.value)}
                      title={option.title}
                      key={option.value}
                    >
                      <span>{option.label}</span>
                      <kbd>{option.shortcut}</kbd>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div
            className="measurement-primary-state"
            aria-live="polite"
            aria-atomic="true"
          >
            {result ? (
              <div className="measurement-result">
                <div className="measurement-result__main">
                  <span>
                    <small>{result.label}</small>
                    <strong>
                      {formatMeasurementValue(result.distance, unit)}
                      <em>{unitSuffix(unit)}</em>
                    </strong>
                  </span>
                  <div className="measurement-result__actions">
                    <button
                      type="button"
                      className="measurement-result-button"
                      onClick={() => void copyResult()}
                    >
                      <Icon name={copied ? "check" : "copy"} size={12} />
                      {copied ? "Đã chép" : "Chép"}
                    </button>
                    <button
                      type="button"
                      className="measurement-result-button"
                      onClick={onUndo}
                    >
                      <Icon name="reset" size={12} />
                      Hoàn tác
                    </button>
                    <button
                      type="button"
                      className="measurement-result-button"
                      onClick={onNew}
                    >
                      <Icon name="ruler" size={12} />
                      Đo mới
                    </button>
                  </div>
                </div>
                <div className="measurement-axis-grid">
                  {(
                    [
                      ["NGANG", result.horizontal],
                      ["ΔX", result.delta.x],
                      ["ΔY", result.delta.y],
                      ["ΔZ", result.delta.z],
                    ] as const
                  ).map(([axis, value]) => (
                    <span key={axis}>
                      <small>{axis}</small>
                      <b>{formatMeasurementValue(value, unit)}</b>
                    </span>
                  ))}
                </div>
                <div className="measurement-angle-grid">
                  <span>
                    <small>GÓC XY</small>
                    <b>{formatAngle(result.angleXYDegrees)}</b>
                  </span>
                  <span>
                    <small>ĐỘ DỐC</small>
                    <b>{formatAngle(result.inclinationDegrees)}</b>
                  </span>
                </div>
              </div>
            ) : start ? (
              <div className="measurement-selected-point">
                <span>
                  <b>A</b>
                  <strong>{start.label}</strong>
                </span>
                <code>{coordinateLabel(start.point, unit, coordinateOffset)}</code>
                <small>Chọn điểm B hoặc khóa hướng đo theo trục máy.</small>
              </div>
            ) : (
              <p className="measurement-flow-hint">
                Chọn điểm A trên phôi, chi tiết hoặc đường dao; hoặc dùng gốc {coordinateSystem}.
              </p>
            )}
          </div>

          <div className="measurement-disclosures">
            <details
              className="measurement-disclosure"
              open={openDisclosure === "history"}
            >
              <summary
                onClick={(event) => {
                  event.preventDefault();
                  setOpenDisclosure((open) =>
                    open === "history" ? null : "history",
                  );
                }}
              >
                <span>
                  <strong>LỊCH SỬ</strong>
                  <small>Các phép đo gần nhất</small>
                </span>
                <b>{history.length}</b>
              </summary>
              <div className="measurement-disclosure__body">
                {history.length ? (
                  <>
                    <div className="measurement-history-list">
                      {history.map((entry, index) => (
                        <button
                          type="button"
                          className="measurement-history-item"
                          onClick={() => {
                            onHistorySelect(entry);
                            setOpenDisclosure(null);
                          }}
                          key={`${entry.id}:${index}`}
                        >
                          <span>#{String(history.length - index).padStart(2, "0")}</span>
                          <strong>{entry.label}</strong>
                          <b>
                            {formatMeasurementValue(entry.distance, unit)} {unitSuffix(unit)}
                          </b>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="measurement-history-clear"
                      onClick={onHistoryClear}
                    >
                      Xóa lịch sử
                    </button>
                  </>
                ) : (
                  <p>Chưa có phép đo nào.</p>
                )}
              </div>
            </details>

            <details
              className="measurement-disclosure"
              open={openDisclosure === "quick"}
            >
              <summary
                onClick={(event) => {
                  event.preventDefault();
                  setOpenDisclosure((open) =>
                    open === "quick" ? null : "quick",
                  );
                }}
              >
                <span>
                  <strong>KÍCH THƯỚC NHANH</strong>
                  <small>Tùy chọn · phôi & chi tiết</small>
                </span>
                <b>{presets.length}</b>
              </summary>
              <div className="measurement-disclosure__body measurement-auto">
                <div className="measurement-preset-grid">
                  {presets.map((preset) => (
                    <button
                      type="button"
                      className="measurement-preset"
                      onClick={() => {
                        onPreset(preset);
                        setOpenDisclosure(null);
                      }}
                      key={preset.id}
                    >
                      <span>{preset.label}</span>
                      <b>
                        {formatMeasurementValue(preset.distance, unit)} {unitSuffix(unit)}
                      </b>
                    </button>
                  ))}
                </div>
              </div>
            </details>
          </div>
        </div>

        <footer className="measurement-panel__footer">
          <span>{candidateCount.toLocaleString("vi-VN")} điểm bắt</span>
          <span><kbd>X/Y/Z/P</kbd>: khóa · <kbd>Esc</kbd>: hoàn tác</span>
        </footer>
    </aside>
  );
}
