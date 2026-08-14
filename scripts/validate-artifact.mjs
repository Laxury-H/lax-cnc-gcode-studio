import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workerPath = resolve("dist/server/index.js");
const hostingPath = resolve("dist/.openai/hosting.json");
const clientManifestPath = resolve("dist/client/.vite/manifest.json");
const vinextStaticCachePath = resolve(
  "node_modules/vinext/dist/server/static-file-cache.js",
);

try {
  JSON.parse(await readFile(hostingPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set("artifact-validation", `${process.pid}-${Date.now()}`);

const worker = await import(workerUrl.href);
if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error(
    "dist/server/index.js must have an ESM default export with fetch(request, env, ctx)",
  );
}

const clientManifest = JSON.parse(await readFile(clientManifestPath, "utf8"));
const pageEntry = clientManifest["app/page.tsx"];
const simulatorSources = [
  "core/components/SolidSimulator.tsx",
  "core/components/MachineSimulator.tsx",
];
if (
  !pageEntry ||
  !simulatorSources.every((source) => pageEntry.dynamicImports?.includes(source))
) {
  throw new Error("The workstation must retain both lazy-loaded 3D simulator entries");
}
for (const source of simulatorSources) {
  const entry = clientManifest[source];
  if (!entry?.file) {
    throw new Error(`Missing production client entry for ${source}`);
  }
  await access(resolve("dist/client", entry.file));
}
if (process.platform === "win32") {
  const vinextStaticCache = await readFile(vinextStaticCachePath, "utf8");
  if (!vinextStaticCache.includes('.split(path.sep).join("/")')) {
    throw new Error(
      "vinext start would return 404 for nested production assets on Windows",
    );
  }
}

console.log("Validated production Worker artifact and 3D simulator chunks.");
