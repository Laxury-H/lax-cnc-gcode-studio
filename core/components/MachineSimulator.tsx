import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Environment, Box, Cylinder } from "@react-three/drei";
import * as THREE from "three";
import { Simulation } from "../simulation/types";
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { StockMesh } from "./SolidSimulator";

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
    if (!curSeg) return { x: 0, y: 0, z: stock.safeZ };
    
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
  }, [curSeg, segmentProgress, stock.safeZ]);

  // Machine limits
  const isXLimit = currentPos.x < 0 || currentPos.x > stock.width + 10;
  const isYLimit = currentPos.y < 0 || currentPos.y > stock.height + 10;

  useFrame(() => {
    // Kinematic chain mapping
    if (gantryRef.current) gantryRef.current.position.y = currentPos.y;
    if (carriageRef.current) carriageRef.current.position.x = currentPos.x;
    if (zAxisRef.current) zAxisRef.current.position.z = currentPos.z;
    
    // Spindle Rotation Animation
    if (spindleRef.current && curSeg && curSeg.spindle > 0) {
      spindleRef.current.rotation.z -= 0.3; // Rotate CCW/CW
    }
  });

  // Machine Dimensions
  const bedW = Math.max(stock.width + 200, 600);
  const bedH = Math.max(stock.height + 200, 600);
  
  const stockOffsetX = stock.originX;
  const stockOffsetY = stock.originY;

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

      {/* 2. Gantry (Moves in Y) */}
      <group ref={gantryRef}>
        {/* Left Leg */}
        <Box args={[40, 60, 150]} position={[-bedW/2 + stock.width/2 + stockOffsetX + 40, 50, 75]} castShadow>
          <meshStandardMaterial color={isYLimit ? "#f39c12" : "#e74c3c"} roughness={0.5} metalness={0.4} />
        </Box>
        {/* Right Leg */}
        <Box args={[40, 60, 150]} position={[bedW/2 + stock.width/2 + stockOffsetX - 40, 50, 75]} castShadow>
          <meshStandardMaterial color={isYLimit ? "#f39c12" : "#e74c3c"} roughness={0.5} metalness={0.4} />
        </Box>
        {/* Bridge */}
        <Box args={[bedW, 40, 80]} position={[stock.width/2 + stockOffsetX, 50, 190]} castShadow>
          <meshStandardMaterial color={isYLimit ? "#f39c12" : "#e74c3c"} roughness={0.5} metalness={0.4} />
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
            <meshStandardMaterial color={isXLimit ? "#f39c12" : "#34495e"} roughness={0.6} metalness={0.3} />
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
                <Cylinder args={[stock.toolDiameter / 2, stock.toolDiameter / 2, 40, 16]} position={[0, 0, -70]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                  <meshStandardMaterial color={currentPos.z < 0 ? "#e74c3c" : "#95a5a6"} roughness={0.2} metalness={0.9} />
                </Cylinder>
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
        quality={quality}
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
