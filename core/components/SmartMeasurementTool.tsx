import { Html, Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Line2, LineSegments2 } from "three-stdlib";
import type {
  MeasurementPreset,
  MeasurementResult,
  SnapCandidate,
  SnapKind,
} from "../measurement/measurement-utils";
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
  start: SnapCandidate | null;
  result: MeasurementResult | null;
  onSelect: (candidate: SnapCandidate) => void;
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

function coordinateLabel(point: { x: number; y: number; z: number }) {
  return `X ${point.x.toFixed(3)} · Y ${point.y.toFixed(3)} · Z ${point.z.toFixed(3)}`;
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
  start,
  result,
  onSelect,
}: SmartMeasurementOverlayProps) {
  const groupRef = useRef<THREE.Group>(null);
  const markerRef = useRef<THREE.Group>(null);
  const markerMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const hoverLabelRef = useRef<HTMLElement>(null);
  const hoverCoordinatesRef = useRef<HTMLSpanElement>(null);
  const dynamicLineRef = useRef<Line2 | LineSegments2>(null);
  const hoverSelectionRef = useRef<SnapCandidate | null>(null);
  const hoverKeyRef = useRef("");
  const pointerRef = useRef({ x: 0, y: 0, inside: false });
  const pointerDownRef = useRef<PointerDownState | null>(null);
  const activePointersRef = useRef(new Set<number>());
  const onSelectRef = useRef(onSelect);
  const { camera, gl } = useThree();

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

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

  const hideHover = () => {
    hoverSelectionRef.current = null;
    hoverKeyRef.current = "";
    if (markerRef.current) markerRef.current.visible = false;
    if (dynamicLineRef.current) dynamicLineRef.current.visible = false;
  };

  const resolveSelection = (clientX: number, clientY: number) => {
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
  };

  const showSelection = (selection: SnapCandidate | null) => {
    if (!selection) {
      hideHover();
      return;
    }

    hoverSelectionRef.current = selection;
    if (markerRef.current) {
      markerRef.current.position.set(
        selection.point.x,
        selection.point.y,
        selection.point.z,
      );
      markerRef.current.visible = true;
    }
    markerMaterialRef.current?.color.set(SNAP_COLORS[selection.kind]);

    const key = snapSelectionKey(selection);
    if (key !== hoverKeyRef.current) {
      hoverKeyRef.current = key;
      if (hoverLabelRef.current) {
        hoverLabelRef.current.textContent = `${SNAP_KIND_LABELS[selection.kind]} · ${selection.label}`;
      }
      if (hoverCoordinatesRef.current) {
        hoverCoordinatesRef.current.textContent = coordinateLabel(selection.point);
      }
    }

    const dynamicLine = dynamicLineRef.current;
    if (dynamicLine && start) {
      dynamicLine.geometry.setPositions([
        start.point.x,
        start.point.y,
        start.point.z,
        selection.point.x,
        selection.point.y,
        selection.point.z,
      ]);
      dynamicLine.computeLineDistances();
      dynamicLine.visible = true;
    } else if (dynamicLine) {
      dynamicLine.visible = false;
    }
  };

  useEffect(() => {
    const canvas = gl.domElement;
    const activePointers = activePointersRef.current;
    const updatePointer = (event: PointerEvent) => {
      pointerRef.current = {
        x: event.clientX,
        y: event.clientY,
        inside: true,
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
      if (
        cancelled ||
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

    canvas.addEventListener("pointerenter", handlePointerEnter);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      canvas.removeEventListener("pointerenter", handlePointerEnter);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      activePointers.clear();
      hideHover();
    };
  });

  useFrame(() => {
    const pointer = pointerRef.current;
    if (!pointer.inside) return;
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
        <Html
          position={[0, 0, markerSize * 2]}
          center
          zIndexRange={[120, 20]}
          style={{ pointerEvents: "none" }}
        >
          <div className="measurement-snap-label">
            <strong ref={hoverLabelRef}>Bắt điểm</strong>
            <span ref={hoverCoordinatesRef}>X 0.000 · Y 0.000 · Z 0.000</span>
          </div>
        </Html>
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
              <strong>{result.distance.toFixed(3)} mm</strong>
              ΔX {result.delta.x.toFixed(3)} · ΔY {result.delta.y.toFixed(3)} · ΔZ{" "}
              {result.delta.z.toFixed(3)}
            </div>
          </Html>
        </>
      ) : null}
    </group>
  );
}

type MeasurementPanelProps = {
  candidateCount: number;
  start: SnapCandidate | null;
  result: MeasurementResult | null;
  presets: readonly MeasurementPreset[];
  snapEnabled: boolean;
  onToggleSnap: () => void;
  onNew: () => void;
  onUndo: () => void;
  onPreset: (preset: MeasurementPreset) => void;
  onClose: () => void;
};

function formatMillimeters(value: number) {
  return Math.abs(value) < 0.0005 ? "0.000" : value.toFixed(3);
}

export function MeasurementPanel({
  candidateCount,
  start,
  result,
  presets,
  snapEnabled,
  onToggleSnap,
  onNew,
  onUndo,
  onPreset,
  onClose,
}: MeasurementPanelProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copyResult = async () => {
    if (!result || !navigator.clipboard) return;
    const summary = [
      `${result.label}: ${formatMillimeters(result.distance)} mm`,
      `A: ${coordinateLabel(result.start)}`,
      `B: ${coordinateLabel(result.end)}`,
      `ΔX ${formatMillimeters(result.delta.x)} · ΔY ${formatMillimeters(result.delta.y)} · ΔZ ${formatMillimeters(result.delta.z)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const firstStepState = result || start ? " is-done" : " is-current";
  const secondStepState = result ? " is-done" : start ? " is-current" : "";
  const hint = result
    ? "Đã đo xong · chọn Đo lại hoặc một phép đo tự động"
    : start
      ? "Chọn điểm B · kéo để xoay camera không làm mất điểm A"
      : "Chọn điểm A trên phôi hoặc đường chạy dao";

  return (
    <>
      <aside
        className="measurement-panel"
        aria-label="Công cụ đo thông minh 3D"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="measurement-panel__header">
          <span className="measurement-panel__icon">
            <Icon name="ruler" size={17} />
          </span>
          <span className="measurement-panel__title">
            <strong>ĐO THÔNG MINH 3D</strong>
            <small>Bắt điểm hình học · kết quả theo mm</small>
          </span>
          <span className="measurement-live-badge">BẬT</span>
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
              <span>Bắt điểm thông minh</span>
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

          <div aria-live="polite" aria-atomic="true">
            {result ? (
              <div className="measurement-result">
                <div className="measurement-result__main">
                  <span>
                    <small>{result.label}</small>
                    <strong>
                      {formatMillimeters(result.distance)}<em>mm</em>
                    </strong>
                  </span>
                  <button
                    type="button"
                    className="measurement-copy"
                    onClick={() => void copyResult()}
                  >
                    <Icon name={copied ? "check" : "copy"} size={12} />
                    {copied ? "Đã chép" : "Sao chép"}
                  </button>
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
                      <b>{formatMillimeters(value)}</b>
                    </span>
                  ))}
                </div>
              </div>
            ) : start ? (
              <div className="measurement-selection">
                <span>Điểm A · {start.label}</span>
                <div className="measurement-coordinates">
                  {(["x", "y", "z"] as const).map((axis) => (
                    <span key={axis}>
                      <small>{axis.toUpperCase()}</small>
                      <b>{formatMillimeters(start.point[axis])}</b>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="measurement-empty">
                <Icon name="crosshair" size={21} />
                <strong>Chọn điểm A</strong>
                <span>
                  Chọn gần góc, đầu mút, trung điểm hay tâm để bắt chính xác.
                </span>
              </div>
            )}
          </div>

          <section className="measurement-auto" aria-label="Đo tự động">
            <div className="measurement-section-title">
              <strong>ĐO TỰ ĐỘNG</strong>
              <small>PHÔI & CHI TIẾT</small>
            </div>
            <div className="measurement-preset-grid">
              {presets.map((preset) => (
                <button
                  type="button"
                  className="measurement-preset"
                  onClick={() => onPreset(preset)}
                  key={preset.id}
                >
                  <span>{preset.label}</span>
                  <b>{formatMillimeters(preset.distance)} mm</b>
                </button>
              ))}
            </div>
          </section>
        </div>

        <footer className="measurement-panel__footer">
          <span>{candidateCount.toLocaleString("vi-VN")} điểm bắt</span>
          <span>Kéo: xoay · Cuộn: zoom · <kbd>Esc</kbd>: hoàn tác</span>
        </footer>
      </aside>
      <div className="measurement-canvas-hint" role="status">
        <b>{start ? "B" : result ? "✓" : "A"}</b> · {hint}
      </div>
    </>
  );
}
