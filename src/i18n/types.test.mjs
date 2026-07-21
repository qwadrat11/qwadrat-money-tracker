import test from "node:test";
import assert from "node:assert/strict";
import { detectDeviceLocale, normalizeLocale, resolveLocale } from "./types.ts";

test("detects supported browser locales", () => {
  assert.equal(detectDeviceLocale(["ru-RU"]), "ru");
  assert.equal(detectDeviceLocale(["uk-UA"]), "uk");
  assert.equal(detectDeviceLocale(["en-GB"]), "en");
  assert.equal(detectDeviceLocale(["de-DE"]), "ru");
});

test("uses profile, local, browser and fallback priority", () => {
  assert.equal(resolveLocale("en", "uk", ["ru-RU"]), "en");
  assert.equal(resolveLocale(null, "uk", ["en-US"]), "uk");
  assert.equal(resolveLocale(null, null, ["en-US"]), "en");
  assert.equal(resolveLocale(null, null, ["pl-PL"]), "ru");
});

test("uses uk ISO code and rejects ua as a language locale", () => {
  assert.equal(normalizeLocale("uk-UA"), "uk");
  assert.equal(normalizeLocale("ua"), null);
});
