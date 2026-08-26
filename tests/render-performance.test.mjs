import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadPerformancePolicy() {
  const entry = path.resolve(
    __dirname,
    "../core/simulation/render-performance.ts",
  );
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "esm",
    target: "es2022",
  });
  const compiled = result.outputFiles[0].text;
  const url = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
  return import(url);
}

test("render profiles spend progressively more work only when quality increases", async () => {
  const { renderPerformanceProfile } = await loadPerformancePolicy();
  const low = renderPerformanceProfile("low");
  const medium = renderPerformanceProfile("medium");
  const high = renderPerformanceProfile("high");

  assert.ok(low.playbackFrameIntervalMs > medium.playbackFrameIntervalMs);
  assert.ok(medium.playbackFrameIntervalMs > high.playbackFrameIntervalMs);
  assert.ok(
    low.stockTextureFrameIntervalMs > medium.stockTextureFrameIntervalMs,
  );
  assert.equal(
    medium.stockTextureFrameIntervalMs,
    high.stockTextureFrameIntervalMs,
  );
  const heightmapWorkRate = (profile) =>
    profile.heightmapLongEdge ** 2 / profile.stockTextureFrameIntervalMs;
  assert.ok(heightmapWorkRate(low) < heightmapWorkRate(medium));
  assert.ok(heightmapWorkRate(medium) < heightmapWorkRate(high));
  assert.deepEqual(low.dpr, [0.75, 1]);
  assert.deepEqual(medium.dpr, [0.85, 1.5]);
  assert.deepEqual(high.dpr, [2, 2]);
  assert.ok(low.shadowMapSize < medium.shadowMapSize);
  assert.ok(medium.shadowMapSize < high.shadowMapSize);
  assert.equal(high.shadowMapSize, 4096);
  assert.ok(low.heightmapLongEdge < medium.heightmapLongEdge);
  assert.ok(medium.heightmapLongEdge < high.heightmapLongEdge);
  assert.equal(high.heightmapLongEdge, 4096);
  assert.equal(high.stockMeshLongEdge, 1024);
  assert.equal(high.maxAnisotropy, 16);
});

test("stock render grids keep equal physical density on rectangular material", async () => {
  const { resolveStockRenderGrid } = await loadPerformancePolicy();

  assert.deepEqual(resolveStockRenderGrid(2440, 1220, "high", 8192), {
    textureWidth: 4096,
    textureHeight: 2048,
    segmentsX: 1024,
    segmentsY: 512,
  });
  assert.deepEqual(resolveStockRenderGrid(1220, 2440, "high", 8192), {
    textureWidth: 2048,
    textureHeight: 4096,
    segmentsX: 512,
    segmentsY: 1024,
  });
  assert.deepEqual(resolveStockRenderGrid(2440, 1220, "high", 2048), {
    textureWidth: 2048,
    textureHeight: 1024,
    segmentsX: 1024,
    segmentsY: 512,
  });
});

test("frame throttling catches up after its time budget without losing resets", async () => {
  const { shouldRenderFrame } = await loadPerformancePolicy();

  assert.equal(shouldRenderFrame(Number.NEGATIVE_INFINITY, 10, 50), true);
  assert.equal(shouldRenderFrame(100, 149, 50), false);
  assert.equal(shouldRenderFrame(100, 150, 50), true);
  assert.equal(shouldRenderFrame(100, 90, 50), true);
});

test("3D canvases render continuously only while playback is active", async () => {
  const { resolveSimulationFrameloop } = await loadPerformancePolicy();

  assert.equal(resolveSimulationFrameloop(false), "demand");
  assert.equal(resolveSimulationFrameloop(true), "always");
});

test("3D views use the local high-performance GPU path without decorative effects", async () => {
  const [solid, machine, adaptive, measurement, toolpath, page] = await Promise.all([
    readFile(
      path.resolve(__dirname, "../core/components/SolidSimulator.tsx"),
      "utf8",
    ),
    readFile(
      path.resolve(__dirname, "../core/components/MachineSimulator.tsx"),
      "utf8",
    ),
    readFile(
      path.resolve(__dirname, "../core/components/AdaptiveSimulationDpr.tsx"),
      "utf8",
    ),
    readFile(
      path.resolve(__dirname, "../core/components/SmartMeasurementTool.tsx"),
      "utf8",
    ),
    readFile(
      path.resolve(__dirname, "../core/components/ToolpathCanvas.tsx"),
      "utf8",
    ),
    readFile(path.resolve(__dirname, "../app/page.tsx"), "utf8"),
  ]);

  assert.doesNotMatch(solid, /willReadFrequently/);
  assert.match(solid, /powerPreference: "high-performance"/);
  assert.match(machine, /powerPreference: "high-performance"/);
  assert.doesNotMatch(machine, /<Environment|preset="city"/);
  assert.match(solid, /<AdaptiveSimulationDpr/);
  assert.match(machine, /<AdaptiveSimulationDpr/);
  assert.doesNotMatch(solid, /MachiningEffects|ContactShadows/);
  assert.doesNotMatch(machine, /MachiningEffects|ContactShadows/);
  assert.match(adaptive, /shadowMap\.autoUpdate = false/);
  assert.match(adaptive, /shadowMap\.needsUpdate = true/);
  assert.match(adaptive, /quality === "high" \? null/);
  assert.match(solid, /stockTextureFrameIntervalMs/);
  assert.match(solid, /resolveStockRenderGrid/);
  assert.match(solid, /alphaToCoverage=\{quality !== "low"\}/);
  assert.match(solid, /surfaceTex\.anisotropy = textureAnisotropy/);
  assert.match(solid, /THREE\.LinearMipmapLinearFilter/);
  assert.match(solid, /frameloop=\{resolveSimulationFrameloop\(props\.playing \?\? false\)\}/);
  assert.match(machine, /frameloop=\{resolveSimulationFrameloop\(playing \?\? false\)\}/);
  assert.match(measurement, /const \{ camera, gl, invalidate \} = useThree\(\)/);
  assert.match(measurement, /pointerRef\.current = \{[\s\S]*?invalidate\(\)/);
  assert.match(page, /playbackFrameIntervalMs/);
  assert.match(toolpath, /canvasFrameIntervalMs/);
  assert.match(page, /requestIdleCallback\(warmSimulatorChunks/);
  assert.match(page, /connection\?\.saveData/);
  assert.match(page, /loadSolidSimulatorModule\(\)/);
  assert.match(toolpath, /function loadSolidSimulatorModule\(\)/);
});
