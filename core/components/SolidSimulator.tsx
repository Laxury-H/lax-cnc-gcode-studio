import { useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { Simulation } from "../simulation/types";

interface SolidSimulatorProps {
  simulation: Simulation;
  stock: { width: number; height: number; thickness: number; toolDiameter: number; originX: number; originY: number; safeZ: number };
  cursor: number;
  segmentProgress?: number;
  showRapids?: boolean;
  showBounds?: boolean;
  showTool?: boolean;
  quality?: "low" | "medium" | "high";
}

function lerpVec(a: {x:number,y:number,z:number}, b: {x:number,y:number,z:number}, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function distance3(a: {x:number,y:number,z:number}, b: {x:number,y:number,z:number}) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function pointOnSegment(segment: any, progress: number) {
  const clamped = Math.max(0, Math.min(1, progress));
  if (segment.points.length <= 2) {
    return lerpVec(segment.start, segment.end, clamped);
  }
  const total = segment.length || 1;
  let target = total * clamped;
  for (let index = 1; index < segment.points.length; index += 1) {
    const from = segment.points[index - 1];
    const to = segment.points[index];
    const length = distance3(from, to);
    if (target <= length || index === segment.points.length - 1) {
      const ratio = length <= 0.000001 ? 0 : target / length;
      return lerpVec(from, to, ratio);
    }
    target -= length;
  }
  return { ...segment.end };
}

function ToolpathOverlay({ simulation, showRapids, showBounds, stock }: { simulation: Simulation, showRapids: boolean, showBounds: boolean, stock: any }) {
  const { cutGeom, rapidGeom, boundsGeom } = useMemo(() => {
    const cutPositions: number[] = [];
    const rapidPositions: number[] = [];
    
    simulation.segments.forEach(seg => {
      const isRapid = seg.kind === "rapid";
      if (isRapid && !showRapids) return;
      
      const pts = seg.points;
      for (let i = 1; i < pts.length; i++) {
        const p1 = pts[i - 1];
        const p2 = pts[i];
        if (isRapid) {
          rapidPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        } else {
          cutPositions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
        }
      }
    });

    const cutGeom = new THREE.BufferGeometry();
    if (cutPositions.length > 0) cutGeom.setAttribute('position', new THREE.Float32BufferAttribute(cutPositions, 3));
    
    const rapidGeom = new THREE.BufferGeometry();
    if (rapidPositions.length > 0) rapidGeom.setAttribute('position', new THREE.Float32BufferAttribute(rapidPositions, 3));

    const boundsGeom = new THREE.BufferGeometry();
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
      boundsGeom.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    }

    return { cutGeom, rapidGeom, boundsGeom };
  }, [simulation, showRapids, showBounds]);

  return (
    <group>
      {cutGeom.attributes.position && (
        <lineSegments geometry={cutGeom}>
          <lineBasicMaterial color="#00e5ff" linewidth={1} opacity={0.5} transparent />
        </lineSegments>
      )}
      {showRapids && rapidGeom.attributes.position && (
        <lineSegments geometry={rapidGeom}>
          <lineBasicMaterial color="#ff3366" linewidth={1} opacity={0.2} transparent />
        </lineSegments>
      )}
      {showBounds && boundsGeom.attributes.position && (
        <lineSegments geometry={boundsGeom}>
          <lineBasicMaterial color="#81a7bd" opacity={0.34} transparent />
        </lineSegments>
      )}
    </group>
  );
}

function ToolMeshOverlay({ simulation, cursor, segmentProgress, stock, showTool }: { simulation: Simulation, cursor: number, segmentProgress: number, stock: any, showTool: boolean }) {
  if (!showTool) return null;
  const activeSegment = simulation.segments[Math.min(cursor, simulation.segments.length - 1)];
  const pos = activeSegment ? pointOnSegment(activeSegment, segmentProgress) : { x: stock.originX, y: stock.originY, z: stock.safeZ };
  
  const fluteLength = Math.max(38, stock.thickness * 2.2);
  
  return (
    <group position={[pos.x, pos.y, pos.z]}>
      {/* Align cylinder with local Z axis (which maps to world Y axis after parent rotation) */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, fluteLength / 2]}>
        <cylinderGeometry args={[stock.toolDiameter / 2, stock.toolDiameter / 2, fluteLength, 16]} />
        <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  );
}

// Map Z depth to a grayscale string for the displacement map
function getDepthColor(z: number, topZ: number, bottomZ: number) {
  // z >= topZ -> white (no displacement)
  // z <= bottomZ -> black (full displacement)
  const range = Math.max(0.01, topZ - bottomZ);
  const ratio = (z - bottomZ) / range;
  const clamped = Math.max(0, Math.min(1, ratio));
  const intensity = Math.round(clamped * 255);
  return `rgb(${intensity}, ${intensity}, ${intensity})`;
}

