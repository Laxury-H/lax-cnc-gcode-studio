import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootUrl = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, rootUrl), "utf8");

test("the diagnostics drawer renders messages through the active locale", async () => {
  const page = await read("app/page.tsx");

  assert.match(page, /translateDiagnostic,/);
  assert.match(
    page,
    /translateDiagnostic\(diagnostic\.message, lang\)/,
  );
  assert.doesNotMatch(page, /<small>\{diagnostic\.message\}<\/small>/);
});

test("English diagnostic fallback covers parser and interpreter families", async () => {
  const translations = await read("app/i18n.ts");

  for (const sourceFragment of [
    "Chưa biết vị trí đầu của trục",
    "G90.1 trên mặt phẳng",
    "Chu trình trên mặt phẳng",
    "cần bước khoan Q lớn hơn 0",
    "Dòng có nhiều word",
    "có nhiều hơn một trường checksum",
    "có nhiều hơn một số block N",
    "Checksum phải là trường thực thi cuối cùng",
  ]) {
    assert.ok(
      translations.includes(sourceFragment),
      `Missing EN diagnostic mapping for: ${sourceFragment}`,
    );
  }
});
