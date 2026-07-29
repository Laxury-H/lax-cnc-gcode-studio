import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Environment, Box, Cylinder } from "@react-three/drei";
import * as THREE from "three";
import { Simulation } from "../simulation/types";
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

interface MachineSimulatorProps {
  simulation: Simulation;
  stock: { width: number; height: number; thickness: number; toolDiameter: number; originX: number; originY: number; safeZ: number };
  cursor: number;
  segmentProgress?: number;
  showTool?: boolean;
  showStock?: boolean;
  resetTrigger?: number;
  onOrbitChange?: (orbit: { yaw: number; pitch: number }) => void;
  quality?: "low" | "medium" | "high";
}

function lerpVec(a: {x:number,y:number,z:number}, b: {x:number,y:number,z:number}, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function MachineKinematics({
  simulation,
  stock,
  cursor,
  segmentProgress = 1,
  showTool = true,
  showStock = true,
}: Omit<MachineSimulatorProps, "resetTrigger" | "onOrbitChange" | "quality">) {
  const gantryRef = useRef<THREE.Group>(null);
  const carriageRef = useRef<THREE.Group>(null);
  const zAxisRef = useRef<THREE.Group>(null);
  
  // Interpolate current tool position
  const currentPos = useMemo(() => {
    if (!simulation.segments.length) return { x: 0, y: 0, z: stock.safeZ };
    const curSeg = simulation.segments[Math.min(cursor, simulation.segments.length - 1)];
    
    const start = {
      x: curSeg.start?.x ?? 0,
      y: curSeg.start?.y ?? 0,
      z: curSeg.start?.z ?? stock.safeZ,
    };
    const end = {
      x: curSeg.end?.x ?? start.x,
      y: curSeg.end?.y ?? start.y,
      z: curSeg.end?.z ?? start.z,
    };
    
    return lerpVec(start, end, segmentProgress);
  }, [simulation, cursor, segmentProgress, stock.safeZ]);

  useFrame(() => {
    // Kinematic chain mapping
    // Gantry moves in Y
    if (gantryRef.current) {
      gantryRef.current.position.y = currentPos.y;
    }
    // Carriage moves in X (relative to Gantry)
    if (carriageRef.current) {
      carriageRef.current.position.x = currentPos.x;
    }
    // Z-Axis moves in Z (relative to Carriage)
    if (zAxisRef.current) {
      zAxisRef.current.position.z = currentPos.z;
    }
  });

  // Machine Dimensions
  const bedW = Math.max(stock.width + 200, 600);
  const bedH = Math.max(stock.height + 200, 600);
  
  const stockOffsetX = -stock.width * stock.originX;
  const stockOffsetY = -stock.height * stock.originY;

  return (
    <group>
      {/* 1. Base / Bed (Static) */}
      <Box args={[bedW, bedH, 50]} position={[stock.width/2 + stockOffsetX, stock.height/2 + stockOffsetY, -25]} receiveShadow>
        <meshStandardMaterial color="#2c3e50" roughness={0.7} metalness={0.2} />
      </Box>

      {/* Grid on bed */}
      <gridHelper args={[Math.max(bedW, bedH), 20, 0x000000, 0x444444]} rotation={[Math.PI / 2, 0, 0]} position={[stock.width/2 + stockOffsetX, stock.height/2 + stockOffsetY, 0.1]} />

      {/* Stock (Static) */}
      {showStock && (
        <Box args={[stock.width, stock.height, stock.thickness]} position={[stock.width/2 + stockOffsetX, stock.height/2 + stockOffsetY, stock.thickness/2]} receiveShadow castShadow>
          <meshStandardMaterial color="#d4a373" roughness={0.9} />
        </Box>
      )}

      {/* 2. Gantry (Moves in Y) */}
      <group ref={gantryRef}>
        {/* Left Leg */}
        <Box args={[40, 60, 150]} position={[-bedW/2 + stock.width/2 + stockOffsetX + 20, 0, 75]} castShadow>
          <meshStandardMaterial color="#e74c3c" roughness={0.5} metalness={0.4} />
        </Box>
        {/* Right Leg */}
        <Box args={[40, 60, 150]} position={[bedW/2 + stock.width/2 + stockOffsetX - 20, 0, 75]} castShadow>
          <meshStandardMaterial color="#e74c3c" roughness={0.5} metalness={0.4} />
        </Box>
        {/* Bridge */}
        <Box args={[bedW, 40, 60]} position={[stock.width/2 + stockOffsetX, 0, 180]} castShadow>
          <meshStandardMaterial color="#e74c3c" roughness={0.5} metalness={0.4} />
        </Box>

        {/* 3. Carriage (Moves in X) */}
        <group ref={carriageRef}>
          <Box args={[80, 60, 80]} position={[0, -10, 180]} castShadow>
            <meshStandardMaterial color="#34495e" roughness={0.6} metalness={0.3} />
          </Box>

          {/* 4. Z-Axis (Moves in Z) */}
          <group ref={zAxisRef}>
            {/* Z-axis rail block */}
            <Box args={[50, 40, 120]} position={[0, -30, 120]} castShadow>
              <meshStandardMaterial color="#7f8c8d" roughness={0.4} metalness={0.6} />
            </Box>
            
            {/* 5. Spindle */}
            <Cylinder args={[15, 15, 80, 16]} position={[0, -30, 80]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <meshStandardMaterial color="#ecf0f1" roughness={0.3} metalness={0.8} />
            </Cylinder>

            {/* 6. Tool */}
            {showTool && (
              <Cylinder args={[stock.toolDiameter / 2, stock.toolDiameter / 2, 40, 16]} position={[0, -30, 20]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <meshStandardMaterial color={currentPos.z < 0 ? "#e74c3c" : "#95a5a6"} roughness={0.2} metalness={0.9} />
              </Cylinder>
            )}
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

  useEffect(() => {
    if (controlsRef.current && resetTrigger) {
      controlsRef.current.reset();
    }
  }, [resetTrigger]);

  return (
    <Canvas
      shadows={quality !== "low"}
      camera={{ position: [stock.width / 2, -stock.height * 1.5, Math.max(stock.width, stock.height)], fov: 45, up: [0, 0, 1], far: 20000 }}
      style={{ width: "100%", height: "100%", background: "#05080a" }}
    >
      <color attach="background" args={["#05080a"]} />
      
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[stock.width / 2, stock.height / 2, 3000]}
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
      />

      {quality !== "low" && (
        <ContactShadows position={[stock.width / 2, stock.height / 2, -26]} opacity={0.6} scale={4000} blur={2} far={200} />
      )}
      
      {quality === "high" && <Environment preset="city" opacity={0.2} />}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[stock.width / 2, stock.height / 2, 0]}
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
