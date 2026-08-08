import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function loadFeatureDialogHarness() {
  const result = await build({
    absWorkingDir: rootDirectory,
    bundle: true,
    format: "esm",
    platform: "node",
    stdin: {
      contents: `
        import { translations } from "./app/i18n";
        import {
          formatMiniCamValidation,
          MAX_CAM_OUTPUT_LINES,
          MAX_CAM_PASSES,
          validateMiniCamValues,
        } from "./core/components/mini-cam-validation";
        export { MAX_CAM_OUTPUT_LINES, MAX_CAM_PASSES, validateMiniCamValues };

        export function translationKeys(lang) {
          return Object.keys(translations[lang]);
        }

        export function dialogText(lang) {
          return translations[lang];
        }

        export function renderValidation(lang, validation) {
          const t = translations[lang];
          return formatMiniCamValidation(validation, {
            positive: t.miniCamValidationPositive,
            stepoverRange: t.miniCamValidationStepover,
            passLimit: t.miniCamValidationPassLimit,
            fields: {
              toolDia: t.miniCamToolDiameter,
              spindleSpeed: t.miniCamSpindleSpeed,
              feedRate: t.miniCamFeedRate,
              plungeRate: t.miniCamPlungeRate,
              width: t.miniCamWidth,
              height: t.miniCamHeight,
              depth: t.miniCamDepth,
              stepover: t.miniCamStepover,
            },
          });
        }
      `,
      loader: "tsx",
      resolveDir: rootDirectory,
      sourcefile: "feature-dialog-harness.tsx",
    },
    target: "node22",
    write: false,
  });

  const javascript = result.outputFiles[0];
  assert.ok(javascript, "Expected a JavaScript bundle for the dialog harness");
  const url = `data:text/javascript;base64,${Buffer.from(javascript.text).toString("base64")}`;
  return import(url);
}

test("VN and EN dictionaries keep identical feature-dialog keys", async () => {
  const harness = await loadFeatureDialogHarness();
  assert.deepEqual(
    harness.translationKeys("VN").sort(),
    harness.translationKeys("EN").sort(),
  );
});

test("File Compare and Mini CAM wire every visible label to the selected locale", async () => {
  const harness = await loadFeatureDialogHarness();
  const [compareSource, miniCamSource] = await Promise.all([
    readFile(path.join(rootDirectory, "core/components/FileCompareModal.tsx"), "utf8"),
    readFile(path.join(rootDirectory, "core/components/MiniCamModal.tsx"), "utf8"),
  ]);
  const vietnamese = harness.dialogText("VN");
  const english = harness.dialogText("EN");

  for (const key of [
    "compareTitle",
    "compareClose",
    "compareOriginalFile",
    "compareApply",
    "compareModifiedFile",
    "compareModifiedContent",
    "compareResult",
    "compareAdded",
    "compareRemoved",
    "compareResultRegion",
  ]) {
    assert.match(compareSource, new RegExp(`t\\.${key}`));
    assert.notEqual(vietnamese[key], english[key]);
  }
  assert.doesNotMatch(compareSource, /Tệp gốc \(Original File\)|Lưu thay đổi \(Apply\)/);

  for (const key of [
    "miniCamTitle",
    "miniCamClose",
    "miniCamTabFacing",
    "miniCamTabPocket",
    "miniCamToolSection",
    "miniCamToolDiameter",
    "miniCamSpindleSpeed",
    "miniCamFeedRate",
    "miniCamPlungeRate",
    "miniCamWorkSection",
    "miniCamWidth",
    "miniCamHeight",
    "miniCamDepth",
    "miniCamStepover",
    "miniCamCancel",
    "miniCamGenerate",
    "miniCamValidationPositive",
    "miniCamValidationStepover",
    "miniCamValidationPassLimit",
  ]) {
    assert.match(miniCamSource, new RegExp(`t\\.${key}`));
    if (key !== "miniCamTitle") assert.notEqual(vietnamese[key], english[key]);
  }
  assert.doesNotMatch(miniCamSource, /Đường kính dao \/ Tool diameter|Phay mặt \(Facing\)/);
});

test("Mini CAM validation returns stable codes for every unsafe class", async () => {
  const {
    MAX_CAM_OUTPUT_LINES,
    MAX_CAM_PASSES,
    validateMiniCamValues,
  } = await loadFeatureDialogHarness();
  const valid = {
    toolDia: 6,
    spindleSpeed: 18_000,
    feedRate: 2_000,
    plungeRate: 800,
    width: 200,
    height: 200,
    depth: 1,
    stepover: 40,
  };

  assert.equal(validateMiniCamValues(valid), null);
  for (const field of [
    "toolDia",
    "spindleSpeed",
    "feedRate",
    "plungeRate",
    "width",
    "height",
    "depth",
  ]) {
    assert.deepEqual(validateMiniCamValues({ ...valid, [field]: 0 }), {
      code: "positive",
      field,
    });
  }
  assert.deepEqual(validateMiniCamValues({ ...valid, feedRate: Number.NaN }), {
    code: "positive",
    field: "feedRate",
  });
  for (const stepover of [Number.NaN, 0, 101]) {
    assert.deepEqual(validateMiniCamValues({ ...valid, stepover }), {
      code: "stepover-range",
      field: "stepover",
    });
  }
  assert.deepEqual(
    validateMiniCamValues({ ...valid, toolDia: 1, height: 1_000_000, stepover: 100 }),
    { code: "pass-limit", maxPasses: MAX_CAM_PASSES },
  );
  assert.equal(MAX_CAM_PASSES, 5_000);
  assert.equal(MAX_CAM_OUTPUT_LINES, MAX_CAM_PASSES * 2 + 16);
});

test("Mini CAM validation messages are localized only at render time", async () => {
  const harness = await loadFeatureDialogHarness();
  const positive = { code: "positive", field: "toolDia" };
  const limit = { code: "pass-limit", maxPasses: 5_000 };

  assert.equal(
    harness.renderValidation("VN", positive),
    "Đường kính dao (mm) phải là số hữu hạn lớn hơn 0.",
  );
  assert.equal(
    harness.renderValidation("EN", positive),
    "Tool diameter (mm) must be a finite number greater than 0.",
  );
  assert.match(harness.renderValidation("VN", limit), /5000/);
  assert.match(harness.renderValidation("EN", limit), /5000/);
  assert.doesNotMatch(harness.renderValidation("EN", limit), /Số lượt chạy/);
});
