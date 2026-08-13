import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Environment, Box, Cylinder } from "@react-three/drei";
import * as THREE from "three";
import type { Simulation, StockSettings, Vec3 } from "../simulation/types";
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { StockMesh } from "./SolidSimulator";
import { resolveStockZBounds } from "../measurement/measurement-utils";
import {
  resolveCutterContactDiameter,
  resolveSegmentTool,
} from "../simulation/stock-removal-coordinates";
import { pointOnSegment } from "../utils/gcode-utils";
import { MachiningEffects } from "./MachiningEffects";
import { CutterModel } from "./CutterModel";

interface MachineSimulatorProps {
  simulation: Simulation;
  stock: StockSettings;
  cursor: number;
  segmentProgress?: number;
  showTool?: boolean;
  showStock?: boolean;
  resetTrigger?: number;
  onOrbitChange?: (orbit: { yaw: number; pitch: number }) => void;
  quality?: "low" | "medium" | "high";
}

const DEFAULT_MACHINE_LIMIT_MARGIN = 10;

export function mapCncPointToMachineWorld(
  point: Vec3,
  bounds: { bottomZ: number },
): Vec3 {
  return {
    x: point.x,
    y: point.y,
    z: point.z - bounds.bottomZ,
  };
}

export function resolveMachineLimitState(
  point: Pick<Vec3, "x" | "y">,
  stock: Pick<
    StockSettings,
    "originX" | "originY" | "width" | "height"
  >,
  margin = DEFAULT_MACHINE_LIMIT_MARGIN,
): { x: boolean; y: boolean } {
  const safeMargin = Number.isFinite(margin) ? Math.max(0, margin) : 0;
  return {
    x:
      point.x < stock.originX - safeMargin ||
      point.x > stock.originX + stock.width + safeMargin,
    y:
      point.y < stock.originY - safeMargin ||
      point.y > stock.originY + stock.height + safeMargin,
  };
}

