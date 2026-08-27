import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadPolicy() {
  const result = await build({
    entryPoints: [
      path.resolve(__dirname, "../core/simulation/complexity-policy.ts"),
    ],
    bundle: true,
    write: false,
    format: "esm",
    target: "es2022",
  });
  const url = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`;
  return import(url);
}

function simulationWithCounts(segmentCount, partCount) {
  const point = { x: 0, y: 0, z: 0 };
  return {
    segments: Array.from({ length: segmentCount }, () => ({
      points: [point, point],
    })),
    parts: Array.from({ length: partCount }, () => ({
      points: [point, point, point],
      holes: [],
    })),
  };
}

test("classifies standard, dense and extreme programs deterministically", async () => {
  const { analyzeSimulationComplexity } = await loadPolicy();

  assert.equal(analyzeSimulationComplexity(simulationWithCounts(100, 2)).tier, "standard");
  assert.equal(analyzeSimulationComplexity(simulationWithCounts(15_000, 10)).tier, "dense");
  assert.equal(analyzeSimulationComplexity(simulationWithCounts(60_000, 10)).tier, "extreme");
});

test("reduces only visual detail and labels for complex playback", async () => {
  const {
    resolvePartLabelBudget,
    resolveVisualToolpathTolerance,
  } = await loadPolicy();
  const stock = { width: 2440, height: 1220 };

  assert.equal(resolveVisualToolpathTolerance(stock, "high", "standard", true), 0);
  assert.ok(resolveVisualToolpathTolerance(stock, "high", "dense", true) > 0);
  assert.ok(
    resolvePartLabelBudget("high", "extreme", true) <
      resolvePartLabelBudget("high", "standard", false),
  );
});
