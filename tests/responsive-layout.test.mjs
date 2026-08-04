import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootUrl = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, rootUrl), "utf8");

function mediaBlock(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing boundary ${end}`);
  return source.slice(startIndex, endIndex);
}

test("responsive foundation uses dynamic viewport sizing without a mobile minimum width", async () => {
  const css = await read("app/globals.css");

  assert.match(
    css,
    /\.cnc-app\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?height:\s*100dvh;/,
  );
  assert.doesNotMatch(css, /min-width:\s*350px/);
  assert.doesNotMatch(
    css,
    /\.canvas-tools[^\{]*:nth-child[^\{]*\{[\s\S]*?display:\s*none/,
  );
  assert.doesNotMatch(
    css,
    /@media[^\{]*\{[\s\S]*?\.cnc-app\s*\{[^}]*grid-template-rows:\s*58px/,
  );
});

test("the 900px breakpoint creates a real single-panel grid", async () => {
  const css = await read("app/globals.css");
  const page = await read("app/page.tsx");
  const mobile = mediaBlock(
    css,
    "@media (max-width: 900px)",
    "@media (max-width: 560px)",
  );

  assert.match(
    mobile,
    /\.workspace\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
  );
  assert.match(
    mobile,
    /\.workspace\.is-mobile-code \.simulation-panel\s*\{\s*display:\s*none;/,
  );
  assert.match(
    mobile,
    /\.workspace\.is-mobile-code \.code-panel\s*\{\s*display:\s*grid;/,
  );
  assert.match(
    mobile,
    /\.workspace\.is-mobile-simulation \.code-panel\s*\{\s*display:\s*none;/,
  );
  assert.match(page, /is-mobile-\$\{mobilePanel\}/);
});

test("mobile navigation remains reachable and respects device safe areas", async () => {
  const css = await read("app/globals.css");
  const page = await read("app/page.tsx");
  const mobile = mediaBlock(
    css,
    "@media (max-width: 900px)",
    "@media (max-width: 560px)",
  );

  assert.match(
    mobile,
    /\.mobile-navigation\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?display:\s*flex;/,
  );
  assert.match(mobile, /env\(safe-area-inset-bottom\)/);
  assert.match(
    mobile,
    /\.mobile-navigation button\s*\{[\s\S]*?min-height:\s*48px;/,
  );
  assert.match(page, /className="mobile-navigation"/);
  assert.match(page, /setDrawer\(drawer \? null : "diagnostics"\)/);
  assert.match(page, /onClick=\{openSettings\}/);
});

test("narrow dialogs and settings fit the viewport without horizontal overflow", async () => {
  const css = await read("app/globals.css");
  const narrow = mediaBlock(
    css,
    "@media (max-width: 560px)",
    "@media (max-width: 480px)",
  );

  assert.match(
    narrow,
    /\.settings-modal\[role="dialog"\],[\s\S]*?\.code-editor-modal\[role="dialog"\]\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;[\s\S]*?max-height:\s*100%;/,
  );
  assert.match(
    narrow,
    /\.settings-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
  );
  assert.match(
    narrow,
    /\.tool-item\s*\{[\s\S]*?display:\s*grid;[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    narrow,
    /\.quick-origin-grid\s*\{[\s\S]*?repeat\(4, minmax\(44px, 1fr\)\)/,
  );
  assert.match(
    narrow,
    /\.quick-origin-grid button\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/,
  );
  assert.match(
    narrow,
    /\.simulation-preferences__grid,[\s\S]*?\.simulation-preferences__toggles\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/,
  );
});

test("responsive CSS covers short landscape and coarse-pointer devices", async () => {
  const css = await read("app/globals.css");

  assert.match(
    css,
    /@media \(max-width: 900px\) and \(max-height: 600px\) and \(orientation: landscape\)/,
  );
  assert.match(css, /@media \(pointer: coarse\)/);
  assert.match(
    css,
    /@media \(pointer: coarse\)[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/,
  );
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("extra-small screens stack command groups without hiding controls", async () => {
  const css = await read("app/globals.css");
  const extraSmall = mediaBlock(
    css,
    "@media (max-width: 420px)",
    "@media (max-height: 800px)",
  );

  assert.match(
    extraSmall,
    /\.command-bar\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
  );
  assert.match(
    extraSmall,
    /\.view-switch\s*\{[\s\S]*?width:\s*100%;[\s\S]*?overflow-x:\s*auto;/,
  );
  assert.match(extraSmall, /\.view-switch button\s*\{[\s\S]*?min-width:\s*44px;/);
});

test("transient controls stay above modal layers and outside scroll clipping", async () => {
  const css = await read("app/globals.css");

  assert.match(
    css,
    /\.toast\s*\{[\s\S]*?z-index:\s*10020;[\s\S]*?pointer-events:\s*none;/,
  );
  assert.match(
    css,
    /\.sound-settings-popover\s*\{[\s\S]*?position:\s*fixed;/,
  );
  assert.match(
    css,
    /\.sound-settings-popover\.is-viewport\s*\{[\s\S]*?z-index:\s*10010;/,
  );
});
