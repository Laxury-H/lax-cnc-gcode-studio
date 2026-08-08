import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootUrl = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, rootUrl), "utf8");
}

test("measurement mode reserves a dedicated dock beside the 3D viewport", async () => {
  const [page, simulator, css] = await Promise.all([
    read("app/page.tsx"),
    read("core/components/SolidSimulator.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(page, /isMeasuring && view === "solid"[\s\S]*has-measurement-dock/);
  assert.match(simulator, /className="solid-simulator__viewport"/);
  assert.match(simulator, /className="measurement-dock"/);
  assert.match(
    css,
    /\.solid-simulator\.is-measuring\s*\{[\s\S]*?grid-template-columns:[\s\S]*?var\(--measurement-dock-width\)/,
  );
  assert.match(
    css,
    /\.canvas-frame\.has-measurement-dock\s*\{[\s\S]*?--measurement-dock-width:\s*clamp\(300px, 30%, 344px\)/,
  );

  const panelRule = css.match(/\.measurement-panel\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(panelRule, /position:\s*relative/);
  assert.match(panelRule, /height:\s*100%/);
  assert.doesNotMatch(panelRule, /position:\s*absolute/);
});

test("measurement mode gives every HUD a safe area and stacks the dock on narrow canvases", async () => {
  const [tool, css] = await Promise.all([
    read("core/components/SmartMeasurementTool.tsx"),
    read("app/globals.css"),
  ]);

  for (const selector of ["plane-badge", "orientation-widget", "backplot-controls"]) {
    assert.match(
      css,
      new RegExp(
        `\\.canvas-frame\\.has-measurement-dock \\.${selector}\\s*\\{[\\s\\S]*?right:\\s*calc\\(var\\(--measurement-dock-width\\)`,
      ),
    );
  }
  assert.match(
    css,
    /\.canvas-frame\.has-measurement-dock \.canvas-telemetry\s*\{[\s\S]*?left:\s*calc\(\(100% - var\(--measurement-dock-width\)\) \/ 2\)/,
  );
  assert.match(
    css,
    /\.canvas-frame\.has-measurement-dock \.orbit-hint\s*\{\s*display:\s*none/,
  );
  assert.match(css, /@container simulator \(max-width: 820px\)/);
  assert.match(
    css,
    /grid-template-rows:\s*minmax\(160px, 1fr\) clamp\(176px, 42%, 260px\)/,
  );
  assert.doesNotMatch(tool, /measurement-canvas-hint/);
});

test("snap telemetry stays in the dock and optional dimensions stay collapsed", async () => {
  const [tool, simulator, css] = await Promise.all([
    read("core/components/SmartMeasurementTool.tsx"),
    read("core/components/SolidSimulator.tsx"),
    read("app/globals.css"),
  ]);

  assert.doesNotMatch(tool, /measurement-snap-label/);
  assert.doesNotMatch(css, /\.measurement-snap-label/);
  assert.match(tool, /className="measurement-live-snap"/);
  assert.match(tool, /<details[\s\S]*?KÍCH THƯỚC NHANH/);
  assert.match(tool, /open=\{openDisclosure === "quick"\}/);
  assert.doesNotMatch(tool, /ĐO TỰ ĐỘNG/);
  assert.match(simulator, /onHoverChange=\{setHoveredMeasurementSnap\}/);
});

test("CNC measurement controls expose direction locks, work datum, units and history", async () => {
  const [tool, simulator] = await Promise.all([
    read("core/components/SmartMeasurementTool.tsx"),
    read("core/components/SolidSimulator.tsx"),
  ]);

  for (const constraint of ["free", "x", "y", "z", "xy"]) {
    assert.match(tool, new RegExp(`value: "${constraint}"`));
  }
  assert.match(tool, /GÓC XY/);
  assert.match(tool, /ĐỘ DỐC/);
  assert.match(tool, /LỊCH SỬ/);
  assert.match(tool, /MeasurementUnit = "mm" \| "in"/);
  assert.match(simulator, /current === "mm" \? "in" : "mm"/);
  assert.match(simulator, /constrainMeasurementPoint\(/);
  assert.match(simulator, /calculateWorkOrigin\([\s\S]*?finalState\.position[\s\S]*?finalState\.workPosition/);
  assert.match(simulator, /MAX_MEASUREMENT_HISTORY = 6/);
  assert.match(
    simulator,
    /measurementConstraintState\.session === measurementSession[\s\S]*?measurementConstraintState\.value[\s\S]*?: "free"/,
  );
  assert.match(simulator, /f: "free"[\s\S]*?p: "xy"[\s\S]*?x: "x"[\s\S]*?y: "y"[\s\S]*?z: "z"/);
  assert.match(tool, /setPointerCapture\(event\.pointerId\)/);
  assert.match(tool, /lostpointercapture/);
});

test("measurement dock compacts each stage and keeps bottom-dock targets touchable", async () => {
  const [tool, css] = await Promise.all([
    read("core/components/SmartMeasurementTool.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(tool, /className="measurement-primary-state"/);
  assert.match(css, /\.measurement-steps\s*\{\s*display:\s*none/);
  assert.match(
    css,
    /\.measurement-panel\.is-waiting-b \.measurement-datum-button\s*\{\s*display:\s*none/,
  );
  assert.match(
    css,
    /\.measurement-panel\.is-complete \.measurement-live-snap,[\s\S]*?\.measurement-panel\.is-complete \.measurement-toolbar\s*\{\s*display:\s*none/,
  );
  assert.match(
    css,
    /@container simulator \(max-width: 820px\)[\s\S]*?\.measurement-panel button,[\s\S]*?min-height:\s*44px/,
  );
});

test("measurement snap points are selectable without pointer-only canvas interaction", async () => {
  const [tool, simulator, css] = await Promise.all([
    read("core/components/SmartMeasurementTool.tsx"),
    read("core/components/SolidSimulator.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(tool, /CHỌN ĐIỂM BẰNG BÀN PHÍM/);
  assert.match(tool, /type="search"/);
  assert.match(tool, /visibleCandidates\.map\(\(candidate\)/);
  assert.match(tool, /onCandidateSelect\(candidate\)/);
  assert.match(simulator, /candidates=\{measurementCandidates\}/);
  assert.match(simulator, /onCandidateSelect=\{selectMeasurementPoint\}/);
  assert.match(simulator, /role="region"/);
  assert.match(simulator, /role="img"/);
  assert.doesNotMatch(simulator, /role="application"/);
  assert.match(
    css,
    /\.measurement-candidate-list\s*\{[\s\S]*?max-height:\s*220px;[\s\S]*?overflow-y:\s*auto;/,
  );
});
