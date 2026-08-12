import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(__dirname, "..");

let helpersPromise;

async function loadMachineCoordinateHelpers() {
  helpersPromise ??= build({
    stdin: {
      contents: [
        "export {",
        "  mapCncPointToMachineWorld,",
        "  resolveMachineLimitState,",
        '} from "./core/components/MachineSimulator.tsx";',
      ].join("\n"),
      resolveDir: rootDirectory,
      sourcefile: "machine-coordinate-harness.ts",
    },
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    target: "node22",
    packages: "external",
    treeShaking: true,
  }).then((result) => {
    const compiledModule = { exports: {} };
    runInNewContext(result.outputFiles[0].text, {
      require: createRequire(import.meta.url),
      module: compiledModule,
      exports: compiledModule.exports,
    });
    return compiledModule.exports;
  });
  return helpersPromise;
}

test("3D Machine limits follow negative and centered stock origins", async () => {
  const { resolveMachineLimitState } = await loadMachineCoordinateHelpers();
  const stock = {
    originX: -100,
    originY: -50,
    width: 100,
    height: 50,
  };

  const center = resolveMachineLimitState({ x: -50, y: -25 }, stock, 0);
  assert.equal(center.x, false);
  assert.equal(center.y, false);

  const lowerEdge = resolveMachineLimitState({ x: -100, y: -50 }, stock, 0);
  assert.equal(lowerEdge.x, false);
  assert.equal(lowerEdge.y, false);

  const upperEdge = resolveMachineLimitState({ x: 0, y: 0 }, stock, 0);
  assert.equal(upperEdge.x, false);
  assert.equal(upperEdge.y, false);

  assert.equal(
    resolveMachineLimitState({ x: -100.01, y: -25 }, stock, 0).x,
    true,
  );
  assert.equal(
    resolveMachineLimitState({ x: -50, y: 0.01 }, stock, 0).y,
    true,
  );
});

test("3D Machine maps top-zero and bottom-zero Z to the same physical stock", async () => {
  const { mapCncPointToMachineWorld } = await loadMachineCoordinateHelpers();
  const point = { x: -50, y: -25, z: 0 };

  const topSurface = mapCncPointToMachineWorld(point, { bottomZ: -18 });
  assert.equal(topSurface.x, -50);
  assert.equal(topSurface.y, -25);
  assert.equal(topSurface.z, 18);

  const topZeroBottom = mapCncPointToMachineWorld(
    { ...point, z: -18 },
    { bottomZ: -18 },
  );
  assert.equal(topZeroBottom.z, 0);

  const bottomZeroBottom = mapCncPointToMachineWorld(point, { bottomZ: 0 });
  assert.equal(bottomZeroBottom.z, 0);

  const bottomZeroTop = mapCncPointToMachineWorld(
    { ...point, z: 18 },
    { bottomZ: 0 },
  );
  assert.equal(bottomZeroTop.z, 18);
});

test("3D Machine applies the shared stock datum and origin-aware helpers", async () => {
  const source = await readFile(
    path.join(rootDirectory, "core/components/MachineSimulator.tsx"),
    "utf8",
  );

  assert.match(source, /resolveStockZBounds\(simulation, stock\)/);
  assert.match(
    source,
    /mapCncPointToMachineWorld\(currentPos, zBounds\)/,
  );
  assert.match(source, /resolveMachineLimitState\(currentPos, stock\)/);
  assert.match(source, /pointOnSegment\(curSeg, segmentProgress\)/);
  assert.match(source, /resolveSegmentTool\(stock, activeSegment\?\.tool\)/);
  assert.match(source, /stock\.originX \+ stock\.width \/ 2/);
  assert.match(source, /stock\.originY \+ stock\.height \/ 2/);
  assert.match(source, /<MachiningEffects/);
  assert.match(source, /active=\{isRemovingMaterial\}/);
});
