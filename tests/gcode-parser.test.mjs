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
