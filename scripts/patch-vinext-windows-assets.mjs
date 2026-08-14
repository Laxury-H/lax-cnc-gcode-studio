import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// vinext 0.0.50 builds nested cache keys with Windows separators, so
// `vinext start` misses every `/assets/*` request. Remove this project-level
// patch after the upstream fix for cloudflare/vinext#2696 ships here.
const BUGGY_RELATIVE_PATH = "relativePath: path.relative(base, batch[j]),";
const NORMALIZED_RELATIVE_PATH =
  'relativePath: path.relative(base, batch[j]).split(path.sep).join("/"),';

export function normalizeVinextStaticCacheSource(source) {
  if (source.includes(NORMALIZED_RELATIVE_PATH)) {
    return { source, changed: false };
  }
  if (!source.includes(BUGGY_RELATIVE_PATH)) {
    throw new Error(
      "Unsupported vinext static-file-cache layout; review the Windows asset patch",
    );
  }
  return {
    source: source.replace(BUGGY_RELATIVE_PATH, NORMALIZED_RELATIVE_PATH),
    changed: true,
  };
}

async function patchVinextWindowsAssets() {
  if (process.platform !== "win32") return;

  const cachePath = resolve(
    "node_modules/vinext/dist/server/static-file-cache.js",
  );
  const current = await readFile(cachePath, "utf8");
  const result = normalizeVinextStaticCacheSource(current);
  if (!result.changed) return;

  await writeFile(cachePath, result.source, "utf8");
  console.log("Patched vinext Windows static-asset path normalization.");
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  await patchVinextWindowsAssets();
}
