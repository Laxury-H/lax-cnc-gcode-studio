import { useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import { Simulation } from "../simulation/types";

interface SolidSimulatorProps {
  simulation: Simulation;
  stock: { width: number; height: number; thickness: number; toolDiameter: number; originX: number; originY: number };
  cursor: number;
  quality?: "low" | "medium" | "high";
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
      <planeGeometry args={[stock.width, stock.height, geomRes, geomRes]} />
      <meshStandardMaterial 
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
        
        {/* The PlaneGeometry is already centered at 0,0,0 local, so we place it at origin */}
        <group position={[0, 0, 0]}>
          <StockMesh {...props} />
        </group>

        <OrbitControls makeDefault />
        <ContactShadows resolution={1024} scale={Math.max(props.stock.width, props.stock.height) * 1.5} position={[0, -0.1, 0]} blur={2.5} opacity={0.6} />
      </Canvas>
    </div>
  );
}
