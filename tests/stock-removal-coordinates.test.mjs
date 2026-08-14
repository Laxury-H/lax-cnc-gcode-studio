import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let modulePromise;
let gcodeUtilsPromise;

function loadCoordinates() {
  modulePromise ??= build({
    entryPoints: [
      path.resolve(
        __dirname,
        "../core/simulation/stock-removal-coordinates.ts",
      ),
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
  return modulePromise;
}

function loadGcodeUtils() {
  gcodeUtilsPromise ??= build({
    absWorkingDir: path.resolve(__dirname, ".."),
    entryPoints: [path.resolve(__dirname, "../core/utils/gcode-utils.ts")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "es2022",
  }).then((result) => {
    const compiled = result.outputFiles[0].text;
    const url = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
    return import(url);
  });
  return gcodeUtilsPromise;
}

function assertClose(actual, expected, epsilon = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
}

const stock = {
  width: 100,
  height: 50,
  thickness: 12,
  originX: -50,
  originY: -25,
  safeZ: 20,
  toolDiameter: 6,
  clearance: 5,
  rapidFeed: 5000,
  tools: [
    { id: "1", diameter: 6, type: "flat" },
    { id: "025", diameter: 8, type: "ball" },
  ],
};

test("maps every stock origin to the same displacement texture bounds", async () => {
  const { mapCncPointToStockTexture } = await loadCoordinates();
  const resolution = 1024;
  const origins = [
    [0, 0],
    [0, -50],
    [-50, -50],
    [-50, -25],
    [-100, 0],
  ];

  for (const [originX, originY] of origins) {
    const configured = { ...stock, originX, originY };
    assert.deepEqual(
      mapCncPointToStockTexture(
        { x: originX, y: originY },
        configured,
        resolution,
      ),
      { x: 0, y: resolution },
    );
    assert.deepEqual(
      mapCncPointToStockTexture(
        { x: originX + configured.width, y: originY + configured.height },
        configured,
        resolution,
      ),
      { x: resolution, y: 0 },
    );
  }
});

test("lifts the 3D toolpath guide above either stock Z datum", async () => {
  const { resolveToolpathOverlayZ } = await loadCoordinates();
  const topZero = { topZ: 0, bottomZ: -12 };
  const bottomZero = { topZ: 12, bottomZ: 0 };

  assert.equal(resolveToolpathOverlayZ(stock, topZero), 0.5);
  assert.equal(resolveToolpathOverlayZ(stock, bottomZero), 12.5);
  assert.ok(
    resolveToolpathOverlayZ({ ...stock, thickness: 100 }, bottomZero) <=
      bottomZero.topZ + 1.2,
  );
});

test("partial curved playback keeps sampled arc points instead of cutting a chord", async () => {
  const { pointAtToolpathProgress, sliceToolpathPoints } = await loadCoordinates();
  const points = [
    { x: 10, y: 0, z: -2 },
    { x: 9.2388, y: 3.8268, z: -2 },
    { x: 7.0711, y: 7.0711, z: -2 },
    { x: 3.8268, y: 9.2388, z: -2 },
    { x: 0, y: 10, z: -2 },
  ];
  const partial = sliceToolpathPoints(points, 0.2, 0.8);

  assert.ok(partial.length >= 3);
  assert.ok(
    partial.some(
      (point) => Math.abs(point.x - 7.0711) < 0.001 && Math.abs(point.y - 7.0711) < 0.001,
    ),
  );
  assert.deepEqual(partial.at(-1), pointAtToolpathProgress(points, 0.8));
});

test("tool marker and removal slice share sampled arc progress without endpoint overshoot", async () => {
  const { pointAtToolpathProgress, sliceToolpathPoints } = await loadCoordinates();
  const { pointOnSegment } = await loadGcodeUtils();
  const points = [
    { x: 10, y: 0, z: -2 },
    { x: 9.2388, y: 3.8268, z: -2 },
    { x: 7.0711, y: 7.0711, z: -2 },
    { x: 3.8268, y: 9.2388, z: -2 },
    { x: 0, y: 10, z: -2 },
  ];
  const segment = {
    start: points[0],
    end: points.at(-1),
    points,
    // Analytic quarter-circle length is intentionally longer than the
    // sampled chord sum. The old marker implementation overshot at 100%.
    length: Math.PI * 5,
  };

  for (const progress of [0.25, 0.5, 0.8, 1]) {
    const marker = pointOnSegment(segment, progress);
    const sliced = sliceToolpathPoints(points, 0, progress);
    assert.deepEqual(marker, sliced.at(-1));
    assert.deepEqual(marker, pointAtToolpathProgress(points, progress));
  }
  assert.deepEqual(pointOnSegment(segment, 1), points.at(-1));
});

test("work-coordinate marker applies the segment start-frame translation", async () => {
  const {
    pointOnSegmentInTelemetryCoordinates,
    pointOnSegmentInWorkCoordinates,
  } = await loadGcodeUtils();
  const segment = {
    start: { x: 100, y: 200, z: 10 },
    end: { x: 110, y: 220, z: 5 },
    workStart: { x: 0, y: 0, z: 0 },
    points: [
      { x: 100, y: 200, z: 10 },
      { x: 110, y: 220, z: 5 },
    ],
    length: Math.hypot(10, 20, -5),
  };

  assert.deepEqual(pointOnSegmentInWorkCoordinates(segment, 0.5), {
    x: 5,
    y: 10,
    z: -2.5,
  });
  assert.deepEqual(pointOnSegmentInTelemetryCoordinates(segment, 0.5), {
    x: 5,
    y: 10,
    z: -2.5,
  });
});

test("G53 telemetry interpolates the original machine-coordinate move", async () => {
  const { pointOnSegmentInTelemetryCoordinates } = await loadGcodeUtils();
  const segment = {
    start: { x: -100, y: -200, z: -10 },
    end: { x: -80, y: -160, z: 0 },
    workStart: { x: 0, y: 0, z: 0 },
    machineStart: { x: 500, y: 600, z: 20 },
    machineEnd: { x: 520, y: 640, z: 30 },
    machineCoordinates: true,
    points: [
      { x: -100, y: -200, z: -10 },
      { x: -80, y: -160, z: 0 },
    ],
    length: Math.hypot(20, 40, 10),
  };

  assert.deepEqual(pointOnSegmentInTelemetryCoordinates(segment, 0.25), {
    x: 505,
    y: 610,
    z: 22.5,
  });
});

test("telemetry converts millimetre internals back to active program units", async () => {
  const { pointInProgramUnits } = await loadGcodeUtils();
  const millimetres = { x: 25.4, y: -50.8, z: 12.7 };

  assert.deepEqual(pointInProgramUnits(millimetres, "mm"), millimetres);
  assert.deepEqual(pointInProgramUnits(millimetres, "inch"), {
    x: 1,
    y: -2,
    z: 0.5,
  });
});

test("ball and V-bit contact widths follow shallow cutter geometry", async () => {
  const {
    buildCutterContactBands,
    resolveCutterContactDiameter,
    resolveCutterProfileHeight,
    resolveVBitGeometry,
  } = await loadCoordinates();
  const bounds = { topZ: 0, bottomZ: -12 };
  const flat = { id: "1", diameter: 10, type: "flat" };
  const ball = { id: "2", diameter: 10, type: "ball" };
  const v60 = { id: "3", diameter: 10, type: "vbit", angle: 60 };
  const v90 = { id: "4", diameter: 10, type: "vbit", angle: 90 };
  const tippedV90 = {
    id: "5",
    diameter: 10,
    type: "vbit",
    angle: 90,
    tipDiameter: 1,
  };

  assert.equal(resolveCutterContactDiameter(flat, -0.1, bounds), 10);
  assertClose(resolveCutterContactDiameter(ball, -1, bounds), 6);
  assertClose(
    resolveCutterContactDiameter(v60, -1, bounds),
    2 * Math.tan(Math.PI / 6),
  );
  assertClose(resolveCutterContactDiameter(v90, -1, bounds), 2);
  assert.equal(resolveCutterContactDiameter(v90, -8, bounds), 10);
  assert.equal(resolveCutterContactDiameter(v90, 1, bounds), 0);
  assert.equal(resolveCutterContactDiameter(tippedV90, 0, bounds), 1);
  assertClose(resolveCutterContactDiameter(tippedV90, -1, bounds), 3);
  assertClose(resolveCutterProfileHeight(tippedV90, 0.5), 0);
  assertClose(resolveCutterProfileHeight(tippedV90, 1.5), 1);

  const tippedGeometry = resolveVBitGeometry(tippedV90);
  assert.equal(tippedGeometry.tipDiameter, 1);
  assertClose(tippedGeometry.taperHeight, 4.5);

  const ballBands = buildCutterContactBands(ball, -1, bounds, 8);
  assert.equal(ballBands.length, 8);
  assertClose(ballBands[0].diameter, 6);
  assert.ok(ballBands[0].z > ballBands.at(-1).z);
  assertClose(ballBands.at(-1).z, -1);
  assert.ok(ballBands.every((band) => band.z <= bounds.topZ));

  const vBitBands = buildCutterContactBands(v90, -1, bounds, 8);
  assertClose(vBitBands[0].diameter, 2);
  assert.ok(vBitBands[0].z > vBitBands.at(-1).z);
  assertClose(vBitBands.at(-1).z, -1);

  const tippedBands = buildCutterContactBands(tippedV90, -1, bounds, 8);
  assert.equal(tippedBands.length, 8);
  assertClose(tippedBands[0].diameter, 3);
  assertClose(tippedBands.at(-1).diameter, 1);
  assertClose(tippedBands.at(-1).z, -1);
});

test("cutter contact bands stay monotonic and bounded across realistic depths", async () => {
  const {
    buildCutterContactBands,
    resolveCutterContactDiameter,
    resolveVBitGeometry,
  } = await loadCoordinates();
  const bounds = { topZ: 0, bottomZ: -18 };
  const tools = [
    { id: "flat", diameter: 6, type: "flat" },
    { id: "ball", diameter: 6, type: "ball" },
    { id: "v30", diameter: 12.7, type: "vbit", angle: 30 },
    { id: "v60", diameter: 12.7, type: "vbit", angle: 60, tipDiameter: 0.1 },
    { id: "v90", diameter: 12.7, type: "vbit", angle: 90, tipDiameter: 0.2 },
    { id: "v120", diameter: 12.7, type: "vbit", angle: 120 },
  ];

  for (const tool of tools) {
    let previousContact = 0;
    for (const depth of [0.01, 0.1, 0.2, 0.5, 1, 3, 8, 18]) {
      const contact = resolveCutterContactDiameter(tool, -depth, bounds);
      assert.ok(contact >= previousContact - 1e-9, `${tool.id} contact regressed`);
      assert.ok(contact <= tool.diameter + 1e-9, `${tool.id} exceeded diameter`);
      previousContact = contact;

      const bands = buildCutterContactBands(tool, -depth, bounds, 24);
      assert.ok(bands.length > 0, `${tool.id} should cut at ${depth} mm`);
      for (let index = 0; index < bands.length; index += 1) {
        assert.ok(bands[index].z <= bounds.topZ + 1e-9);
        assert.ok(bands[index].z >= bounds.bottomZ - 1e-9);
        if (index > 0) {
          assert.ok(bands[index].diameter <= bands[index - 1].diameter + 1e-9);
          assert.ok(bands[index].z <= bands[index - 1].z + 1e-9);
        }
      }
      assertClose(bands.at(-1).z, -depth);
    }
  }

  assert.ok(
    resolveVBitGeometry(tools[2]).taperHeight >
      resolveVBitGeometry(tools[5]).taperHeight,
    "a narrower V angle must have a longer taper for the same diameter",
  );
});

test("Solid stock removal paints cutter bands and shares the playback marker", async () => {
  const source = await readFile(
    path.resolve(__dirname, "../core/components/SolidSimulator.tsx"),
    "utf8",
  );

  assert.match(source, /import \{ pointOnSegment \} from "\.\.\/utils\/gcode-utils"/);
  assert.match(source, /buildCutterContactBands\(\s*tool,\s*averageZ/);
  assert.match(source, /buildCutterContactBands\(\s*tool,\s*sectionEnd\.z/);
  assert.match(
    source,
    /segment\.machineCoordinates \|\|[\s\S]*?segment\.kind === "rapid"/,
  );
  assert.match(source, /segment\.spindle <= 0/);
  assert.match(source, /segment\.spindleState === "off"/);
  assert.match(source, /activeSegment\.spindle > 0/);
  assert.match(source, /paintStockSurface\(surfaceCtx, MAP_RES\)/);
  assert.match(source, /function PartLabel\(/);
  assert.match(source, /new THREE\.CanvasTexture\(labelCanvas\)/);
  assert.doesNotMatch(source, /<Text\b/);
  assert.match(source, /map=\{surfaceTexture\}/);
  assert.match(source, /surfaceCtx,[\s\S]*?"darken",[\s\S]*?cutSurfaceColor/);
  assert.match(
    source,
    /cutPositions\.push\(p1\.x, p1\.y, surfaceZ, p2\.x, p2\.y, surfaceZ\)/,
  );
  assert.match(source, /color="#03171c"[\s\S]*?lineWidth=\{1\.8\}/);
  assert.match(source, /color="#22e6ff"[\s\S]*?lineWidth=\{0\.75\}/);
  assert.match(source, /depthTest=\{false\}[\s\S]*?renderOrder=\{31\}/);
  assert.match(source, /<planeGeometry args=\{\[stock\.width, stock\.height, geomRes, geomRes\]\}/);
  assert.match(source, /alphaMap=\{texture\}/);
  assert.doesNotMatch(source, /onBeforeCompile=/);
  assert.doesNotMatch(source, /function pointOnSegment\(/);
});

test("matches segment T-codes to numeric tool-library ids", async () => {
  const { normalizeToolId, resolveSegmentTool } = await loadCoordinates();

  assert.equal(normalizeToolId("T025"), "25");
  assert.equal(resolveSegmentTool(stock, "T25")?.diameter, 8);
  assert.equal(resolveSegmentTool(stock, "T999")?.diameter, 6);
});

test("invalidates the removal texture when stock coordinates, Z datum, quality, or tools change", async () => {
  const { stockRemovalRenderKey } = await loadCoordinates();
  const topZero = { topZ: 0, bottomZ: -12 };
  const baseline = stockRemovalRenderKey(stock, 1024, topZero);

  const variants = [
    stockRemovalRenderKey({ ...stock, originX: -40 }, 1024, topZero),
    stockRemovalRenderKey(stock, 2048, topZero),
    stockRemovalRenderKey(stock, 1024, { topZ: 12, bottomZ: 0 }),
    stockRemovalRenderKey(
      { ...stock, tools: [{ id: "1", diameter: 10, type: "flat" }] },
      1024,
      topZero,
    ),
    stockRemovalRenderKey(
      {
        ...stock,
        tools: [
          {
            id: "1",
            diameter: 6,
            type: "vbit",
            angle: 60,
            tipDiameter: 0.2,
          },
        ],
      },
      1024,
      topZero,
    ),
    stockRemovalRenderKey(
      { ...stock, tools: [{ id: "1", diameter: 6, type: "ball" }] },
      1024,
      topZero,
    ),
    stockRemovalRenderKey(
      {
        ...stock,
        tools: [{ id: "1", diameter: 6, type: "vbit", angle: 60 }],
      },
      1024,
      topZero,
    ),
  ];

  for (const variant of variants) assert.notEqual(variant, baseline);
});

test("depth encoding is monotonic so a deeper cut can be preserved with darken blending", async () => {
  const { depthIntensity } = await loadCoordinates();
  const bounds = { topZ: 0, bottomZ: -12 };

  assert.equal(depthIntensity(0, bounds), 255);
  assert.equal(depthIntensity(-12, bounds), 0);
  assert.ok(depthIntensity(-8, bounds) < depthIntensity(-2, bounds));
});

test("a shallow engraving keeps a high-contrast exposed surface colour", async () => {
  const { cutSurfaceColor, depthIntensity } = await loadCoordinates();
  const bounds = { topZ: 0, bottomZ: -18 };
  const shallowIntensity = depthIntensity(-0.2, bounds);
  const exposed = cutSurfaceColor(-0.2, bounds);
  const deep = cutSurfaceColor(-12, bounds);

  // This is the regression from the 18 mm sheet shown in the report: the
  // physical height value is nearly white, but the albedo must still show it.
  assert.equal(shallowIntensity, 252);
  assert.match(exposed, /^rgb\(\d+, \d+, \d+\)$/);
  assert.notEqual(exposed, "rgb(205, 154, 91)");
  const exposedChannels = exposed.match(/\d+/g).map(Number);
  const deepChannels = deep.match(/\d+/g).map(Number);
  assert.ok(exposedChannels.every((channel, index) => channel > deepChannels[index]));
});
