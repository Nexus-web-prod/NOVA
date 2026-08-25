const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const inject = fs.readFileSync(path.join(root, "proxy", "controller", "controller.inject.js"), "utf8");
const scramjet = fs.readFileSync(path.join(root, "proxy", "scramjet", "scramjet.js"), "utf8");
const tester = fs.readFileSync(path.join(root, "tools", "nova-compat-100.mjs"), "utf8");

assert(inject.includes("20260822-sj2067-r8.17") || !inject.includes("20260822-sj2067-r8.2"));
assert(!inject.includes("shouldBlockMessageEvent:()=>!1"), "internal message blocking must not be globally disabled");
assert(inject.includes('startsWith("$controller$")'), "controller messages must be hidden from page listeners");
assert(inject.includes('startsWith("$sw$")'), "service-worker control messages must be hidden from page listeners");
assert(inject.includes("t.$scramjet$messagetype"), "proxied page postMessage envelopes must stay deliverable");
assert(scramjet.includes("shouldBlockMessageEvent?.(this"), "Scramjet event layer must consult the blocker");
assert(tester.includes("Cannot access 'r' before initialization") || tester.includes("before initialization"),
       "compat tester must detect the TikTok TDZ regression");

console.log("proxy-r83-regression.test.js: PASS");
