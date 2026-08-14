import assert from "node:assert/strict";
import test from "node:test";

import { normalizeVinextStaticCacheSource } from "../scripts/patch-vinext-windows-assets.mjs";

test("normalizes vinext production asset cache keys on Windows", () => {
  const buggy = "relativePath: path.relative(base, batch[j]),";
  const patched = normalizeVinextStaticCacheSource(buggy);

  assert.equal(patched.changed, true);
  assert.match(patched.source, /\.split\(path\.sep\)\.join\("\/"\)/);
  assert.doesNotMatch(patched.source, /path\.relative\(base, batch\[j\]\),/);

  const repeated = normalizeVinextStaticCacheSource(patched.source);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.source, patched.source);
});
