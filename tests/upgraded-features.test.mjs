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

test("advanced tool profiles (bullnose, chamfer, facemill) calculate correct contact diameters", async () => {
  const {
    resolveCutterContactDiameter,
    MATERIAL_CUTTING_PRESETS,
  } = await loadModule("../core/simulation/stock-removal-coordinates.ts");

  const stockBounds = { topZ: 0, bottomZ: -18 };

  // Facemill: always full diameter when in cut
  const facemill = { id: "10", type: "facemill", diameter: 32 };
  assert.equal(resolveCutterContactDiameter(facemill, -2, stockBounds), 32);

  // Chamfer mill: 90 deg included angle with tip diameter 1mm
  const chamfer = { id: "11", type: "chamfer", diameter: 12, angle: 90, tipDiameter: 1 };
  const chamferDia = resolveCutterContactDiameter(chamfer, -1, stockBounds);
  assert.ok(chamferDia > 1 && chamferDia <= 12, `Chamfer dia ${chamferDia} is bounded`);

  // Bullnose mill: 10mm diameter with 2mm corner radius
  const bullnose = { id: "12", type: "bullnose", diameter: 10, cornerRadius: 2 };
  const bullnoseDiaAtShallow = resolveCutterContactDiameter(bullnose, -0.5, stockBounds);
  const bullnoseDiaAtFull = resolveCutterContactDiameter(bullnose, -5, stockBounds);
  assert.ok(bullnoseDiaAtShallow > 0 && bullnoseDiaAtShallow < 10);
  assert.equal(bullnoseDiaAtFull, 10);

  // Material presets check
  assert.ok(MATERIAL_CUTTING_PRESETS.length >= 4);
  assert.ok(MATERIAL_CUTTING_PRESETS.some((p) => p.material === "hardwood"));
  assert.ok(MATERIAL_CUTTING_PRESETS.some((p) => p.material === "aluminum"));
});

test("G-code syntax highlighter parses and tokenizes words properly", async () => {
  const { highlightGcodeLine } = await loadModule("../core/components/GcodeEditor.tsx");

  const tokens = highlightGcodeLine("G1 X10.500 Y20.000 Z-2.000 F1500 ; Cut contour");
  assert.ok(Array.isArray(tokens));
  assert.ok(tokens.length > 0);
});

test("Web Serial CNC Controller parses GRBL status reports", async () => {
  const { CncSerialController } = await loadModule("../core/controllers/web-serial.ts");

  let reportedStatus = null;
  const controller = new CncSerialController({
    onStatusUpdate: (st) => {
      reportedStatus = st;
    },
  });

  // Test status string parser
  // @ts-expect-error testing private parseGrblStatus method
  controller["parseGrblStatus"]("<Idle|MPos:10.500,20.000,5.000|FS:1200,18000>");

  assert.ok(reportedStatus);
  assert.equal(reportedStatus.state, "Idle");
  assert.equal(reportedStatus.mPos.x, 10.5);
  assert.equal(reportedStatus.mPos.y, 20.0);
  assert.equal(reportedStatus.mPos.z, 5.0);
  assert.equal(reportedStatus.feedRate, 1200);
  assert.equal(reportedStatus.spindleRpm, 18000);
});