export function MachineKinematics({
  simulation,
  stock,
  cursor,
  segmentProgress = 1,
  showTool = true,
  showStock = true,
  quality = "medium",
}: Omit<MachineSimulatorProps, "resetTrigger" | "onOrbitChange">) {
  const gantryRef = useRef<THREE.Group>(null);
  const carriageRef = useRef<THREE.Group>(null);
  const zAxisRef = useRef<THREE.Group>(null);
  const spindleRef = useRef<THREE.Group>(null);
  
  // Get current segment to read spindle RPM
  const curSeg = useMemo(() => {
    if (!simulation.segments.length) return null;
    return simulation.segments[Math.min(cursor, simulation.segments.length - 1)];
  }, [simulation, cursor]);

  // Interpolate current tool position
  const currentPos = useMemo(() => {
    if (!curSeg) {
      return { x: stock.originX, y: stock.originY, z: stock.safeZ };
    }
    return pointOnSegment(curSeg, segmentProgress);
  }, [curSeg, segmentProgress, stock.originX, stock.originY, stock.safeZ]);

  const zBounds = resolveStockZBounds(simulation, stock);
  const machinePosition = mapCncPointToMachineWorld(currentPos, zBounds);
  const limitState = resolveMachineLimitState(currentPos, stock);
  const isCuttingDepth = currentPos.z < zBounds.topZ - 0.000001;

  useFrame(() => {
    // Kinematic chain mapping
    if (gantryRef.current) gantryRef.current.position.y = machinePosition.y;
    if (carriageRef.current) carriageRef.current.position.x = machinePosition.x;
    if (zAxisRef.current) zAxisRef.current.position.z = machinePosition.z;
    
    // Spindle Rotation Animation
    if (
      spindleRef.current &&
      curSeg &&
      curSeg.spindleState !== "off" &&
      curSeg.spindle > 0
    ) {
      spindleRef.current.rotation.z -= 0.3; // Rotate CCW/CW
    }
  });

  // Machine Dimensions
  const bedW = Math.max(stock.width + 200, 600);
  const bedH = Math.max(stock.height + 200, 600);
  
  const stockOffsetX = stock.originX;
  const stockOffsetY = stock.originY;

  const activeSegment = simulation.segments[Math.min(cursor, simulation.segments.length - 1)];
  const activeTool = resolveSegmentTool(stock, activeSegment?.tool) ?? {
    id: "fallback",
    diameter: stock.toolDiameter || 6,
    type: "flat" as const,
  };
  const toolDiameter = activeTool.diameter;
  const contactDiameter = resolveCutterContactDiameter(
    activeTool,
    currentPos.z,
    zBounds,
  );
  const isRemovingMaterial = Boolean(
    curSeg &&
      !curSeg.machineCoordinates &&
      curSeg.kind !== "rapid" &&
      curSeg.kind !== "dwell" &&
      curSeg.spindleState !== "off" &&
      curSeg.spindle > 0 &&
      isCuttingDepth,
  );

  return (
    <group>
      {/* 1. Base / Bed (Static) */}
      <Box args={[bedW, bedH, 50]} position={[stock.width/2 + stockOffsetX, stock.height/2 + stockOffsetY, -25]} receiveShadow>
        <meshStandardMaterial color="#2c3e50" roughness={0.7} metalness={0.2} />
      </Box>

      {/* Grid on bed */}
      <gridHelper args={[Math.max(bedW, bedH), Math.max(bedW, bedH) / 100, 0x444444, 0x444444]} rotation={[Math.PI / 2, 0, 0]} position={[stock.width/2 + stockOffsetX, stock.height/2 + stockOffsetY, 0.1]} />

      {/* Y-Axis Rails (Static on Bed) */}
      <Box args={[15, bedH, 15]} position={[stock.width/2 + stockOffsetX - bedW/2 + 40, stock.height/2 + stockOffsetY, 7.5]} receiveShadow castShadow>
        <meshStandardMaterial color="#bdc3c7" roughness={0.3} metalness={0.7} />
      </Box>
      <Box args={[15, bedH, 15]} position={[stock.width/2 + stockOffsetX + bedW/2 - 40, stock.height/2 + stockOffsetY, 7.5]} receiveShadow castShadow>
        <meshStandardMaterial color="#bdc3c7" roughness={0.3} metalness={0.7} />
      </Box>

      {/* Stock (Heightmap via StockMesh) */}
      {showStock && (
        <group position={[stock.width/2 + stockOffsetX, stock.height/2 + stockOffsetY, stock.thickness/2]} rotation={[Math.PI / 2, 0, 0]}>
          <StockMesh simulation={simulation} stock={stock} cursor={cursor} segmentProgress={segmentProgress} quality={quality} />
        </group>
      )}

      <MachiningEffects
        position={[machinePosition.x, machinePosition.y, machinePosition.z]}
        active={isRemovingMaterial}
        toolDiameter={toolDiameter}
        contactDiameter={contactDiameter}
        quality={quality}
      />

      {/* 2. Gantry (Moves in Y) */}
      <group ref={gantryRef}>
        {/* Left Leg */}
        <Box args={[40, 60, 150]} position={[-bedW/2 + stock.width/2 + stockOffsetX + 40, 50, 75]} castShadow>
          <meshStandardMaterial color={limitState.y ? "#f39c12" : "#e74c3c"} roughness={0.5} metalness={0.4} />
        </Box>
        {/* Right Leg */}
        <Box args={[40, 60, 150]} position={[bedW/2 + stock.width/2 + stockOffsetX - 40, 50, 75]} castShadow>
          <meshStandardMaterial color={limitState.y ? "#f39c12" : "#e74c3c"} roughness={0.5} metalness={0.4} />
        </Box>
        {/* Bridge */}
        <Box args={[bedW, 40, 80]} position={[stock.width/2 + stockOffsetX, 50, 190]} castShadow>
          <meshStandardMaterial color={limitState.y ? "#f39c12" : "#e74c3c"} roughness={0.5} metalness={0.4} />
        </Box>
        
        {/* X-Axis Rails (On Gantry) */}
        <Box args={[bedW - 80, 10, 10]} position={[stock.width/2 + stockOffsetX, 30, 190 + 20]} castShadow>
          <meshStandardMaterial color="#bdc3c7" roughness={0.3} metalness={0.7} />
        </Box>
        <Box args={[bedW - 80, 10, 10]} position={[stock.width/2 + stockOffsetX, 30, 190 - 20]} castShadow>
          <meshStandardMaterial color="#bdc3c7" roughness={0.3} metalness={0.7} />
        </Box>

        {/* 3. Carriage (Moves in X) */}
        <group ref={carriageRef}>
          <Box args={[80, 70, 100]} position={[0, 25, 190]} castShadow>
            <meshStandardMaterial color={limitState.x ? "#f39c12" : "#34495e"} roughness={0.6} metalness={0.3} />
          </Box>

          {/* 4. Z-Axis (Moves in Z) */}
          <group ref={zAxisRef}>
            {/* Z-axis rail block */}
            <Box args={[60, 40, 140]} position={[0, 0, 120]} castShadow>
              <meshStandardMaterial color="#7f8c8d" roughness={0.4} metalness={0.6} />
            </Box>
            
            {/* Spindle Assembly (Rotates) */}
            <group ref={spindleRef} position={[0, 0, 80]}>
              {/* Spindle Motor */}
              <Cylinder args={[20, 20, 90, 32]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <meshStandardMaterial color="#ecf0f1" roughness={0.3} metalness={0.8} />
              </Cylinder>
              {/* Collet Nut (ER20) */}
              <Cylinder args={[10, 14, 20, 6]} position={[0, 0, -50]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <meshStandardMaterial color="#f1c40f" roughness={0.4} metalness={0.9} />
              </Cylinder>
              {/* Tool */}
              {showTool && (
                <group position={[0, 0, -80]} rotation={[Math.PI / 2, 0, 0]}>
                  <CutterModel
                    tool={activeTool}
                    minimumLength={40}
                    color={isCuttingDepth ? "#e74c3c" : "#95a5a6"}
                    segments={24}
                  />
                </group>
              )}
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

export function MachineSimulator({
  simulation,
  stock,
  cursor,
  segmentProgress,
  showTool,
  showStock,
  resetTrigger,
  onOrbitChange,
  quality = "medium",
}: MachineSimulatorProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const stockCenterX = stock.originX + stock.width / 2;
  const stockCenterY = stock.originY + stock.height / 2;

  useEffect(() => {
    if (controlsRef.current && resetTrigger) {
      controlsRef.current.reset();
    }
  }, [resetTrigger]);

  return (
    <Canvas
      shadows={quality !== "low"}
      camera={{ position: [stockCenterX, stockCenterY - stock.height * 1.5, Math.max(stock.width, stock.height)], fov: 45, up: [0, 0, 1], far: 20000 }}
      style={{ width: "100%", height: "100%", background: "#05080a" }}
    >
      <color attach="background" args={["#05080a"]} />
      
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[stockCenterX, stockCenterY, 3000]}
        intensity={1.5}
        castShadow={quality !== "low"}
        shadow-mapSize={quality === "high" ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-2000}
        shadow-camera-right={2000}
        shadow-camera-top={2000}
        shadow-camera-bottom={-2000}
        shadow-camera-far={10000}
      />

      <MachineKinematics
        simulation={simulation}
        stock={stock}
        cursor={cursor}
        segmentProgress={segmentProgress}
        showTool={showTool}
        showStock={showStock}
        quality={quality}
      />

      {quality !== "low" && (
        <ContactShadows position={[stockCenterX, stockCenterY, -26]} opacity={0.6} scale={4000} blur={2} far={200} />
      )}
      
      {quality === "high" && <Environment preset="city" environmentIntensity={0.2} />}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[stockCenterX, stockCenterY, stock.thickness / 2]}
        onChange={(e) => {
          if (onOrbitChange && e?.target) {
            const az = e.target.getAzimuthalAngle();
            const pol = e.target.getPolarAngle();
            onOrbitChange({ yaw: az, pitch: pol });
          }
        }}
      />
    </Canvas>
  );
}
