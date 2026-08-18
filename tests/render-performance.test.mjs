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
  assert.ok(
    medium.stockTextureFrameIntervalMs > high.stockTextureFrameIntervalMs,
  );
  assert.deepEqual(low.dpr, [0.75, 1]);
  assert.deepEqual(medium.dpr, [0.85, 1.5]);
  assert.deepEqual(high.dpr, [1, 2]);
  assert.ok(low.shadowMapSize < medium.shadowMapSize);
  assert.ok(medium.shadowMapSize < high.shadowMapSize);
  assert.ok(low.contactShadowResolution < high.contactShadowResolution);
  assert.ok(
    low.contactShadowFrameIntervalMs > medium.contactShadowFrameIntervalMs,
  );
  assert.ok(
    medium.contactShadowFrameIntervalMs > high.contactShadowFrameIntervalMs,
  );
});

test("frame throttling catches up after its time budget without losing resets", async () => {
  const { shouldRenderFrame } = await loadPerformancePolicy();

  assert.equal(shouldRenderFrame(Number.NEGATIVE_INFINITY, 10, 50), true);
  assert.equal(shouldRenderFrame(100, 149, 50), false);
  assert.equal(shouldRenderFrame(100, 150, 50), true);
  assert.equal(shouldRenderFrame(100, 90, 50), true);
});

test("3D views use the local high-performance GPU path and bounded shadow passes", async () => {
  const [solid, machine, adaptive, budgetedShadows, page] = await Promise.all([
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
      path.resolve(__dirname, "../core/components/BudgetedContactShadows.tsx"),
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
  assert.match(solid, /<BudgetedContactShadows/);
  assert.match(machine, /<BudgetedContactShadows/);
  assert.match(budgetedShadows, /memo\(function BudgetedContactShadows/);
  assert.match(budgetedShadows, /<ContactShadows[\s\S]*?frames=\{1\}/);
  assert.match(budgetedShadows, /frameIntervalMs/);
  assert.match(adaptive, /shadowMap\.autoUpdate = false/);
  assert.match(adaptive, /shadowMap\.needsUpdate = true/);
  assert.match(solid, /stockTextureFrameIntervalMs/);
  assert.match(page, /playbackFrameIntervalMs/);
  assert.match(page, /canvasFrameIntervalMs/);
  assert.match(page, /requestIdleCallback\(warmSimulatorChunks/);
  assert.match(page, /connection\?\.saveData/);
  assert.match(page, /loadSolidSimulatorModule\(\)/);
});
