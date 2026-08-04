import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootUrl = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, rootUrl), "utf8");
}

test("3D Machine is an opt-in experimental view with a persisted preference", async () => {
  const [page, translations] = await Promise.all([
    read("app/page.tsx"),
    read("app/i18n.ts"),
  ]);

  assert.match(
    page,
    /const \[machineViewEnabled, setMachineViewEnabled\] = useState\(false\)/,
  );
  assert.match(
    page,
    /MACHINE_VIEW_STORAGE_KEY = "lax_cnc_experimental_machine_view"/,
  );
  assert.match(
    page,
    /enabled = localStorage\.getItem\(MACHINE_VIEW_STORAGE_KEY\) === "true"/,
  );
  assert.match(
    page,
    /localStorage\.setItem\(MACHINE_VIEW_STORAGE_KEY, String\(enabled\)\)/,
  );
  assert.match(
    page,
    /machineViewEnabled\s*\? \["xoy", "solid", "machine"\]\s*: \["xoy", "solid"\]/,
  );
  assert.match(page, /className="experimental-settings"/);
  assert.match(page, /checked=\{machineViewEnabled\}/);
  assert.match(translations, /Chưa dùng để xác nhận va chạm/);
  assert.match(translations, /Do not use it to validate collisions/);
});

test("hidden 3D Machine cannot be entered by shortcut and disabling it exits safely", async () => {
  const page = await read("app/page.tsx");

  assert.match(
    page,
    /event\.code === "Digit3"[\s\S]*?if \(machineViewEnabled\)[\s\S]*?changeView\("machine"\)[\s\S]*?machine3DShortcutMsg/,
  );
  assert.match(
    page,
    /if \(!enabled && view === "machine"\) changeView\("solid"\)/,
  );
});

test("experimental controls have distinct beta and accessible switch styling", async () => {
  const [page, css] = await Promise.all([
    read("app/page.tsx"),
    read("app/globals.css"),
  ]);

  assert.match(page, /className="view-switch__beta"/);
  assert.match(page, /aria-label=\{t\.machine3DTitle\}/);
  assert.match(page, /role="switch"/);
  assert.match(page, /aria-describedby="machine3d-experimental-description"/);
  assert.match(css, /\.experimental-settings\s*\{/);
  assert.match(css, /\.experimental-toggle input:checked \+ \.experimental-toggle__switch/);
  assert.match(css, /\.experimental-toggle input:focus-visible \+ \.experimental-toggle__switch/);
  assert.match(css, /\.view-switch__beta\s*\{/);
  assert.match(css, /width:\s*min\(720px, calc\(100vw - 44px\)\)/);
  assert.doesNotMatch(
    css,
    /\.settings-modal\s*\{[\s\S]*?grid-template-rows:\s*72px minmax\(0, 1fr\) auto 62px/,
  );
  assert.doesNotMatch(
    css,
    /@media \(max-width: 560px\)[\s\S]*?\.settings-grid\s*\{[\s\S]*?max-height:\s*55vh/,
  );
});
