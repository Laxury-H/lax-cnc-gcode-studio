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

function assertClose(actual, expected, epsilon = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

function segment({
  id,
  kind = "cut",
  start,
  end,
  points = [start, end],
  center,
  machineCoordinates = false,
}) {
  return {
    id,
    kind,
    start,
    end,
    points,
    center,
    machineCoordinates,
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
    segment({
      id: 6,
      machineCoordinates: true,
      start: point(700, 700, 700),
      end: point(701, 701, 701),
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
  assertClose(result.angleXYDegrees, 53.13010235415598);
  assertClose(result.inclinationDegrees, 67.38013505195957);

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

test("constrains a target point without mutating either input", async () => {
  const { constrainMeasurementPoint } = await loadMeasurementUtils();
  const start = point(1, 2, 3);
  const target = point(10, 20, 30);
  const expectedByConstraint = {
    free: point(10, 20, 30),
    x: point(10, 2, 3),
    y: point(1, 20, 3),
    z: point(1, 2, 30),
    xy: point(10, 20, 3),
  };

  for (const [constraint, expected] of Object.entries(expectedByConstraint)) {
    const constrained = constrainMeasurementPoint(start, target, constraint);
    assert.deepEqual(constrained, expected);
    assert.notEqual(constrained, target);
  }

  assert.deepEqual(start, point(1, 2, 3));
  assert.deepEqual(target, point(10, 20, 30));
});

test("rejects non-finite coordinates before applying a constraint", async () => {
  const { constrainMeasurementPoint } = await loadMeasurementUtils();

  assert.throws(
    () => constrainMeasurementPoint(point(Infinity, 0, 0), point(1, 2, 3), "x"),
    /finite X, Y and Z coordinates/,
  );
  assert.throws(
    () => constrainMeasurementPoint(point(0, 0, 0), point(1, 2, Number.NaN), "xy"),
    /finite X, Y and Z coordinates/,
  );
});

test("reports signed XY quadrants and vertical inclination", async () => {
  const { calculateMeasurement } = await loadMeasurementUtils();
  const origin = point(0, 0, 0);
  const quadrantCases = [
    [point(1, 1, 0), 45],
    [point(-1, 1, 0), 135],
    [point(-1, -1, 0), -135],
    [point(1, -1, 0), -45],
  ];

  for (const [end, expectedAngle] of quadrantCases) {
    const result = calculateMeasurement(origin, end);
    assertClose(result.angleXYDegrees, expectedAngle);
    assert.equal(result.inclinationDegrees, 0);
  }

  const verticalUp = calculateMeasurement(origin, point(0, 0, 5));
  assert.equal(verticalUp.angleXYDegrees, 0);
  assert.equal(verticalUp.inclinationDegrees, 90);

  const verticalDown = calculateMeasurement(origin, point(0, 0, -5));
  assert.equal(verticalDown.angleXYDegrees, 0);
  assert.equal(verticalDown.inclinationDegrees, -90);

  const cardinalCases = [
    [point(5, 0, 0), 0],
    [point(0, 5, 0), 90],
    [point(-5, 0, 0), 180],
    [point(0, -5, 0), -90],
  ];
  for (const [end, expectedAngle] of cardinalCases) {
    assert.equal(calculateMeasurement(origin, end).angleXYDegrees, expectedAngle);
  }

  const zero = calculateMeasurement(origin, origin);
  assert.equal(zero.angleXYDegrees, 0);
  assert.equal(zero.inclinationDegrees, 0);

  const visuallyVertical = calculateMeasurement(
    origin,
    point(0.00000001, -0.00000001, 10),
  );
  assert.equal(visuallyVertical.angleXYDegrees, 0);
  assertClose(visuallyVertical.inclinationDegrees, 90, 0.000001);
});

test("feeds every CNC direction constraint into the final measurement", async () => {
  const { calculateMeasurement, constrainMeasurementPoint } =
    await loadMeasurementUtils();
  const start = point(5, 6, 7);
  const target = point(-5, -14, -23);
  const expected = {
    free: {
      end: target,
      delta: point(-10, -20, -30),
      distance: Math.sqrt(1400),
    },
    x: { end: point(-5, 6, 7), delta: point(-10, 0, 0), distance: 10 },
    y: { end: point(5, -14, 7), delta: point(0, -20, 0), distance: 20 },
    z: { end: point(5, 6, -23), delta: point(0, 0, -30), distance: 30 },
    xy: {
      end: point(-5, -14, 7),
      delta: point(-10, -20, 0),
      distance: Math.sqrt(500),
    },
  };

  for (const [constraint, expectation] of Object.entries(expected)) {
    const end = constrainMeasurementPoint(start, target, constraint);
    const result = calculateMeasurement(start, end);
    assert.deepEqual(result.end, expectation.end);
    assert.deepEqual(result.delta, expectation.delta);
    assertClose(result.distance, expectation.distance);
  }
});

test("derives the active work-coordinate origin from machine and work positions", async () => {
  const { calculateWorkOrigin } = await loadMeasurementUtils();

  assert.deepEqual(
    calculateWorkOrigin(point(120, -30, 50), point(20, 10, -5)),
    point(100, -40, 55),
  );
  assert.throws(
    () => calculateWorkOrigin(point(0, 0, Infinity), point(0, 0, 0)),
    /finite X, Y and Z coordinates/,
  );
});

test("uses an explicit stock Z reference instead of relying on an ambiguous toolpath", async () => {
  const { resolveStockZBounds } = await loadMeasurementUtils();
  const nonNegativeProgram = { bounds: { minZ: 0 } };
  const negativeProgram = { bounds: { minZ: -2 } };

  assert.deepEqual(
    resolveStockZBounds(nonNegativeProgram, { ...stock, zZero: "auto" }),
    { topZ: 12, bottomZ: 0 },
  );
  assert.deepEqual(
    resolveStockZBounds(negativeProgram, { ...stock, zZero: "auto" }),
    { topZ: 0, bottomZ: -12 },
  );
  assert.deepEqual(
    resolveStockZBounds(nonNegativeProgram, { ...stock, zZero: "top" }),
    { topZ: 0, bottomZ: -12 },
  );
  assert.deepEqual(
    resolveStockZBounds(negativeProgram, { ...stock, zZero: "bottom" }),
    { topZ: 12, bottomZ: 0 },
  );

  const bottomZeroWithMachineRapid = {
    bounds: { minZ: -100 },
    segments: [
      segment({
        id: 1,
        kind: "rapid",
        start: point(0, 0, 20),
        end: point(0, 0, -100),
      }),
      segment({
        id: 2,
        kind: "cut",
        start: point(0, 0, 8),
        end: point(10, 0, 5),
      }),
    ],
  };
  assert.deepEqual(
    resolveStockZBounds(bottomZeroWithMachineRapid, {
      ...stock,
      zZero: "auto",
    }),
    { topZ: 12, bottomZ: 0 },
  );
});

test("automatic stock Z datum ignores G53 machine-coordinate feed moves", async () => {
  const { resolveStockZBounds } = await loadMeasurementUtils();
  const stock = { thickness: 18, zZero: "auto" };
  const simulation = {
    bounds: { minZ: -100 },
    segments: [
      {
        kind: "cut",
        machineCoordinates: false,
        points: [
          { x: 0, y: 0, z: 18 },
          { x: 10, y: 0, z: 5 },
        ],
      },
      {
        kind: "cut",
        machineCoordinates: true,
        points: [
          { x: 10, y: 0, z: 5 },
          { x: -100, y: -100, z: -100 },
        ],
      },
    ],
  };

  assert.deepEqual(resolveStockZBounds(simulation, stock), {
    topZ: 18,
    bottomZ: 0,
  });
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
  assert.equal(
    candidates.some((candidate) => candidate.point.x === 700),
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
  assert.equal(presets[0].angleXYDegrees, 0);
  assert.equal(presets[0].inclinationDegrees, 0);
  assert.equal(presets[1].angleXYDegrees, 90);
  assert.equal(presets[1].inclinationDegrees, 0);
  assert.equal(presets[2].angleXYDegrees, 0);
  assert.equal(presets[2].inclinationDegrees, 90);
  assert.deepEqual(
    presets.map((preset) => preset.source),
    ["stock", "stock", "stock", "part", "part"],
  );
});
