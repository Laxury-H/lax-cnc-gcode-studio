import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadSimulation() {
  const entry = path.resolve(__dirname, "../core/simulation/studio-program.ts");
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

test("keeps a 25k-segment open contour inside the parser performance budget", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadSimulation();
  const lines = ["G21 G90 G54", "G00 X0 Y0 Z5", "G01 Z-1 F1000"];
  for (let index = 1; index <= 25_000; index += 1) {
    lines.push(`G01 X${index} Y${index % 2}`);
  }

  const startedAt = performance.now();
  const simulation = parseProgram(lines.join("\n"), DEFAULT_STOCK, "iso");
  const elapsedMs = performance.now() - startedAt;

  assert.equal(simulation.segments.length, 25_001);
  assert.ok(
    elapsedMs < 6_000,
    `25k-segment parse exceeded 6000ms budget: ${elapsedMs.toFixed(1)}ms`,
  );
});

test("extracts offcuts from 50 irregular parts without combinatorial slowdown", async () => {
  const { DEFAULT_STOCK, extractOffcuts } = await loadSimulation();
  const parts = Array.from({ length: 50 }, (_, index) => {
    const minX = 10 + index * 43.1;
    const minY = 10 + ((index * 71) % 1_000);
    return {
      id: `P${index}`,
      points: [],
      sourceLine: index,
      minX,
      minY,
      maxX: minX + 20,
      maxY: minY + 20,
      width: 20,
      height: 20,
      toolpathWidth: 20,
      toolpathHeight: 20,
      compensated: false,
      area: 400,
      nearestGap: null,
      edgeGap: 0,
    };
  });

  const startedAt = performance.now();
  const offcuts = extractOffcuts(parts, {
    ...DEFAULT_STOCK,
    width: 2_440,
    height: 1_220,
  });
  const elapsedMs = performance.now() - startedAt;

  assert.ok(offcuts.length > 0);
  assert.ok(
    elapsedMs < 2_000,
    `50-part offcut extraction exceeded 2000ms budget: ${elapsedMs.toFixed(1)}ms`,
  );
});

test("analyzes a dense curved nest with internal cutouts inside budget", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadSimulation();
  const lines = ["G21 G90 G54", "M3 S18000"];
  for (let index = 0; index < 80; index += 1) {
    const centerX = 50 + (index % 10) * 90;
    const centerY = 50 + Math.floor(index / 10) * 90;
    lines.push(
      `G0 X${centerX + 30} Y${centerY} Z5`,
      "G1 Z-3 F800",
      "G2 I-30 J0 F1200",
      "G0 Z5",
    );
    if (index % 4 === 0) {
      lines.push(
        `G0 X${centerX + 10} Y${centerY}`,
        "G1 Z-3 F800",
        "G2 I-10 J0 F1200",
        "G0 Z5",
      );
    }
  }
  lines.push("M5");

  const startedAt = performance.now();
  const simulation = parseProgram(
    lines.join("\n"),
    { ...DEFAULT_STOCK, width: 950, height: 750, thickness: 3 },
    "iso",
  );
  const elapsedMs = performance.now() - startedAt;

  assert.equal(simulation.parts.length, 80);
  assert.equal(
    simulation.parts.filter((part) => part.holes?.length === 1).length,
    20,
  );
  assert.ok(
    elapsedMs < 4_000,
    `dense curved nest exceeded 4000ms budget: ${elapsedMs.toFixed(1)}ms`,
  );
});
