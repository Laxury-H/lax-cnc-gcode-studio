import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workerPath = resolve("dist/server/index.js");
const hostingPath = resolve("dist/.openai/hosting.json");

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

console.log("Validated production Worker artifact.");
