import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadLimits() {
  const result = await build({
    entryPoints: [path.resolve(__dirname, "../core/simulation/program-limits.ts")],
    bundle: true,
    write: false,
    format: "esm",
    target: "es2022",
  });
  const url = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`;
  return import(url);
}

test("caps imported programs by bytes and lines before worker analysis", async () => {
  const {
    MAX_PROGRAM_BYTES,
    MAX_PROGRAM_LINES,
    programLimitViolation,
  } = await loadLimits();

  assert.equal(programLimitViolation("G21\nM30"), null);
  assert.equal(
    programLimitViolation("G1\n".repeat(MAX_PROGRAM_LINES)),
    "lines",
  );
  assert.equal(
    programLimitViolation("X".repeat(MAX_PROGRAM_BYTES + 1)),
    "size",
  );
});
