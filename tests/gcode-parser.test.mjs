import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadParser() {
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

const topPanelFixture = `G54
T1
G43H1
M03 S18000
G00 X924.5000 Y40.5000
G00 Z25.0000
G01 Z4.0000 F800.0000
G02 I0.0000 J-4.5000 F800.0000
G00 Z25.0000
G00 X-3.0000 Y47.0000
G01 Z17.0000 F12000.0000
G01 X-3.0000 Y22.0000 Z-0.1000 F12000.0000
G01 X-3.0000 Y0.0000 Z-0.1000 F12000.0000
G03 X0.0000 Y-3.0000 Z-0.1000 I3.0000 J0.0000 F800.0000
G01 X498.0000 Y-3.0000 Z-0.1000 F12000.0000
G03 X501.0000 Y0.0000 Z-0.1000 I0.0000 J3.0000 F800.0000
G01 X501.0000 Y1864.0000 Z-0.1000 F12000.0000
G03 X498.0000 Y1867.0000 Z-0.1000 I-3.0000 J0.0000 F800.0000
G01 X0.0000 Y1867.0000 Z-0.1000 F12000.0000
G03 X-3.0000 Y1864.0000 Z-0.1000 I0.0000 J-3.0000 F800.0000
G01 X-3.0000 Y72.0000 Z-0.1000 F12000.0000
G01 X-3.0000 Y22.0000 Z-0.1000 F5000.0000
G00 Z25.0000
M05
M30`;

test("handles the uploaded CAM dialect without inventing a rapid from origin", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadParser();
  const simulation = parseProgram(topPanelFixture, DEFAULT_STOCK, "iso");

  assert.equal(
    simulation.segments.some((segment) => segment.lineNumber === 5),
    false,
  );
  assert.equal(simulation.finalState.tool, "T1");
});

test("renders G2/G3 full circles that omit X and Y", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadParser();
  const simulation = parseProgram(topPanelFixture, DEFAULT_STOCK, "iso");
  const circle = simulation.segments.find(
    (segment) =>
      segment.kind === "arc-cw" &&
      Math.abs(segment.start.x - segment.end.x) < 0.001 &&
      Math.abs(segment.start.y - segment.end.y) < 0.001,
  );

  assert.ok(circle);
  assert.ok(circle.points.length >= 13);
  assert.ok(Math.abs(circle.length - Math.PI * 9) < 0.2);
});

test("finds a closed profile after its lead-in and reports finished size", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadParser();
  const stock = { ...DEFAULT_STOCK, width: 1220, height: 2440 };
  const simulation = parseProgram(topPanelFixture, stock, "iso");

  assert.equal(simulation.parts.length, 1);
  assert.equal(simulation.parts[0].compensated, true);
  assert.ok(Math.abs(simulation.parts[0].width - 498) < 0.01);
  assert.ok(Math.abs(simulation.parts[0].height - 1864) < 0.01);
});

test("keeps labels for large closed layout profiles before a through cut", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadParser();
  const simulation = parseProgram(
    `G21 G90 G54
M3 S18000
G0 X20 Y20 Z22
G1 Z7 F1000
G1 X720 Y20
G1 X720 Y400
G1 X20 Y400
G1 X20 Y20
M5`,
    { ...DEFAULT_STOCK, width: 1000, height: 600, thickness: 18 },
    "iso",
  );

  assert.equal(simulation.parts.length, 1);
  assert.equal(simulation.parts[0].id, "P01");
  assert.equal(simulation.parts[0].throughCut, false);
  assert.ok(simulation.parts[0].labelPosition);
});

test("sample cabinet layout exposes all twelve visible part labels", async () => {
  const { DEFAULT_STOCK, SAMPLE_GCODE, parseProgram } = await loadParser();
  const simulation = parseProgram(SAMPLE_GCODE, DEFAULT_STOCK, "iso");

  assert.equal(simulation.parts.length, 12);
  assert.deepEqual(
    simulation.parts.map((part) => part.id),
    Array.from({ length: 12 }, (_, index) =>
      `P${String(index + 1).padStart(2, "0")}`,
    ),
  );
});

