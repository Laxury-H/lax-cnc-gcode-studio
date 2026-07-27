import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadParser() {
  const pageSource = await fs.readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  );
  const start = pageSource.indexOf("type Vec3");
  const end = pageSource.indexOf("function pointOnSegment");
  assert.ok(start >= 0 && end > start, "pure parser section must be present");

  const source = `${pageSource.slice(start, end)}
export { DEFAULT_STOCK, orientStockForProgram, parseProgram };`;
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
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
