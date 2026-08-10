import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let interpreterPromise;

function loadInterpreter() {
  interpreterPromise ??= build({
    entryPoints: [path.resolve(__dirname, "../core/gcode/interpreter.ts")],
    bundle: true,
    write: false,
    format: "esm",
    target: "es2022",
  }).then((result) => {
    const compiled = result.outputFiles[0].text;
    const url = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
    return import(url);
  });
  return interpreterPromise;
}

function assertVector(actual, expected, message) {
  for (const axis of ["x", "y", "z"]) {
    assert.ok(
      Math.abs(actual[axis] - expected[axis]) < 1e-9,
      `${message}: ${axis} expected ${expected[axis]}, received ${actual[axis]}`,
    );
  }
}

test("maps G54-G59 programmed positions through their configured work offsets", async () => {
  const { interpretGcode } = await loadInterpreter();
  const coordinateSystems = ["G54", "G55", "G56", "G57", "G58", "G59"];
  const workOffsets = Object.fromEntries(
    coordinateSystems.map((coordinateSystem, index) => [
      coordinateSystem,
      { x: index * 100, y: index * -50, z: index * 10 },
    ]),
  );
  const source = [
    "G21 G90",
    ...coordinateSystems.map(
      (coordinateSystem) => `${coordinateSystem} G0 X1 Y2 Z3`,
    ),
  ].join("\n");

  const result = interpretGcode(source, {
    initialPosition: { x: 0, y: 0, z: 0 },
    workOffsets,
  });

  assert.equal(result.motions.length, coordinateSystems.length);
  result.motions.forEach((motion, index) => {
    const coordinateSystem = coordinateSystems[index];
    const offset = workOffsets[coordinateSystem];
    assert.equal(motion.coordinateSystem, coordinateSystem);
    assertVector(
      motion.end,
      { x: offset.x + 1, y: offset.y + 2, z: offset.z + 3 },
      coordinateSystem,
    );
  });
  assertVector(result.finalState.workPosition, { x: 1, y: 2, z: 3 }, "G59 work position");
});

test("keeps G91 increments physical and scales G20 absolute coordinates inside a WCS", async () => {
  const { interpretGcode } = await loadInterpreter();
  const result = interpretGcode(
    [
      "G21 G90 G55",
      "G0 X10 Y20 Z0",
      "G91",
      "G1 X5 Y-5 Z2 F100",
      "G20 G90",
      "G1 X1 Y2 Z0 F10",
    ].join("\n"),
    {
      initialPosition: { x: 0, y: 0, z: 0 },
      workOffsets: { G55: { x: 100, y: 200, z: 300 } },
    },
  );

  assertVector(result.motions[0].end, { x: 110, y: 220, z: 300 }, "G90 millimetres");
  assertVector(result.motions[1].end, { x: 115, y: 215, z: 302 }, "G91 increment");
  assertVector(result.motions[2].end, { x: 125.4, y: 250.8, z: 300 }, "G90 inches");
  assertVector(result.finalState.workPosition, { x: 25.4, y: 50.8, z: 0 }, "final work position");
  assert.equal(result.finalState.feed, 254);
});

test("applies G92 globally across WCS switches and supports suspend and restore", async () => {
  const { interpretGcode } = await loadInterpreter();
  const result = interpretGcode(
    [
      "G21 G90 G54",
      "G91 G92 X0 Y0",
      "G90 G0 X10 Y10",
      "G55 G0 X10 Y10",
      "G92.2",
      "G0 X20 Y20",
      "G92.3",
      "G0 X20 Y20",
    ].join("\n"),
    {
      initialPosition: { x: 110, y: 220, z: 30 },
      workOffsets: {
        G54: { x: 100, y: 200, z: 0 },
        G55: { x: 300, y: 400, z: 0 },
      },
    },
  );

  assert.deepEqual(
    result.motions.map((motion) => ({ x: motion.end.x, y: motion.end.y })),
    [
      { x: 120, y: 230 },
      { x: 320, y: 430 },
      { x: 320, y: 420 },
      { x: 330, y: 440 },
    ],
  );
  assertVector(result.finalState.g92Offset, { x: 10, y: 20, z: 0 }, "restored G92");
  assertVector(result.finalState.workPosition, { x: 20, y: 20, z: 30 }, "restored work position");
  assert.equal(result.finalState.g92Suspended, false);
});

test("treats G53 as absolute non-modal machine coordinates even while G91 is active", async () => {
  const { interpretGcode } = await loadInterpreter();
  const result = interpretGcode(
    [
      "G21 G90 G55",
      "G92 X0 Y0 Z0",
      "G0 X10 Y10 Z10",
      "G91 G53 X5 Y6 Z7",
      "G90 G0 X0 Y0 Z0",
    ].join("\n"),
    {
      initialPosition: { x: 310, y: 420, z: 30 },
      workOffsets: { G55: { x: 300, y: 400, z: 0 } },
    },
  );

  assertVector(result.motions[0].end, { x: 320, y: 430, z: 40 }, "work move before G53");
  assertVector(result.motions[1].end, { x: 5, y: 6, z: 7 }, "G53 machine move");
  assertVector(result.motions[2].end, { x: 310, y: 420, z: 30 }, "non-modal WCS restored");
  assert.equal(
    result.diagnostics.some((diagnostic) => diagnostic.code === "G53_REQUIRES_G90"),
    false,
  );
});

test("transforms absolute arc centers on every principal plane", async () => {
  const { interpretGcode } = await loadInterpreter();
  const result = interpretGcode(
    [
      "G21 G90 G90.1 G56 F100",
      "G17 G0 X0 Y0 Z0",
      "G2 X10 Y0 I5 J0",
      "G0 X0 Y0 Z0",
      "G18 G2 X10 Z0 I5 K0",
      "G0 X0 Y0 Z0",
      "G19 G2 Y10 Z0 J5 K0",
    ].join("\n"),
    {
      initialPosition: { x: 0, y: 0, z: 0 },
      workOffsets: { G56: { x: 100, y: 200, z: 300 } },
    },
  );
  const arcs = result.motions.filter((motion) => motion.type === "arc-cw");

  assert.equal(arcs.length, 3);
  assert.deepEqual(arcs.map((motion) => motion.plane), ["XY", "XZ", "YZ"]);
  assertVector(arcs[0].center, { x: 105, y: 200, z: 300 }, "G17 center");
  assertVector(arcs[1].center, { x: 105, y: 200, z: 300 }, "G18 center");
  assertVector(arcs[2].center, { x: 100, y: 205, z: 300 }, "G19 center");
});
