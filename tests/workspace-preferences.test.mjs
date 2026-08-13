import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadPreferencesModule() {
  const entry = path.resolve(
    __dirname,
    "../core/ui/workspace-preferences.ts",
  );
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

const validPreferences = {
  version: 1,
  profile: "router-custom",
  stock: {
    width: 2440,
    height: 1220,
    thickness: 18,
    originX: 0,
    originY: 0,
    safeZ: 22,
    toolDiameter: 6,
    clearance: 12,
    rapidFeed: 8000,
    zZero: "auto",
    tools: [
      { id: "1", diameter: 6, type: "flat" },
      { id: "25", diameter: 12.7, type: "vbit", angle: 90, tipDiameter: 0.2 },
    ],
  },
  speed: 2,
  quality: "medium",
  showRapids: true,
  machineSound: false,
  finishSound: true,
  workOffsets: {
    G54: { x: 0, y: 0, z: 0 },
    G55: { x: 100, y: 200, z: 3 },
    G56: { x: -150, y: 250, z: -4 },
    G57: { x: 300, y: -400, z: 5 },
    G58: { x: -500, y: -600, z: -6 },
    G59: { x: 700, y: 800, z: 7 },
  },
};

test("workspace preferences round-trip through the versioned schema", async () => {
  const {
    WORKSPACE_PREFERENCES_KEY,
    parseWorkspacePreferences,
    serializeWorkspacePreferences,
  } = await loadPreferencesModule();

  assert.equal(WORKSPACE_PREFERENCES_KEY, "lax_cnc_workspace_preferences");
  const serialized = serializeWorkspacePreferences(validPreferences);
  assert.deepEqual(parseWorkspacePreferences(serialized), validPreferences);
});

test("stock settings and nested tools are cloned deeply", async () => {
  const {
    cloneStockSettings,
    cloneWorkspaceWorkOffsets,
    parseWorkspacePreferences,
  } =
    await loadPreferencesModule();

  const clone = cloneStockSettings(validPreferences.stock);
  assert.notEqual(clone, validPreferences.stock);
  assert.notEqual(clone.tools, validPreferences.stock.tools);
  assert.notEqual(clone.tools[0], validPreferences.stock.tools[0]);

  clone.tools[0].diameter = 99;
  assert.equal(validPreferences.stock.tools[0].diameter, 6);

  const parsed = parseWorkspacePreferences(JSON.stringify(validPreferences));
  assert.notEqual(parsed.stock.tools, validPreferences.stock.tools);
  assert.notEqual(parsed.stock.tools[0], validPreferences.stock.tools[0]);

  const workOffsets = cloneWorkspaceWorkOffsets(validPreferences.workOffsets);
  assert.notEqual(workOffsets, validPreferences.workOffsets);
  assert.notEqual(workOffsets.G55, validPreferences.workOffsets.G55);
  workOffsets.G55.x = 999;
  assert.equal(validPreferences.workOffsets.G55.x, 100);
  assert.notEqual(parsed.workOffsets.G55, validPreferences.workOffsets.G55);
});

test("version 1 preferences without work offsets migrate to zero offsets", async () => {
  const {
    createZeroWorkspaceWorkOffsets,
    parseWorkspacePreferences,
  } = await loadPreferencesModule();
  const legacyPreferences = { ...validPreferences };
  delete legacyPreferences.workOffsets;

  const parsed = parseWorkspacePreferences(JSON.stringify(legacyPreferences));
  assert.ok(parsed);
  assert.deepEqual(parsed.workOffsets, createZeroWorkspaceWorkOffsets());
  assert.notEqual(parsed.workOffsets.G54, parsed.workOffsets.G55);
});

test("parser rejects malformed, incomplete, or unsupported preferences", async () => {
  const { parseWorkspacePreferences } = await loadPreferencesModule();

  assert.equal(parseWorkspacePreferences(null), null);
  assert.equal(parseWorkspacePreferences("{"), null);
  assert.equal(parseWorkspacePreferences("null"), null);
  assert.equal(parseWorkspacePreferences("[]"), null);

  for (const patch of [
    { version: 2 },
    { profile: "fanuc" },
    { speed: 3 },
    { quality: "ultra" },
    { showRapids: "true" },
    { machineSound: 0 },
    { finishSound: null },
  ]) {
    const candidate = { ...validPreferences, ...patch };
    assert.equal(parseWorkspacePreferences(JSON.stringify(candidate)), null);
  }
});

test("parser enforces stock numeric bounds and finite numbers", async () => {
  const { parseWorkspacePreferences, serializeWorkspacePreferences } =
    await loadPreferencesModule();

  for (const [key, value] of [
    ["width", 0],
    ["height", -1],
    ["thickness", 10001],
    ["originX", 1000001],
    ["safeZ", -1000001],
    ["toolDiameter", 0],
    ["clearance", -0.1],
    ["rapidFeed", 0],
  ]) {
    const candidate = {
      ...validPreferences,
      stock: { ...validPreferences.stock, [key]: value },
    };
    assert.equal(
      parseWorkspacePreferences(JSON.stringify(candidate)),
      null,
      `${key} should reject ${value}`,
    );
  }

  assert.throws(
    () =>
      serializeWorkspacePreferences({
        ...validPreferences,
        stock: { ...validPreferences.stock, width: Number.POSITIVE_INFINITY },
      }),
    /Invalid workspace preferences/,
  );
});

test("parser validates zZero and every nested tool", async () => {
  const { parseWorkspacePreferences } = await loadPreferencesModule();

  const withStock = (stockPatch) =>
    JSON.stringify({
      ...validPreferences,
      stock: { ...validPreferences.stock, ...stockPatch },
    });

  assert.equal(parseWorkspacePreferences(withStock({ zZero: "center" })), null);
  assert.equal(
    parseWorkspacePreferences(
      withStock({ tools: [{ id: "", diameter: 6, type: "flat" }] }),
    ),
    null,
  );
  assert.equal(
    parseWorkspacePreferences(
      withStock({
        tools: [
          { id: "1", diameter: 6, type: "vbit", angle: 90, tipDiameter: -0.1 },
        ],
      }),
    ),
    null,
  );
  assert.equal(
    parseWorkspacePreferences(
      withStock({
        tools: [
          { id: "1", diameter: 6, type: "vbit", angle: 90, tipDiameter: 6 },
        ],
      }),
    ),
    null,
  );
  assert.equal(
    parseWorkspacePreferences(
      withStock({
        tools: [{ id: "1", diameter: 6, type: "flat", tipDiameter: 0.2 }],
      }),
    ),
    null,
  );
  assert.equal(
    parseWorkspacePreferences(
      withStock({ tools: [{ id: "1", diameter: 0, type: "flat" }] }),
    ),
    null,
  );
  assert.equal(
    parseWorkspacePreferences(
      withStock({ tools: [{ id: "1", diameter: 6, type: "laser" }] }),
    ),
    null,
  );
  assert.equal(
    parseWorkspacePreferences(
      withStock({ tools: [{ id: "1", diameter: 6, type: "vbit", angle: 180 }] }),
    ),
    null,
  );
  assert.equal(
    parseWorkspacePreferences(
      withStock({
        tools: [
          { id: "1", diameter: 6, type: "flat" },
          { id: "1", diameter: 8, type: "ball" },
        ],
      }),
    ),
    null,
  );
  assert.equal(
    parseWorkspacePreferences(
      withStock({
        tools: Array.from({ length: 257 }, (_, index) => ({
          id: String(index),
          diameter: 6,
          type: "flat",
        })),
      }),
    ),
    null,
  );
});

test("parser requires complete, finite, bounded G54-G59 work offsets", async () => {
  const { parseWorkspacePreferences, serializeWorkspacePreferences } =
    await loadPreferencesModule();

  const withOffsets = (workOffsets) =>
    JSON.stringify({ ...validPreferences, workOffsets });

  assert.equal(parseWorkspacePreferences(withOffsets(null)), null);
  assert.equal(
    parseWorkspacePreferences(
      withOffsets({ ...validPreferences.workOffsets, G59: undefined }),
    ),
    null,
  );

  for (const [axis, value] of [
    ["x", "12"],
    ["y", 1_000_001],
    ["z", -1_000_001],
  ]) {
    const workOffsets = {
      ...validPreferences.workOffsets,
      G56: { ...validPreferences.workOffsets.G56, [axis]: value },
    };
    assert.equal(
      parseWorkspacePreferences(withOffsets(workOffsets)),
      null,
      `${axis} should reject ${value}`,
    );
  }

  assert.throws(
    () =>
      serializeWorkspacePreferences({
        ...validPreferences,
        workOffsets: {
          ...validPreferences.workOffsets,
          G55: {
            ...validPreferences.workOffsets.G55,
            x: Number.POSITIVE_INFINITY,
          },
        },
      }),
    /Invalid workspace preferences/,
  );
});

test("optional zZero and tools remain optional and unknown fields are discarded", async () => {
  const { parseWorkspacePreferences } = await loadPreferencesModule();
  const stock = { ...validPreferences.stock };
  delete stock.zZero;
  delete stock.tools;
  const candidate = {
    ...validPreferences,
    ignored: "future-field",
    stock: { ...stock, ignored: true },
    workOffsets: {
      ...validPreferences.workOffsets,
      G55: { ...validPreferences.workOffsets.G55, ignored: true },
      G60: { x: 1, y: 2, z: 3 },
    },
  };

  const parsed = parseWorkspacePreferences(JSON.stringify(candidate));
  assert.ok(parsed);
  assert.equal("ignored" in parsed, false);
  assert.equal("ignored" in parsed.stock, false);
  assert.equal("zZero" in parsed.stock, false);
  assert.equal("tools" in parsed.stock, false);
  assert.equal("G60" in parsed.workOffsets, false);
  assert.equal("ignored" in parsed.workOffsets.G55, false);
});
