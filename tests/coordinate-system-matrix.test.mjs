import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadModule(relativeEntry) {
  const entry = path.resolve(__dirname, relativeEntry);
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

function assertPoint(actual, expected, message) {
  for (const axis of ["x", "y", "z"]) {
    assert.equal(actual[axis], expected[axis], `${message}: ${axis}`);
  }
}

const workOffsets = {
  G54: { x: 100, y: 200, z: 10 },
  G55: { x: 500, y: 600, z: 20 },
};

test("G54/G55 absolute moves and G91 increments share one machine frame", async () => {
  const { interpretGcode } = await loadModule("../core/gcode/interpreter.ts");
  const program = interpretGcode(
    [
      "G21 G90 G54",
      "G0 X10 Y20 Z5",
      "G55",
      "G0 X10 Y20 Z5",
      "G91",
      "G1 X1 Y-2 Z3 F100",
    ].join("\n"),
    {
      initialPosition: { x: 0, y: 0, z: 0 },
      initialAxesKnown: { x: true, y: true, z: true },
      workOffsets,
    },
  );

  assert.equal(program.motions.length, 3);
  assertPoint(program.motions[0].end, { x: 110, y: 220, z: 15 }, "G54 absolute");
  assertPoint(program.motions[1].end, { x: 510, y: 620, z: 25 }, "G55 absolute");
  assertPoint(program.motions[2].end, { x: 511, y: 618, z: 28 }, "G91 incremental");
  assertPoint(program.finalState.workPosition, { x: 11, y: 18, z: 8 }, "final G55 work position");
});

test("G53 bypasses G55 and G92 without changing the active work system", async () => {
  const { interpretGcode } = await loadModule("../core/gcode/interpreter.ts");
  const program = interpretGcode(
    [
      "G21 G90 G55",
      "G92 X0 Y0 Z0",
      "G0 X2 Y3 Z-1",
      "G53 G0 X0 Y0 Z0",
      "G0 X0 Y0 Z0",
    ].join("\n"),
    {
      initialPosition: { x: 510, y: 620, z: 25 },
      initialAxesKnown: { x: true, y: true, z: true },
      workOffsets,
    },
  );

  assert.equal(program.motions.length, 3);
  assertPoint(program.motions[0].end, { x: 512, y: 623, z: 24 }, "G55 plus G92");
  assertPoint(program.motions[1].end, { x: 0, y: 0, z: 0 }, "G53 machine origin");
  assertPoint(program.motions[2].end, { x: 510, y: 620, z: 25 }, "return to G55 work zero");
  assert.equal(program.finalState.coordinateSystem, "G55");
  assertPoint(program.finalState.workPosition, { x: 0, y: 0, z: 0 }, "final work position");
});

test("a partial G92 zeroes offsets on axes omitted from the command", async () => {
  const { interpretGcode } = await loadModule("../core/gcode/interpreter.ts");
  const program = interpretGcode(
    [
      "G21 G90 G54",
      "G92 X0 Y0 Z0",
      "G92 X5",
      "G0 X5 Y0 Z0",
    ].join("\n"),
    {
      initialPosition: { x: 110, y: 220, z: 15 },
      initialAxesKnown: { x: true, y: true, z: true },
      workOffsets,
    },
  );

  assertPoint(program.finalState.g92Offset, { x: 5, y: 0, z: 0 }, "replacement G92 offset");
  assertPoint(program.finalState.machinePosition, { x: 110, y: 200, z: 10 }, "resolved physical point");
  assertPoint(program.finalState.workPosition, { x: 5, y: 0, z: 0 }, "requested work coordinates");
});

test("G53 remains machine-absolute while G91 is active", async () => {
  const { interpretGcode } = await loadModule("../core/gcode/interpreter.ts");
  const program = interpretGcode(
    [
      "G21 G90 G54",
      "G0 X10 Y20 Z5",
      "G91",
      "G53 G0 X0 Y0 Z0",
    ].join("\n"),
    {
      initialPosition: { x: 0, y: 0, z: 0 },
      initialAxesKnown: { x: true, y: true, z: true },
      workOffsets,
    },
  );

  assert.equal(program.diagnostics.some(({ code }) => code === "G53_REQUIRES_G90"), false);
  assert.equal(program.motions.length, 2);
  assertPoint(program.finalState.machinePosition, { x: 0, y: 0, z: 0 }, "G53 machine target");
});

test("all seven stock-origin presets bound geometry without shifting programmed coordinates", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadModule("../core/simulation/studio-program.ts");
  const presets = [
    ["top-left", 0, -50],
    ["top-center", -50, -50],
    ["top-right", -100, -50],
    ["center", -50, -25],
    ["bottom-left", 0, 0],
    ["bottom-center", -50, 0],
    ["bottom-right", -100, 0],
  ];

  for (const [name, originX, originY] of presets) {
    const stock = {
      ...DEFAULT_STOCK,
      width: 100,
      height: 50,
      originX,
      originY,
      safeZ: 5,
      zZero: "top",
    };
    const center = { x: originX + 50, y: originY + 25 };
    const simulation = parseProgram(
      [
        "G21 G90 G54",
        `G0 X${center.x} Y${center.y} Z5`,
        `G1 X${center.x + 1} Y${center.y} Z-2 F100`,
      ].join("\n"),
      stock,
      "iso",
    );

    assert.equal(simulation.segments.length, 1, name);
    assertPoint(
      simulation.segments[0].start,
      { ...center, z: 5 },
      `${name} start`,
    );
    assertPoint(
      simulation.segments[0].end,
      { x: center.x + 1, y: center.y, z: -2 },
      `${name} unshifted target`,
    );
    assert.equal(
      simulation.diagnostics.some(({ code }) => code === "OUTSIDE_STOCK"),
      false,
      name,
    );
  }
});