test("builds true contour topology for holes and concave sheet parts", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadParser();
  const program = `G21 G90 G54
M3 S18000
G0 X0 Y0 Z5
G1 Z-1 F500
G1 X300 Y0
G1 X300 Y200
G1 X0 Y200
G1 X0 Y0
G0 Z5
G0 X50 Y50
G1 Z-1
G1 X100 Y50
G1 X100 Y100
G1 X50 Y100
G1 X50 Y50
G0 Z5
G0 X400 Y0
G1 Z-1
G1 X500 Y0
G1 X500 Y20
G1 X420 Y20
G1 X420 Y100
G1 X400 Y100
G1 X400 Y0
M5`;
  const simulation = parseProgram(
    program,
    { ...DEFAULT_STOCK, width: 600, height: 250, thickness: 1 },
    "iso",
  );

  assert.equal(simulation.parts.length, 2);
  assert.equal(simulation.parts[0].holes?.length, 1);
  assert.ok(Math.abs(simulation.parts[0].area - 57_500) < 0.01);
  assert.ok(Math.abs(simulation.parts[1].area - 3_600) < 0.01);
  assert.notEqual(simulation.parts[1].area, simulation.parts[1].width * simulation.parts[1].height);
  assert.ok(simulation.parts.every((part) => part.labelPosition));
});

test("uses contour distance instead of overlapping bounding boxes for clearance", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadParser();
  const simulation = parseProgram(
    `G21 G90 G54
M3 S18000
G0 X0 Y0 Z5
G1 Z-1 F500
G1 X100 Y0
G1 X100 Y20
G1 X20 Y20
G1 X20 Y100
G1 X0 Y100
G1 X0 Y0
G0 Z5
G0 X40 Y40
G1 Z-1
G1 X90 Y40
G1 X90 Y90
G1 X40 Y90
G1 X40 Y40
M5`,
    { ...DEFAULT_STOCK, width: 150, height: 150, thickness: 1, clearance: 10 },
    "iso",
  );

  assert.equal(simulation.parts.length, 2);
  assert.ok(Math.abs(simulation.parts[0].nearestGap - 20) < 0.01);
  assert.equal(
    simulation.diagnostics.some((diagnostic) =>
      diagnostic.message.includes("đang chồng biên dạng"),
    ),
    false,
  );
});

test("deduplicates repeated depth passes over one physical contour", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadParser();
  const rectanglePass = (depth) => `G0 X10 Y10 Z5
G1 Z${depth} F500
G1 X210 Y10
G1 X210 Y110
G1 X10 Y110
G1 X10 Y10
G0 Z5`;
  const simulation = parseProgram(
    `G21 G90 G54
M3 S18000
${rectanglePass(-2)}
${rectanglePass(-4)}
M5`,
    { ...DEFAULT_STOCK, width: 300, height: 200, thickness: 3 },
    "iso",
  );

  assert.equal(simulation.parts.length, 1);
  assert.ok(Math.abs(simulation.parts[0].area - 20_000) < 0.01);
});

test("keeps valid small parts instead of applying a fixed 40 mm cutoff", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadParser();
  const simulation = parseProgram(
    `G21 G90 G54
M3 S18000
G0 X10 Y10 Z5
G1 Z-1 F300
G1 X22 Y10
G1 X22 Y22
G1 X10 Y22
G1 X10 Y10
M5`,
    { ...DEFAULT_STOCK, width: 50, height: 50, thickness: 1 },
    "iso",
  );

  assert.equal(simulation.parts.length, 1);
  assert.equal(simulation.parts[0].width, 12);
  assert.equal(simulation.parts[0].height, 12);
});

