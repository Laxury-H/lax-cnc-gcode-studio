import { useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Text } from "@react-three/drei";
import * as THREE from "three";
import { Simulation, StockSettings, ToolProfile } from "../simulation/types";

interface SolidSimulatorProps {
  simulation: Simulation;
  stock: StockSettings;
  cursor: number;
  segmentProgress?: number;
  showRapids?: boolean;
  showBounds?: boolean;
  showTool?: boolean;
  showStock?: boolean;
  showGrid?: boolean;
  resetTrigger?: number;
  onOrbitChange?: (orbit: { yaw: number; pitch: number }) => void;
  quality?: "low" | "medium" | "high";
}

import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

function lerpVec(a: {x:number,y:number,z:number}, b: {x:number,y:number,z:number}, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function distance3(a: {x:number,y:number,z:number}, b: {x:number,y:number,z:number}) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function pointOnSegment(segment: Simulation["segments"][0], progress: number) {
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

function ToolpathOverlay({ simulation, showRapids, showBounds }: { simulation: Simulation, showRapids: boolean, showBounds: boolean, stock: SolidSimulatorProps["stock"] }) {
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

function ToolMeshOverlay({ simulation, cursor, segmentProgress, stock, showTool }: { simulation: Simulation, cursor: number, segmentProgress: number, stock: StockSettings, showTool: boolean }) {
  if (!showTool) return null;
  const activeSegment = simulation.segments[Math.min(cursor, simulation.segments.length - 1)];
  const pos = activeSegment ? pointOnSegment(activeSegment, segmentProgress) : { x: stock.originX, y: stock.originY, z: stock.safeZ };
  
  const fluteLength = Math.max(38, stock.thickness * 2.2);
  const activeToolId = activeSegment?.tool || "1";
  const activeTool = stock.tools?.find(t => t.id === activeToolId);
  const toolDiameter = activeTool?.diameter || stock.toolDiameter || 6;
  const toolType = activeTool?.type || "flat";
  
  return (
    <group>
      <group position={[pos.x, pos.y, pos.z]}>
        <group rotation={[Math.PI / 2, 0, 0]} position={[0, 0, fluteLength / 2]}>
          {toolType === "vbit" ? (
            <group>
              <cylinderGeometry args={[toolDiameter / 2, toolDiameter / 2, fluteLength - 10, 16]} />
              <mesh position={[0, -(fluteLength / 2) + 5, 0]}>
                <coneGeometry args={[toolDiameter / 2, 10, 16]} />
                <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
              </mesh>
            </group>
          ) : toolType === "ball" ? (
            <group>
              <cylinderGeometry args={[toolDiameter / 2, toolDiameter / 2, fluteLength - toolDiameter / 2, 16]} />
              <mesh position={[0, -(fluteLength / 2) + toolDiameter / 4, 0]}>
                <sphereGeometry args={[toolDiameter / 2, 16, 16]} />
                <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
              </mesh>
            </group>
          ) : (
            <mesh>
              <cylinderGeometry args={[toolDiameter / 2, toolDiameter / 2, fluteLength, 16]} />
              <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
            </mesh>
          )}
        </group>
      </group>
    </group>
  );
}

// Map Z depth to a grayscale string for the displacement map
function getDepthColor(z: number, topZ: number, bottomZ: number) {
  const range = Math.max(0.01, topZ - bottomZ);
  const ratio = (z - bottomZ) / range;
  const clamped = Math.max(0, Math.min(1, ratio));
  const intensity = Math.round(clamped * 255);
  return `rgb(${intensity}, ${intensity}, ${intensity})`;
}

const STOCK_COLOR = "#cd9a5b"; // Realistic plywood surface color
const CUT_COLOR = "#e8c99b"; // Lighter exposed core color

export function StockMesh({ simulation, stock, cursor, segmentProgress = 1, quality = "medium" }: SolidSimulatorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  
  const lastCursorRef = useRef<number>(0);
  const lastProgressRef = useRef<number>(0);

  const MAP_RES = quality === "high" ? 2048 : quality === "medium" ? 1024 : 512;
  const geomRes = quality === "high" ? 1024 : quality === "medium" ? 512 : 256;

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
    return () => { texture.dispose(); };
  }, [canvas, texture]);

  useEffect(() => {
    const el = canvasRef.current;
    const tex = textureRef.current;
    if (!el || !tex) return;
    const ctx = el.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let startCursor = lastCursorRef.current;
    let startProgress = lastProgressRef.current;
    
    if (cursor < startCursor || (cursor === startCursor && segmentProgress < startProgress)) {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, MAP_RES, MAP_RES);
      startCursor = 0;
      startProgress = 0;
    }
    
    if (cursor === startCursor && segmentProgress === startProgress) return;

    const scaleX = MAP_RES / Math.max(1, stock.width);
    const scaleY = MAP_RES / Math.max(1, stock.height);

    let hasChanges = false;
    const isBottomZero = simulation.bounds.minZ >= -0.1;
    const topZ = isBottomZero ? stock.thickness : 0;
    const bottomZ = isBottomZero ? 0 : -stock.thickness;

    const drawLine = (from: {x:number,y:number,z:number}, to: {x:number,y:number,z:number}, tDia: number) => {
        const startX = (from.x - stock.originX) * scaleX;
        const startY = MAP_RES - ((from.y - stock.originY) * scaleY);
        const endX = (to.x - stock.originX) * scaleX;
        const endY = MAP_RES - ((to.y - stock.originY) * scaleY);
        const avgZ = (from.z + to.z) / 2;
        ctx.strokeStyle = getDepthColor(avgZ, topZ, bottomZ);
        ctx.lineWidth = tDia * scaleX;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        hasChanges = true;
    };

    const drawArcSeg = (seg: Segment, tDia: number) => {
        if (!seg.center || seg.radius === undefined || seg.sweepRadians === undefined) return;
        ctx.strokeStyle = getDepthColor(seg.end.z, topZ, bottomZ);
        ctx.lineWidth = tDia * scaleX;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        const startAngle = Math.atan2(seg.start.y - seg.center.y, seg.start.x - seg.center.x);
        const endAngle = startAngle + seg.sweepRadians;
        const centerX = (seg.center.x - stock.originX) * scaleX;
        const centerY = MAP_RES - ((seg.center.y - stock.originY) * scaleY);
        const rX = seg.radius * scaleX;
        ctx.ellipse(centerX, centerY, rX, rX, 0, startAngle, endAngle, seg.sweepRadians < 0);
        ctx.stroke();
        hasChanges = true;
    };

    for (let i = startCursor; i <= cursor; i++) {
      const seg = simulation.segments[i];
      if (!seg || seg.kind === "rapid" || seg.kind === "dwell") continue;
      
      const isCurrentSegment = i === cursor;
      const isStartSegment = i === startCursor;
      
      const segStartProgress = isStartSegment ? startProgress : 0;
      const segEndProgress = isCurrentSegment ? segmentProgress : 1;
      
      if (segStartProgress >= segEndProgress) continue; 

      const activeTool = stock.tools?.find(t => t.id === seg.tool) || stock.tools?.[0];
      const tDia = activeTool?.diameter || stock.toolDiameter || 6;

      if (seg.kind === "cut") {
        const ptFrom = pointOnSegment(seg, segStartProgress);
        const ptTo = pointOnSegment(seg, segEndProgress);
        drawLine(ptFrom, ptTo, tDia);
      } else if (seg.kind === "arc-cw" || seg.kind === "arc-ccw") {
        if (segEndProgress < 1) {
          const ptFrom = pointOnSegment(seg, segStartProgress);
          const ptTo = pointOnSegment(seg, segEndProgress);
          drawLine(ptFrom, ptTo, tDia);
        } else {
          drawArcSeg(seg, tDia);
        }
      } else if (seg.kind === "drill" && segEndProgress > 0) {
        drawLine(seg.start, seg.end, tDia);
      }
    }

    if (hasChanges) {
      tex.needsUpdate = true;
    }

    lastCursorRef.current = cursor;
    lastProgressRef.current = segmentProgress;
  }, [simulation, cursor, segmentProgress, stock, MAP_RES]);

  // Material Shader Injection
  const onBeforeCompile = (shader: THREE.Shader) => {
    shader.uniforms.uStockColor = { value: new THREE.Color(STOCK_COLOR) };
    shader.uniforms.uCutColor = { value: new THREE.Color(CUT_COLOR) };
    
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying float vDisplacement;
       varying vec2 vUvWood;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <displacementmap_vertex>',
      `#include <displacementmap_vertex>
       #ifdef USE_DISPLACEMENTMAP
         vDisplacement = texture2D( displacementMap, uv ).x;
       #endif
       vUvWood = uv;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       varying float vDisplacement;
       varying vec2 vUvWood;
       uniform vec3 uStockColor;
       uniform vec3 uCutColor;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 diffuseColor = vec4( diffuse, opacity );',
      `
       if (vDisplacement <= 0.01) {
         discard; // True cut-through (nesting)
       }

       vec2 pos = vUvWood * vec2(150.0, 10.0);
       float n = sin(pos.y) * 0.5 + sin(pos.x * 0.5) * 0.5;
       float ring = fract(pos.x * 0.1 + n * 0.3);
       float grain = smoothstep(0.0, 0.1, ring) * (1.0 - smoothstep(0.8, 1.0, ring));
       vec3 grainColor = mix(uStockColor * 0.85, uStockColor, grain);
       
       vec3 finalColor = mix(uCutColor, grainColor, smoothstep(0.95, 0.99, vDisplacement));
       vec4 diffuseColor = vec4( finalColor, opacity );
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
       float cutFactor = 1.0 - smoothstep(0.95, 0.99, vDisplacement);
       roughnessFactor = mix(0.9, 0.7, cutFactor);
       `
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <metalnessmap_fragment>',
      `#include <metalnessmap_fragment>
       metalnessFactor = 0.05;
       `
    );
  };

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <boxGeometry args={[stock.width, stock.height, stock.thickness, geomRes, geomRes, 1]} />
      
      {/* Faces: 0: +X, 1: -X, 2: +Y, 3: -Y, 4: +Z (Top after rotation), 5: -Z (Bottom) */}
      {[0, 1, 2, 3].map((idx) => (
        <meshStandardMaterial key={idx} attach={`material-${idx}`} color={STOCK_COLOR} roughness={0.9} metalness={0.1} />
      ))}
      <meshStandardMaterial attach="material-5" transparent={true} opacity={0} depthWrite={false} />
      
      <meshStandardMaterial 
        attach="material-4"
        roughness={0.9}
        metalness={0.1}
        displacementMap={texture}
        displacementScale={stock.thickness}
        displacementBias={-stock.thickness}
        bumpMap={texture}
        bumpScale={stock.thickness * 0.3}
        onBeforeCompile={onBeforeCompile}
        customProgramCacheKey={() => 'solid-wood'}
      />
    </mesh>
  );
}

function PartLabelsOverlay({ simulation, stock }: { simulation: Simulation, stock: SolidSimulatorProps["stock"] }) {
  if (!simulation.parts || simulation.parts.length === 0) return null;
  return (
    <>
      {simulation.parts.map((part) => {
        const centerX = part.minX + part.width / 2;
        const centerY = part.minY + part.height / 2;
        return (
          <group key={part.id} position={[centerX, centerY, stock.thickness + 0.1]}>
            <Text position={[0, 12, 0]} fontSize={28} color="#111111" anchorX="center" anchorY="middle" outlineWidth={0.5} outlineColor="rgba(255,255,255,0.5)">
              {part.id}
            </Text>
            <Text position={[0, -12, 0]} fontSize={18} color="#222222" anchorX="center" anchorY="middle" outlineWidth={0.4} outlineColor="rgba(255,255,255,0.5)">
              {`${Math.round(part.width)} × ${Math.round(part.height)}`}
            </Text>
          </group>
        );
      })}
    </>
  );
}

export function SolidSimulator(props: SolidSimulatorProps) {
  const isBottomZero = props.simulation.bounds.minZ >= -0.1;
  const topZ = isBottomZero ? props.stock.thickness : 0;
  const bottomZ = isBottomZero ? 0 : -props.stock.thickness;
  const centerZ = (topZ + bottomZ) / 2;
  const controlsRef = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    if (controlsRef.current && props.resetTrigger) {
      controlsRef.current.reset();
    }
  }, [props.resetTrigger]);

  return (
    <div className="solid-simulator" style={{ width: "100%", height: "100%", background: "#0c1217", position: "absolute", top: 0, left: 0, zIndex: 0 }}>
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
        
        {/* Machine Bed Grid */}
        {props.showGrid !== false && (
          <gridHelper 
            args={[
              Math.max(props.stock.width, props.stock.height) * 3, 
              Math.round(Math.max(props.stock.width, props.stock.height) * 3 / 100), 
              "#444444", 
              "#222222"
            ]} 
            position={[0, 0, 0]} 
          />
        )}

        {/* Elevate the board so its bottom sits exactly at Y=0 (the machine bed) */}
        <group position={[0, props.stock.thickness / 2, 0]}>
          {props.showStock !== false && <StockMesh {...props} />}
          
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
            <PartLabelsOverlay simulation={props.simulation} stock={props.stock} />
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

        <OrbitControls 
          ref={controlsRef} 
          makeDefault 
          onChange={(e) => {
            if (props.onOrbitChange && e?.target) {
              const az = e.target.getAzimuthalAngle();
              const pol = e.target.getPolarAngle();
              props.onOrbitChange({ yaw: az, pitch: Math.PI / 2 - pol });
            }
          }}
        />
        <ContactShadows resolution={1024} scale={Math.max(props.stock.width, props.stock.height) * 1.5} position={[0, -0.1, 0]} blur={2.5} opacity={0.6} />
      </Canvas>
    </div>
  );
}