test("auto-orientation preserves every pinned stock origin", async () => {
  const { DEFAULT_STOCK, orientStockForProgram } = await loadModule(
    "../core/simulation/studio-program.ts",
  );
  const anchors = [
    ["top-left", 0, -50, 0, -100],
    ["top-center", -50, -50, -25, -100],
    ["top-right", -100, -50, -50, -100],
    ["center", -50, -25, -25, -50],
    ["bottom-left", 0, 0, 0, 0],
    ["bottom-center", -50, 0, -25, 0],
    ["bottom-right", -100, 0, -50, 0],
  ];

  for (const [name, originX, originY, rotatedOriginX, rotatedOriginY] of anchors) {
    const currentStock = {
      ...DEFAULT_STOCK,
      width: 100,
      height: 50,
      originX,
      originY,
      safeZ: 5,
      zZero: "top",
    };
    const portraitProgram = [
      "G21 G90 G54",
      `G0 X${rotatedOriginX + 5} Y${rotatedOriginY + 5} Z5`,
      `G1 X${rotatedOriginX + 45} Y${rotatedOriginY + 95} Z-1 F100`,
    ].join("\n");
    const orientation = orientStockForProgram(
      portraitProgram,
      currentStock,
      "iso",
    );

    assert.equal(orientation.rotated, true, name);
    assert.equal(orientation.stock.width, 50, `${name} width`);
    assert.equal(orientation.stock.height, 100, `${name} height`);
    assert.equal(orientation.stock.originX, rotatedOriginX, `${name} origin X`);
    assert.equal(orientation.stock.originY, rotatedOriginY, `${name} origin Y`);
  }
});

