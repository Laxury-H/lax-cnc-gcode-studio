import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadInputModule() {
  const result = await build({
    entryPoints: [
      path.resolve(__dirname, "../core/ui/work-offset-input.ts"),
    ],
    bundle: true,
    write: false,
    format: "esm",
    target: "es2022",
  });
  const compiled = result.outputFiles[0].text;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

const zeroOffsets = Object.fromEntries(
  ["G54", "G55", "G56", "G57", "G58", "G59"].map((system) => [
    system,
    { x: 0, y: 0, z: 0 },
  ]),
);

test("work-offset input draft preserves intermediate negative and decimal text", async () => {
  const { createWorkOffsetInputDraft } = await loadInputModule();
  const draft = createWorkOffsetInputDraft(zeroOffsets);

  draft.G55.x = "-";
  draft.G55.y = "-12.";
  draft.G55.z = "-12.75";

  assert.equal(draft.G55.x, "-");
  assert.equal(draft.G55.y, "-12.");
  assert.equal(draft.G55.z, "-12.75");
});

test("work-offset parser accepts signed decimals and rejects incomplete or unsafe values", async () => {
  const { parseWorkOffsetInput } = await loadInputModule();

  assert.equal(parseWorkOffsetInput("-125.75"), -125.75);
  assert.equal(parseWorkOffsetInput("+0.25"), 0.25);
  assert.equal(parseWorkOffsetInput("12,5"), 12.5);
  assert.equal(parseWorkOffsetInput("-"), null);
  assert.equal(parseWorkOffsetInput(""), null);
  assert.equal(parseWorkOffsetInput("Infinity"), null);
  assert.equal(parseWorkOffsetInput("1000000.1"), null);
});

test("work-offset draft is applied only when every G54-G59 axis is valid", async () => {
  const {
    createWorkOffsetInputDraft,
    parseWorkOffsetInputDraft,
  } = await loadInputModule();
  const draft = createWorkOffsetInputDraft(zeroOffsets);
  draft.G54.x = "-100.25";
  draft.G55.y = "240,5";

  const parsed = parseWorkOffsetInputDraft(draft);
  assert.equal(parsed.G54.x, -100.25);
  assert.equal(parsed.G55.y, 240.5);

  draft.G59.z = "-";
  assert.equal(parseWorkOffsetInputDraft(draft), null);
});
