import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

async function renderHome() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders development preview metadata", async () => {
  const response = await renderHome();

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("renders all simulator views and the fullscreen control", async () => {
  const response = await renderHome();
  const html = await response.text();

  for (const label of ["2D MẶT CẮT", "3D KHÔNG GIAN"]) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /Toàn màn hình mô phỏng/);
  assert.match(html, /Mặt phẳng 2D/);
  assert.match(html, /Mô phỏng 3D/);
});

test("renders the detailed CNC workstation telemetry", async () => {
  const response = await renderHome();
  const html = await response.text();

  for (const label of [
    "G-CODE WORKSTATION",
    "PROGRAM",
    "BLOCK",
    "Vị trí hiện tại",
    "PROGRAM OK",
  ]) {
    assert.match(html, new RegExp(label));
  }
  for (const axis of ["X", "Y", "Z"]) {
    assert.match(html, new RegExp(`>${axis}<`));
  }
});