function StockMesh({ simulation, stock, cursor, quality = "medium" }: SolidSimulatorProps) {
  // Use a ref for the canvas and texture so we don't recreate them on every frame
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const lastCursorRef = useRef<number>(0);

  // Determine resolution based on quality
  const MAP_RES = quality === "high" ? 2048 : quality === "medium" ? 1024 : 512;
  const geomRes = quality === "high" ? 1024 : quality === "medium" ? 512 : 256;

  // Initialize the canvas and texture once
  const { canvas, texture } = useMemo(() => {
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
    return { canvas: el, texture: tex };
  }, [MAP_RES]);

  useEffect(() => {
    canvasRef.current = canvas;
    textureRef.current = texture;
    return () => {
      texture.dispose();
    };
  }, [canvas, texture]);

  // Update the heightmap progressively
  useEffect(() => {
    const el = canvasRef.current;
    const tex = textureRef.current;
    if (!el || !tex) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    let startIdx = lastCursorRef.current;
    
    // If cursor went backwards, clear the canvas and redraw from 0
    if (cursor < startIdx) {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, MAP_RES, MAP_RES);
      startIdx = 0;
    }

    // If there's nothing new to draw, return
    if (cursor === startIdx) return;

    const scaleX = MAP_RES / Math.max(1, stock.width);
    const scaleY = MAP_RES / Math.max(1, stock.height);
    const scaledToolWidth = Math.max(1, stock.toolDiameter * Math.min(scaleX, scaleY));

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = scaledToolWidth;

    let hasChanges = false;
    
    // Auto-detect if stock top is at Z=thickness (bottom is Z=0) or Z=0 (bottom is Z=-thickness)
    const isBottomZero = simulation.bounds.minZ >= -0.1;
    const topZ = isBottomZero ? stock.thickness : 0;
    const bottomZ = isBottomZero ? 0 : -stock.thickness;

    // Progressively draw only the newly added segments
    for (let i = startIdx; i < cursor; i++) {
      const seg = simulation.segments[i];
      if (seg.kind === "rapid" || seg.kind === "drill" || seg.kind === "dwell") continue;

      hasChanges = true;
      const points = seg.points;
      if (points.length < 2) continue;

      // Draw segment by segment. For arcs, points array will have multiple points.
      for (let j = 1; j < points.length; j++) {
        const from = points[j - 1];
        const to = points[j];

        // Convert physical X,Y to canvas coordinates
        const startX = (from.x - stock.originX) * scaleX;
        const startY = MAP_RES - ((from.y - stock.originY) * scaleY);
        const endX = (to.x - stock.originX) * scaleX;
        const endY = MAP_RES - ((to.y - stock.originY) * scaleY);

        // Approximate depth mapping (averaging start and end Z for this small line)
        const avgZ = (from.z + to.z) / 2;
        ctx.strokeStyle = getDepthColor(avgZ, topZ, bottomZ);

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
    }

    if (hasChanges) {
      tex.needsUpdate = true;
    }

    lastCursorRef.current = cursor;
  }, [simulation, cursor, stock, MAP_RES]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <boxGeometry args={[stock.width, stock.height, stock.thickness, geomRes, geomRes, 1]} />
      
      {/* Faces: 0: +X, 1: -X, 2: +Y, 3: -Y, 4: +Z (Top after rotation), 5: -Z (Bottom) */}
      {[0, 1, 2, 3, 5].map((idx) => (
        <meshStandardMaterial key={idx} attach={`material-${idx}`} color="#c8a576" roughness={0.8} />
      ))}
      
      <meshStandardMaterial 
        attach="material-4"
        color="#c8a576" 
        roughness={0.8}
        displacementMap={texture}
        displacementScale={stock.thickness}
        displacementBias={-stock.thickness}
        bumpMap={texture}
        bumpScale={stock.thickness * 0.5}
      />
    </mesh>
  );
}

export function SolidSimulator(props: SolidSimulatorProps) {
  const isBottomZero = props.simulation.bounds.minZ >= -0.1;
  const topZ = isBottomZero ? props.stock.thickness : 0;
  const bottomZ = isBottomZero ? 0 : -props.stock.thickness;
  const centerZ = (topZ + bottomZ) / 2;

  return (
    <div className="solid-simulator" style={{ width: "100%", height: "100%", background: "#0c1217", position: "absolute", top: 0, left: 0, zIndex: 10 }}>
      <Canvas shadows camera={{ position: [0, Math.max(props.stock.width, props.stock.height) * 1.2, Math.max(props.stock.width, props.stock.height) * 1.0], fov: 45, near: 1, far: Math.max(props.stock.width, props.stock.height) * 10 }}>
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
        
        {/* Elevate the board so its bottom sits exactly at Y=0 (the machine bed) */}
        <group position={[0, props.stock.thickness / 2, 0]}>
          <StockMesh {...props} />
          
          {/* Overlay group mapping CNC coordinates to Local coordinates */}
          {/* CNC X -> Local X, CNC Y -> Local Y, CNC Z -> Local Z */}
          <group 
            rotation={[-Math.PI / 2, 0, 0]} 
            position={[
              -(props.stock.originX + props.stock.width / 2),
              centerZ, 
              (props.stock.originY + props.stock.height / 2)
            ]}
          >
            <ToolpathOverlay 
              simulation={props.simulation} 
              stock={props.stock} 
              showRapids={props.showRapids ?? true} 
              showBounds={props.showBounds ?? true} 
            />
            <ToolMeshOverlay 
              simulation={props.simulation} 
              cursor={props.cursor} 
              segmentProgress={props.segmentProgress ?? 1} 
              stock={props.stock} 
              showTool={props.showTool ?? true} 
            />
          </group>
        </group>

        <OrbitControls makeDefault />
        <ContactShadows resolution={1024} scale={Math.max(props.stock.width, props.stock.height) * 1.5} position={[0, -0.1, 0]} blur={2.5} opacity={0.6} />
      </Canvas>
    </div>
  );
}