test("manual stock resize preserves quick pins but not free-form origins", async () => {
  const { DEFAULT_STOCK, resizeStockPreservingPinnedOrigin } = await loadModule(
    "../core/simulation/studio-program.ts",
  );

  const pinned = resizeStockPreservingPinnedOrigin(
    {
      ...DEFAULT_STOCK,
      width: 100,
      height: 50,
      originX: -50,
      originY: -50,
    },
    200,
    80,
  );
  assert.equal(pinned.originX, -100);
  assert.equal(pinned.originY, -80);

  const freeForm = resizeStockPreservingPinnedOrigin(
    {
      ...DEFAULT_STOCK,
      width: 100,
      height: 50,
      originX: 12.5,
      originY: -17.5,
    },
    200,
    80,
  );
  assert.equal(freeForm.originX, 12.5);
  assert.equal(freeForm.originY, -17.5);
});

test("top-zero and bottom-zero stock references produce explicit numerical Z bounds", async () => {
  const { resolveStockZBounds } = await loadModule("../core/measurement/measurement-utils.ts");
  const stock = { thickness: 18 };
  const simulation = { bounds: { minZ: -2 } };

  assert.deepEqual(resolveStockZBounds(simulation, { ...stock, zZero: "top" }), {
    topZ: 0,
    bottomZ: -18,
  });
  assert.deepEqual(resolveStockZBounds(simulation, { ...stock, zZero: "bottom" }), {
    topZ: 18,
    bottomZ: 0,
  });
});

test("the solid-view transform puts programmed Z zero on the selected stock face", async () => {
  const { mapCncPointToSolidWorld } = await loadModule(
    "../core/simulation/stock-removal-coordinates.ts",
  );
  const stock = {
    width: 100,
    height: 50,
    thickness: 18,
    originX: -100,
    originY: -50,
  };
  const topZeroBounds = { topZ: 0, bottomZ: -18 };
  const bottomZeroBounds = { topZ: 18, bottomZ: 0 };

  assertPoint(
    mapCncPointToSolidWorld(
      { x: -50, y: -25, z: 0 },
      stock,
      topZeroBounds,
    ),
    { x: 0, y: 18, z: 0 },
    "top-zero stock surface",
  );
  assertPoint(
    mapCncPointToSolidWorld(
      { x: -50, y: -25, z: -18 },
      stock,
      topZeroBounds,
    ),
    { x: 0, y: 0, z: 0 },
    "top-zero stock bottom",
  );
  assertPoint(
    mapCncPointToSolidWorld(
      { x: -50, y: -25, z: 0 },
      stock,
      bottomZeroBounds,
    ),
    { x: 0, y: 0, z: 0 },
    "bottom-zero stock bottom",
  );
  assertPoint(
    mapCncPointToSolidWorld(
      { x: -50, y: -25, z: 18 },
      stock,
      bottomZeroBounds,
    ),
    { x: 0, y: 18, z: 0 },
    "bottom-zero stock surface",
  );
});

test("studio normalizes every configured WCS into the G54 display frame", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadModule(
    "../core/simulation/studio-program.ts",
  );
  const simulation = parseProgram(
    [
      "G21 G90 G54",
      "G0 X10 Y20 Z5",
      "G1 X20 Y20 Z-2 F100",
      "G55",
      "G0 X0 Y0 Z5",
      "G1 X10 Y0 Z-1 F100",
    ].join("\n"),
    { ...DEFAULT_STOCK, width: 200, height: 100, safeZ: 5 },
    "iso",
    {
      G54: { x: 100, y: 200, z: 10 },
      G55: { x: 140, y: 260, z: 15 },
    },
  );

  assert.equal(simulation.segments.length, 3);
  assertPoint(
    simulation.segments[0].end,
    { x: 20, y: 20, z: -2 },
    "G54 remains in programmed coordinates",
  );
  assertPoint(
    simulation.segments[1].end,
    { x: 40, y: 60, z: 10 },
    "G55 origin is relative to G54",
  );
  assertPoint(
    simulation.segments[2].end,
    { x: 50, y: 60, z: 4 },
    "G55 cut is translated by its physical fixture offset",
  );
  assertPoint(
    simulation.finalState.position,
    { x: 50, y: 60, z: 4 },
    "final display position",
  );
  assertPoint(
    simulation.finalState.workPosition,
    { x: 10, y: 0, z: -1 },
    "final active-WCS position",
  );
  assertPoint(
    simulation.segments[2].workEnd,
    { x: 10, y: 0, z: -1 },
    "cursor DRO position in G55",
  );
  assert.equal(simulation.segments[2].coordinateSystem, "G55");
  assert.equal(simulation.segments[2].distanceMode, "absolute");
  assert.equal(simulation.segments[2].machineCoordinates, false);
  assert.equal(simulation.finalState.coordinateSystem, "G55");
  assert.equal(
    simulation.diagnostics.some(
      ({ code }) => code === "WCS_OFFSET_UNCONFIGURED",
    ),
    false,
  );
});

