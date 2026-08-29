import fs from "node:fs";
import assert from "node:assert/strict";
import * as scramjet from "../proxy/scramjet/scramjet.mjs";

const context = {
  prefix: new URL("https://nova.invalid/~/sj/"),
  interface: { codecEncode: encodeURIComponent, codecDecode: decodeURIComponent }
};
const meta = {
  origin: new URL("https://now.gg/"),
  base: new URL("https://now.gg/")
};

// Browser-native communication schemes must never enter the HTTP proxy path.
for (const url of [
  "about:blank",
  "mailto:player@example.com",
  "tel:+15555550123",
  "stun:stun.example.com",
  "stuns:stun.example.com",
  "turn:relay.example.com",
  "turns:relay.example.com"
]) {
  assert.equal(scramjet.rewriteUrl(url, context, meta), url);
}

// Guard both optional-value HTML rules that previously called startsWith
// before the central URL validator could run.
for (const bundle of ["scramjet.js", "scramjet.mjs"]) {
  const source = fs.readFileSync(new URL(`../proxy/scramjet/${bundle}`, import.meta.url), "utf8");
  assert.ok(source.includes('"string"!=typeof e||!e?e:e.startsWith("blob:")'));
  assert.ok(source.includes('"string"!=typeof e||!e?e:e.startsWith("#")'));
}

console.log("Scramjet R8.21 URL validation regression passed");
