import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let measurementModulePromise;

function loadMeasurementUtils() {
  measurementModulePromise ??= build({
    entryPoints: [
      path.resolve(__dirname, "../core/measurement/measurement-utils.ts"),
    ],
    bundle: true,
    write: false,
    format: "esm",
    target: "es2022",
  }).then((result) => {
    const compiled = result.outputFiles[0].text;
    const url = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
    return import(url);
  });

  return measurementModulePromise;
}

function point(x, y, z) {
  return { x, y, z };
}

function segment({
  id,
  kind = "cut",
  start,
  end,
  points = [start, end],
  center,
}) {
  return {
    id,
    kind,
    start,
    end,
    points,
    center,
  };
}

const stock = {
  width: 100,
  height: 50,
  thickness: 12,
  originX: 0,
  originY: 0,
  safeZ: 20,
  toolDiameter: 6,
  clearance: 5,
  rapidFeed: 5000,
};

const part = {
  id: "P01",
  minX: 10,
  minY: 10,
  maxX: 30,
  maxY: 25,
  width: 20,
  height: 15,
};

const simulation = {
  segments: [
    segment({
      id: 1,
      start: point(0, 0, 8),
      end: point(100, 0, 8),
    }),
    segment({
      id: 2,
      kind: "arc-ccw",
      start: point(100, 0, 8),
      end: point(100, 50, 8),
      points: [point(100, 0, 8), point(75, 25, 8), point(100, 50, 8)],
      center: point(75, 25, 8),
    }),
    segment({
      id: 3,
      kind: "rapid",
      start: point(900, 900, 900),
      end: point(901, 901, 901),
    }),
    segment({
      id: 4,
      kind: "dwell",
      start: point(800, 800, 800),
      end: point(800, 800, 800),
    }),
    segment({
      id: 5,
      start: point(5, 5, 8),
      end: point(15, 5, 8),
    }),
  ],
  parts: [part],
};

test("calculates signed deltas, horizontal distance and 3D distance", async () => {
  const { calculateMeasurement } = await loadMeasurementUtils();
  const start = point(1, 2, 3);
  const end = point(4, 6, 15);
  const result = calculateMeasurement(start, end, {
    id: "manual:1",
    label: "Kiểm tra",
  });

  assert.equal(result.id, "manual:1");
  assert.equal(result.label, "Kiểm tra");
  assert.equal(result.source, "manual");
  assert.deepEqual(result.delta, point(3, 4, 12));
  assert.equal(result.horizontal, 5);
  assert.equal(result.distance, 13);

  start.x = 999;
  end.z = 999;
  assert.deepEqual(result.start, point(1, 2, 3));
  assert.deepEqual(result.end, point(4, 6, 15));
});

test("rejects non-finite manual measurement coordinates", async () => {
  const { calculateMeasurement } = await loadMeasurementUtils();

  assert.throws(
    () => calculateMeasurement(point(0, 0, 0), point(Number.NaN, 1, 1)),
    /finite X, Y and Z coordinates/,
  );
});

test("builds and prioritizes deduplicated snap candidates", async () => {
  const { buildMeasurementSnapCandidates } = await loadMeasurementUtils();
  const candidates = buildMeasurementSnapCandidates(simulation, stock, 8);
  const coordinateKeys = candidates.map(({ point: candidatePoint }) =>
    `${candidatePoint.x}:${candidatePoint.y}:${candidatePoint.z}`,
  );

  assert.equal(new Set(coordinateKeys).size, coordinateKeys.length);
  assert.deepEqual(
    new Set(candidates.map((candidate) => candidate.kind)),
    new Set(["endpoint", "midpoint", "center", "corner"]),
  );
  assert.equal(
    candidates.some((candidate) => candidate.point.x === 900),
    false,
  );
  assert.equal(
    candidates.some((candidate) => candidate.point.x === 800),
    false,
  );

  const sharedStockCorner = candidates.find(
    (candidate) =>
      candidate.point.x === 0 &&
      candidate.point.y === 0 &&
      candidate.point.z === 8,
  );
  assert.equal(sharedStockCorner?.id, "stock:corner:min-x-min-y");
  assert.equal(sharedStockCorner?.kind, "corner");

  const arcCenter = candidates.find(
    (candidate) =>
      candidate.point.x === 75 &&
      candidate.point.y === 25 &&
      candidate.point.z === 8,
  );
  assert.equal(arcCenter?.id, "segment:2:center");
  assert.equal(arcCenter?.kind, "center");

  const partCenter = candidates.find(
    (candidate) => candidate.id === "part:P01:center",
  );
  assert.deepEqual(partCenter?.point, point(20, 17.5, 8));
});

test("builds stock and part dimension presets", async () => {
  const { buildAutomaticMeasurements } = await loadMeasurementUtils();
  const presets = buildAutomaticMeasurements(simulation, stock, 8);

  assert.deepEqual(
    presets.map((preset) => preset.id),
    [
      "stock:width",
      "stock:length",
      "stock:thickness",
      "part:P01:width",
      "part:P01:length",
    ],
  );
  assert.deepEqual(
    presets.map((preset) => preset.distance),
    [100, 50, 12, 20, 15],
  );
  assert.deepEqual(presets[2].start, point(0, 0, -4));
  assert.deepEqual(presets[2].end, point(0, 0, 8));
  assert.equal(presets[2].horizontal, 0);
  assert.deepEqual(
    presets.map((preset) => preset.source),
    ["stock", "stock", "stock", "part", "part"],
  );
});
