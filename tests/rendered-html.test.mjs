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

test("renders the primary simulator views and hides experimental 3D Machine", async () => {
  const response = await renderHome();
  const html = await response.text();

  for (const label of ["Mặt phẳng phay", "3D Solid"]) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /3D Machine/);
  assert.match(html, /Toàn màn hình mô phỏng/);
});

test("renders the smart 3D measurement entry point", async () => {
  const response = await renderHome();
  const html = await response.text();

  assert.match(html, /Đo thông minh 3D/);
  assert.match(html, /aria-pressed="false"/);
});

test("renders the detailed CNC workstation telemetry", async () => {
  const response = await renderHome();
  const html = await response.text();

  for (const label of [
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
