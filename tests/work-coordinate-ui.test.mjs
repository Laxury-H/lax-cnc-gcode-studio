import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootUrl = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, rootUrl), "utf8");

test("the workstation persists and applies its G54-G59 offset table", async () => {
  const [page, preferences, analysisWorker] = await Promise.all([
    read("app/page.tsx"),
    read("core/ui/workspace-preferences.ts"),
    read("core/workers/program-analysis.worker.ts"),
  ]);

  assert.match(page, /useProgramAnalysis\(\{ source: code, stock, profile, workOffsets \}\)/);
  assert.match(
    analysisWorker,
    /orientStockForProgram\([\s\S]*?request\.source,[\s\S]*?request\.stock,[\s\S]*?request\.profile,[\s\S]*?request\.workOffsets,/,
  );
  assert.match(page, /<details className="work-offset-settings">/);
  assert.match(page, /<table aria-label=\{t\.workOffsetsTableLabel\}>/);
  assert.match(page, /WORK_COORDINATE_SYSTEMS\.map/);
  assert.match(page, /setWorkOffsets\(cloneWorkspaceWorkOffsets/);
  assert.match(page, /type="text"[\s\S]*?inputMode="decimal"/);
  assert.match(
    page,
    /updateDraftWorkOffset\([\s\S]*?event\.target\.value/,
  );
  assert.match(page, /parseWorkOffsetInputDraft\(workOffsetInputDraft\)/);
  assert.match(page, /resizeStockPreservingPinnedOrigin/);
  assert.match(preferences, /value === undefined[\s\S]*?createZeroWorkspaceWorkOffsets/);
});

test("both canvas renderers resolve the selected stock Z datum", async () => {
  const [page, solid] = await Promise.all([
    read("core/components/ToolpathCanvas.tsx"),
    read("core/components/SolidSimulator.tsx"),
  ]);

  assert.match(
    page,
    /topZ: originZ, bottomZ: stockBottomZ[\s\S]*?resolveStockZBounds/,
  );
  assert.match(solid, /resolveSolidOverlayPosition\(props\.stock/);
  assert.match(
    page,
    /const center = project\(\{[\s\S]*?z: originZ,[\s\S]*?ctx\.fillText\(part\.id/,
  );
  assert.doesNotMatch(
    solid,
    /position=\{\[\s*-[\s\S]*?centerZ[\s\S]*?\]\}/,
  );
});

test("playback DRO follows the cursor WCS, G53 machine frame, and active units", async () => {
  const page = (
    await Promise.all([
      read("app/page.tsx"),
      read("core/components/ToolpathCanvas.tsx"),
    ])
  ).join("\n");

  assert.match(
    page,
    /pointOnSegmentInTelemetryCoordinates\(activeSegment, segmentProgress\)/,
  );
  assert.match(
    page,
    /pointInProgramUnits\(currentPositionMm, activeUnits\)/,
  );
  assert.match(
    page,
    /activeSegment\?\.coordinateSystem \?\? simulation\.finalState\.coordinateSystem/,
  );
  assert.match(page, /activeSegment\?\.machineCoordinates[\s\S]*?"MACHINE · G53"/);
  assert.match(page, /activeSegment\?\.distanceMode/);
  assert.match(page, /activeSegment\?\.units/);
  assert.match(page, /activeSegment\?\.plane/);
});
