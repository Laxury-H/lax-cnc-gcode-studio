import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootUrl = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, rootUrl), "utf8");

test("shared responsive dialog owns accessible keyboard and focus behavior", async () => {
  const source = await read("core/components/ui/ResponsiveDialog.tsx");

  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby=\{titleId\}/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /\[data-dialog-autofocus\]/);
  assert.match(source, /previouslyFocused\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /document\.body\.style\.overflow = "hidden"/);
});

test("all feature dialogs use the shared shell without fixed inline dimensions", async () => {
  const paths = [
    "core/components/UserGuideModal.tsx",
    "core/components/FileCompareModal.tsx",
    "core/components/MiniCamModal.tsx",
  ];

  for (const path of paths) {
    const source = await read(path);
    assert.match(source, /<ResponsiveDialog/);
    assert.doesNotMatch(source, /width:\s*["'](?:600|900|1200)px["']/);
    assert.doesNotMatch(source, /height:\s*["'](?:600|800)px["']/);
  }
});

test("guide tabs support standard keyboard navigation", async () => {
  const source = await read("core/components/UserGuideModal.tsx");

  assert.match(source, /event\.key !== "ArrowLeft"/);
  assert.match(source, /event\.key !== "ArrowRight"/);
  assert.match(source, /event\.key !== "Home"/);
  assert.match(source, /event\.key !== "End"/);
  assert.match(source, /document\.getElementById\(`\$\{tabPrefix\}-tab-\$\{nextTab\.id\}`\)\?\.focus\(\)/);
});

test("dialog CSS adapts split layouts and forms down to narrow screens", async () => {
  const css = await read("core/components/ui/ResponsiveDialog.module.css");

  assert.match(css, /max-height:\s*calc\(100dvh - 24px\)/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /\.compareBody\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.guideLayout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?\.formGrid/);
  assert.match(css, /env\(safe-area-inset-left\)/);
});

test("Mini CAM rejects unsafe input and caps generated work", async () => {
  const [source, validationSource] = await Promise.all([
    read("core/components/MiniCamModal.tsx"),
    read("core/components/mini-cam-validation.ts"),
  ]);

  assert.match(validationSource, /Number\.isFinite\(values\[field\]\)/);
  assert.match(validationSource, /values\.stepover < 1/);
  assert.match(validationSource, /values\.stepover > 100/);
  assert.match(validationSource, /passes > MAX_CAM_PASSES/);
  assert.match(source, /Math\.min\(MAX_CAM_PASSES, Math\.ceil\(height \/ step\)\)/);
  assert.match(source, /lines\.slice\(0, MAX_CAM_OUTPUT_LINES\)/);
  assert.match(source, /const inputAccessibility = \(field: keyof MiniCamValues\)/);
  assert.match(source, /validation\.code !== "pass-limit"/);
  assert.match(source, /validation\.field === field/);
  assert.match(source, /inputAccessibility\("toolDia"\)/);
  assert.match(source, /inputAccessibility\("stepover"\)/);
  assert.match(source, /disabled=\{invalid\}/);
  assert.match(source, /role="alert"/);
});
