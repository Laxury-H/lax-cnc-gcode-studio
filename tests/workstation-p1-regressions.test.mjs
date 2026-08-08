import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const rootUrl = new URL("../", import.meta.url);
const read = (relativePath) => readFile(new URL(relativePath, rootUrl), "utf8");
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function functionSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

async function loadAudioModule() {
  const entry = path.resolve(__dirname, "../core/simulation/audio.ts");
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

test("playback completes the final segment before reporting completion", async () => {
  const source = await read("app/page.tsx");
  const tick = functionSection(
    source,
    "setSegmentProgress((current) => {",
    "animationFrame = window.requestAnimationFrame(tick);",
  );

  assert.doesNotMatch(
    tick,
    /cursor \+ stepsToAdvance >= simulation\.segments\.length - 1/,
    "Stopping at length - 1 skips the final segment",
  );
  assert.match(
    tick,
    /cursor \+ stepsToAdvance >= simulation\.segments\.length\b/,
    "Completion must occur only after advancing beyond the last segment",
  );
  assert.match(
    tick,
    /setCursor\(simulation\.segments\.length - 1\)/,
    "The completed playback cursor must resolve to the last segment",
  );
});

test("playback initializes enabled audio from its user gesture", async () => {
  const source = await read("app/page.tsx");
  const togglePlayback = functionSection(
    source,
    "const togglePlayback = useCallback(",
    "useEffect(() => {",
  );

  assert.match(
    togglePlayback,
    /machineSound \|\| finishSound/,
    "Playback must account for both persisted sound preferences",
  );
  assert.match(
    togglePlayback,
    /(?:cncAudio\.init|ensureAudio)\(/,
    "The Play gesture must initialize audio without requiring the sound popover",
  );
});

test("audio initialization resumes an existing suspended context", async (t) => {
  class FakeAudioParam {
    value = 0;
    setTargetAtTime() {}
  }

  class FakeNode {
    gain = new FakeAudioParam();
    frequency = new FakeAudioParam();
    type = "sine";
    connect() {}
    start() {}
  }

  class FakeAudioContext {
    static instances = [];

    state = "running";
    currentTime = 0;
    destination = {};
    resumeCalls = 0;

    constructor() {
      FakeAudioContext.instances.push(this);
    }

    async resume() {
      this.resumeCalls += 1;
      this.state = "running";
    }

    createGain() {
      return new FakeNode();
    }

    createOscillator() {
      return new FakeNode();
    }

    createBiquadFilter() {
      return new FakeNode();
    }
  }

  const previousWindow = globalThis.window;
  globalThis.window = { AudioContext: FakeAudioContext };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  const { CncAudio } = await loadAudioModule();
  const audio = new CncAudio();
  await audio.init();
  const latestContext = FakeAudioContext.instances.at(-1);
  assert.ok(latestContext);
  assert.equal(latestContext.resumeCalls, 1);

  latestContext.state = "suspended";
  await audio.init();
  assert.equal(
    latestContext.resumeCalls,
    2,
    "A context suspended by the browser must resume on the next user gesture",
  );
});

test("browser-reserved workstation shortcuts run before the editable-target guard", async () => {
  const source = await read("app/page.tsx");
  const handler = functionSection(
    source,
    "const handleKeyDown = (event: KeyboardEvent) => {",
    'window.addEventListener("keydown", handleKeyDown);',
  );
  const guardIndex = handler.indexOf(
    'target?.closest("input, textarea, select, button, a, [contenteditable=\'true\']")',
  );
  assert.notEqual(guardIndex, -1, "Missing editable-target shortcut guard");

  for (const shortcut of ["KeyO", "Comma", "F1", "F5", "F8", "F10"]) {
    const shortcutIndex = handler.indexOf(`event.code === "${shortcut}"`);
    assert.notEqual(shortcutIndex, -1, `Missing ${shortcut} workstation shortcut`);
    assert.ok(
      shortcutIndex < guardIndex,
      `${shortcut} must be handled and prevented before browser defaults can run`,
    );
  }

  for (const shortcut of ["KeyO", "Comma", "F1", "F5", "F8", "F10"]) {
    assert.match(
      handler,
      new RegExp(`event\\.code === "${shortcut}"[\\s\\S]{0,180}?event\\.preventDefault\\(\\)`),
      `${shortcut} must prevent its browser default`,
    );
  }
});