test("finds reusable rectangular stock inside a large cutout", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadParser();
  const simulation = parseProgram(
    `G21 G90 G54
M3 S18000
G0 X0 Y0 Z5
G1 Z-2 F500
G1 X500 Y0
G1 X500 Y500
G1 X0 Y500
G1 X0 Y0
G0 Z5
G0 X100 Y100
G1 Z-2
G1 X400 Y100
G1 X400 Y400
G1 X100 Y400
G1 X100 Y100
M5`,
    { ...DEFAULT_STOCK, width: 500, height: 500, thickness: 2 },
    "iso",
  );

  assert.equal(simulation.parts[0].holes?.length, 1);
  assert.equal(
    simulation.parts[0].labelPosition.x > 100 &&
      simulation.parts[0].labelPosition.x < 400 &&
      simulation.parts[0].labelPosition.y > 100 &&
      simulation.parts[0].labelPosition.y < 400,
    false,
  );
  assert.ok(
    simulation.offcuts.some(
      (offcut) => offcut.width >= 299.9 && offcut.height >= 299.9,
    ),
  );
});

test("rotates a 2440 by 1220 stock when program coordinates are portrait", async () => {
  const { DEFAULT_STOCK, orientStockForProgram } = await loadParser();
  const result = orientStockForProgram(topPanelFixture, DEFAULT_STOCK, "iso");

  assert.equal(result.rotated, true);
  assert.equal(result.stock.width, 1220);
  assert.equal(result.stock.height, 2440);
});

test("restores a persisted portrait stock to landscape for a landscape program", async () => {
  const { DEFAULT_STOCK, orientStockForProgram } = await loadParser();
  const landscapeProgram = `G90 G21 G54
G0 X10 Y10
G1 X90 Y10 F100
G1 X90 Y40
G1 X10 Y40
G1 X10 Y10`;
  const persistedPortraitStock = {
    ...DEFAULT_STOCK,
    width: 50,
    height: 100,
  };

  const result = orientStockForProgram(
    landscapeProgram,
    persistedPortraitStock,
    "iso",
  );

  assert.equal(result.rotated, true);
  assert.equal(result.stock.width, 100);
  assert.equal(result.stock.height, 50);
});

test("extracts usable offcuts from sheet stock without overlapping parts", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadParser();
  const stock = { ...DEFAULT_STOCK, width: 1220, height: 2440 };
  const simulation = parseProgram(topPanelFixture, stock, "iso");

  assert.ok(Array.isArray(simulation.offcuts));
  assert.ok(simulation.offcuts.length > 0);
  assert.match(simulation.offcuts[0].id, /^OFF-\d+/);
  assert.ok(simulation.offcuts[0].area > 0);
});

test("generates smart resume recovery gcode block", async () => {
  const { DEFAULT_STOCK, parseProgram, generateSmartResume } = await loadParser();
  const simulation = parseProgram(topPanelFixture, DEFAULT_STOCK, "iso");
  const recovery = generateSmartResume(simulation, 5, 50);

  assert.match(recovery, /Lax's CNC - SMART RESUME/);
  assert.match(recovery, /G0 Z50\.000/);
  assert.match(recovery, /M3 S18000/);
});

test("keeps S in RPM through final state, segments, and recovery", async () => {
  const { DEFAULT_STOCK, parseProgram, generateSmartResume } = await loadParser();
  const programmedSpindle = 12345;
  const simulation = parseProgram(
    `G20 G90
M3 S${programmedSpindle}
G0 X0 Y0 Z1
G1 X1 F10
M5
M30`,
    DEFAULT_STOCK,
    "iso",
  );

  assert.equal(simulation.finalState.units, "inch");
  assert.equal(simulation.finalState.spindle, programmedSpindle);
  assert.equal(simulation.finalState.spindleOn, false);
  assert.equal(simulation.segments[0].spindle, programmedSpindle);

  const recovery = generateSmartResume(simulation, 0, 50);
  assert.match(recovery, /M3 S12345\b/);
  assert.doesNotMatch(recovery, /M3 S18000\b/);
});

test("preserves M3/M5 spindle state on each motion for physical stock removal", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadParser();
  const simulation = parseProgram(
    `G21 G90
G0 X0 Y0 Z5
M3 S12000
G1 X10 Y0 Z-1 F500
M5
G1 X20 Y0 Z-1`,
    { ...DEFAULT_STOCK, width: 100, height: 50 },
    "iso",
  );

  const cutting = simulation.segments.find((segment) => segment.raw.includes("X10"));
  const spindleStopped = simulation.segments.find((segment) => segment.raw.includes("X20"));
  assert.equal(cutting?.spindleState, "cw");
  assert.equal(cutting?.spindle, 12000);
  assert.equal(spindleStopped?.spindleState, "off");
  assert.equal(spindleStopped?.spindle, 12000);

  const counterClockwise = parseProgram(
    "G21 G90\nG0 X0 Y0 Z5\nM4 S8000\nG1 X5 Y0 Z-0.5 F300",
    { ...DEFAULT_STOCK, width: 100, height: 50 },
    "iso",
  );
  assert.equal(counterClockwise.segments.at(-1)?.spindleState, "ccw");
});

