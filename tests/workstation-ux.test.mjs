import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootUrl = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, rootUrl), "utf8");

function occurrenceCount(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

test("the workstation exposes an explicit mobile workspace switcher", async () => {
  const source = await read("app/page.tsx");

  assert.match(source, /type MobileWorkspacePanel = "simulation" \| "code"/);
  assert.match(source, /useState<MobileWorkspacePanel>\("simulation"\)/);
  assert.match(source, /is-mobile-\$\{mobilePanel\}/);
  assert.match(source, /className="mobile-navigation"/);
  assert.match(source, /setMobilePanel\("simulation"\)/);
  assert.match(source, /setCodeCollapsed\(false\);\s*setMobilePanel\("code"\)/);
  assert.match(source, /setDrawer\(drawer \? null : "diagnostics"\)/);
  assert.match(source, /onClick=\{openSettings\}/);
  assert.match(source, /aria-current=\{mobilePanel === "simulation" \? "page" : undefined\}/);
});

test("validated preferences hydrate, persist, and edit through a cancellable draft", async () => {
  const source = await read("app/page.tsx");

  assert.match(
    source,
    /parseWorkspacePreferences\(\s*localStorage\.getItem\(WORKSPACE_PREFERENCES_KEY\)/,
  );
  assert.match(source, /preferencesHydratedRef\.current = true/);
  assert.match(
    source,
    /localStorage\.setItem\(\s*WORKSPACE_PREFERENCES_KEY,\s*serializeWorkspacePreferences\(preferences\)/,
  );
  assert.match(source, /setSettingsDraft\(\{[\s\S]*?stock: cloneStockSettings\(stock\)/);
  assert.match(source, /serializeWorkspacePreferences\(nextSettingsDraft\)/);
  assert.match(source, /setStock\(cloneStockSettings\(nextSettingsDraft\.stock\)\)/);
  for (const setter of [
    "setProfile(nextSettingsDraft.profile)",
    "setSpeed(nextSettingsDraft.speed)",
    "setQuality(nextSettingsDraft.quality)",
    "setShowRapids(nextSettingsDraft.showRapids)",
  ]) {
    assert.ok(source.includes(setter), `Missing applied draft field: ${setter}`);
  }
  assert.match(source, /setMachineSound\(nextMachineSound\)/);
  assert.match(source, /setFinishSound\(nextFinishSound\)/);
  assert.match(
    source,
    /setWorkOffsets\(cloneWorkspaceWorkOffsets\(parsedWorkOffsets\)\)/,
  );
  assert.match(
    source,
    /const nextWorkOffsets = cloneWorkspaceWorkOffsets\(workOffsets\)[\s\S]*?setSettingsDraft\(\{[\s\S]*?workOffsets: nextWorkOffsets/,
  );
  assert.match(source, /value=\{settingsDraft\.stock\[key\]\}/);
  assert.match(source, /onClose=\{\(\) => setSettingsOpen\(false\)\}/);
  assert.match(source, /onClick=\{applySettings\}/);
});

test("file import handles invalid, empty, and failed reads without a stuck busy state", async () => {
  const source = await read("app/page.tsx");

  assert.match(source, /file\.size > 8 \* 1024 \* 1024/);
  assert.match(source, /\["nc", "txt", "tap", "gcode", "cnc"\]\.includes\(extension\)/);
  assert.match(
    source,
    /setIsImporting\(true\);\s*try \{\s*const text = await file\.text\(\)/,
  );
  assert.match(source, /if \(!text\.trim\(\)\) \{\s*notify\(t\.emptyFileMsg\);\s*return/);
  assert.match(source, /catch \{\s*notify\(t\.fileReadErrorMsg\);\s*\} finally \{\s*setIsImporting\(false\)/);
  assert.match(source, /disabled=\{isImporting\}/);
  assert.match(source, /aria-busy=\{isImporting\}/);
  assert.match(source, /dragDepthRef\.current \+= 1/);
  assert.match(source, /dragDepthRef\.current = Math\.max\(0, dragDepthRef\.current - 1\)/);
  assert.match(source, /dragDepthRef\.current = 0;\s*setDragActive\(false\)/);
});

test("buttons and keyboard shortcuts share one playback state transition", async () => {
  const source = await read("app/page.tsx");

  assert.equal(
    occurrenceCount(source, /const togglePlayback = useCallback\(/g),
    1,
  );
  assert.match(source, /if \(!simulation\.segments\.length\) \{\s*notify\(t\.noMotionPlaybackMsg\)/);
  assert.match(source, /segmentProgress >= 1[\s\S]*?setCursor\(0\);\s*setSegmentProgress\(0\)/);
  assert.match(source, /event\.code === "F5"[\s\S]*?void togglePlayback\(\)/);
  assert.match(source, /event\.code === "Space"[\s\S]*?void togglePlayback\(\)/);
  assert.match(source, /event\.code === "F10"[\s\S]*?stepForward\(\)/);
  assert.match(source, /event\.code === "F8"[\s\S]*?resetPlayback\(\)/);
  assert.match(source, /onClick=\{togglePlayback\}/);
  assert.match(source, /disabled=\{!simulation\.segments\.length\}/);
});

test("code navigation, analysis tabs, and transient feedback expose accessible state", async () => {
  const source = await read("app/page.tsx");

  assert.match(source, /className="code-lines"[\s\S]*?role="listbox"/);
  assert.match(source, /role="option"[\s\S]*?aria-selected=\{index === currentLine\}/);
  assert.match(source, /tabIndex=\{index === focusedCodeLine \? 0 : -1\}/);
  assert.match(source, /onFocus=\{\(\) => setFocusedCodeLine\(index\)\}/);
  assert.match(source, /event\.key !== "ArrowUp"[\s\S]*?event\.key !== "ArrowDown"/);
  assert.match(source, /className="analysis-drawer"[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"/);
  assert.match(source, /className="drawer-tabs"[\s\S]*?role="tablist"/);
  assert.equal(occurrenceCount(source, /role="tab"/g), 5);
  assert.match(source, /role="tabpanel"/);
  assert.match(source, /className="toast" role="status" aria-live="polite"/);
  assert.match(source, /document\.body\.style\.overflow = "hidden"/);
  assert.match(source, /document\.addEventListener\("keydown", trapDrawerFocus, true\)/);
  assert.match(source, /createPortal\(/);
});

test("the canvas observes its real container and supports two-pointer zoom and pan", async () => {
  const source = await read("app/page.tsx");

  assert.match(source, /new ResizeObserver/);
  assert.match(source, /width: Math\.max\(1, Math\.round\(rect\.width\)\)/);
  assert.match(source, /height: Math\.max\(1, Math\.round\(rect\.height\)\)/);
  assert.doesNotMatch(source, /width: Math\.max\(320, Math\.round\(rect\.width\)\)/);
  assert.match(source, /new Map<number, \{ x: number; y: number \}>\(\)/);
  assert.match(source, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/);
  assert.match(source, /activePointersRef\.current\.size >= 2 && pinchRef\.current/);
  assert.match(source, /pinchRef\.current\.zoom \* \(distance \/ pinchRef\.current\.distance\)/);
  assert.match(source, /onPan\(\{[\s\S]*?pinchRef\.current\.panX[\s\S]*?pinchRef\.current\.panY/);
  assert.match(source, /onPointerCancel=\{handlePointerUp\}/);
  assert.match(source, /onLostPointerCapture=\{handlePointerUp\}/);
});