test("studio keeps a distant G53 machine move out of workpiece geometry", async () => {
  const { DEFAULT_STOCK, orientStockForProgram, parseProgram } = await loadModule(
    "../core/simulation/studio-program.ts",
  );
  const simulation = parseProgram(
    [
      "G21 G90 G54",
      "G0 X10 Y10 Z5",
      "G1 X20 Y10 Z-1 F100",
      "G55 G0 X0 Y0 Z5",
      "G1 X10 Y0 Z-1 F100",
      "G91 G53 G1 X0 Y0 Z0 F50",
    ].join("\n"),
    { ...DEFAULT_STOCK, width: 100, height: 100, safeZ: 5 },
    "iso",
    {
      G54: { x: 1000, y: 500, z: 0 },
      G55: { x: 1040, y: 560, z: 5 },
    },
  );

  const park = simulation.segments.at(-1);
  assert.equal(park.kind, "cut");
  assert.equal(park.machineCoordinates, true);
  assert.equal(park.coordinateSystem, "G55");
  assert.equal(park.distanceMode, "incremental");
  assertPoint(park.end, { x: -1000, y: -500, z: 0 }, "G53 display endpoint");
  assertPoint(park.workEnd, { x: -1040, y: -560, z: -5 }, "G53 active-WCS DRO");
  assert.deepEqual(simulation.bounds, {
    minX: 10,
    minY: 10,
    minZ: -1,
    maxX: 50,
    maxY: 60,
    maxZ: 10,
  });
  assert.ok(
    Math.abs(simulation.cutLength - 2 * Math.hypot(10, 6)) < 1e-9,
    "G53 machine feed is travel, not workpiece cut length",
  );
  assert.equal(
    simulation.diagnostics.some(
      ({ code, line }) => code === "OUTSIDE_STOCK" && line === 6,
    ),
    false,
  );
  assert.equal(
    simulation.diagnostics.some(
      ({ code, line }) => code === "LOW_RAPID" && line === 6,
    ),
    false,
  );

  const portraitProgram = [
    "G21 G90 G54",
    "G0 X5 Y5 Z5",
    "G1 X40 Y90 Z-1 F100",
    "G53 G0 X0 Y0 Z0",
  ].join("\n");
  const orientation = orientStockForProgram(
    portraitProgram,
    { ...DEFAULT_STOCK, width: 100, height: 50, safeZ: 5 },
    "iso",
    { G54: { x: 1000, y: 500, z: 0 } },
  );
  assert.equal(orientation.rotated, true);
  assert.equal(orientation.stock.width, 50);
  assert.equal(orientation.stock.height, 100);
});

test("studio warns when a non-G54 fixture uses an indistinguishable offset", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadModule(
    "../core/simulation/studio-program.ts",
  );
  const simulation = parseProgram(
    ["G21 G90 G55", "G0 X10 Y10 Z5", "G1 X20 Y10 Z-1 F100"].join("\n"),
    { ...DEFAULT_STOCK, width: 100, height: 50, safeZ: 5 },
    "iso",
  );

  assert.equal(
    simulation.diagnostics.some(
      ({ code }) => code === "WCS_OFFSET_UNCONFIGURED",
    ),
    true,
  );
});