test("exports CAM post-processor dialects for NcStudio and Syntec", async () => {
  const { DEFAULT_STOCK, parseProgram, exportCAM } = await loadParser();
  const simulation = parseProgram(topPanelFixture, DEFAULT_STOCK, "iso");

  const ncstudio = exportCAM(simulation, "ncstudio", "Test Project");
  assert.match(ncstudio, /WEIHONG NCSTUDIO V15/);
  assert.match(ncstudio, /G21 G90 G54 G17 G40 G49 G80/);
  assert.doesNotMatch(ncstudio, /G2[89]\b/);

  const syntec = exportCAM(simulation, "syntec", "Test Project");
  assert.match(syntec, /TAIWAN SYNTEC ATC/);
  assert.match(syntec, /G21 G90 G54 G17 G40 G49 G80/);
  assert.doesNotMatch(syntec, /G2[89]\b/);
});

test("post-processors preserve dwell and all three arc planes on round-trip", async () => {
  const { DEFAULT_STOCK, parseProgram, exportCAM } = await loadParser();
  const source = `G21 G90 G54 G17
G00 X0 Y0 Z5
G04 P1250
G18
G02 X10 Z-5 I5 K-5 F600
G19
G03 Y10 Z5 J5 K5 F600
M30`;
  const simulation = parseProgram(source, DEFAULT_STOCK, "iso");

  for (const target of ["ncstudio", "syntec"]) {
    const output = exportCAM(simulation, target, "Round trip ) G00 X999");
    assert.match(output, /G04 P1250\b/);
    assert.match(output, /G18\r?\nG02 .* I[-\d.]+ K[-\d.]+/);
    assert.match(output, /G19\r?\nG03 .* J[-\d.]+ K[-\d.]+/);
    assert.doesNotMatch(output, /ROUND TRIP \) G00 X999/);

    const roundTrip = parseProgram(output, DEFAULT_STOCK, "iso");
    const dwell = roundTrip.segments.find((segment) => segment.kind === "dwell");
    assert.equal(dwell?.estimatedDurationMs, 1250);
    assert.equal(
      roundTrip.diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
      0,
    );
  }
});

test("interprets dwell P using the active controller profile", async () => {
  const { DEFAULT_STOCK, parseProgram } = await loadParser();
  const source = "G21 G90 G04 P250\nM30";
  const iso = parseProgram(source, DEFAULT_STOCK, "iso");
  const custom = parseProgram(source, DEFAULT_STOCK, "router-custom");

  assert.equal(iso.segments[0]?.estimatedDurationMs, 250);
  assert.equal(custom.segments[0]?.estimatedDurationMs, 250_000);
});

test("post-processors establish a safe start and keep expanded drilling linear", async () => {
  const { DEFAULT_STOCK, parseProgram, exportCAM } = await loadParser();
  const simulation = parseProgram(
    `G21 G90 G54
G00 X100 Y200 Z20
G81 X120 Y220 Z-5 R3 F500
G80
M30`,
    DEFAULT_STOCK,
    "iso",
  );
  const output = exportCAM(simulation, "ncstudio", "Safety");
  const firstSafetyMove = output.indexOf("G00 Z50.000");
  const firstXYMove = output.indexOf("G00 X");

  assert.ok(firstSafetyMove >= 0 && firstSafetyMove < firstXYMove);
  assert.doesNotMatch(output, /\bG81\b/);
  assert.match(output, /G01 .*Z-5\.000 F500\.0/);
});
