const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

const ROOT = path.join(__dirname, "..");
const manager = fs.readFileSync(path.join(ROOT, "proxy/js/nova-proxy-manager.js"), "utf8");
const compatibility = fs.readFileSync(path.join(ROOT, "proxy/js/nova-proxy-compatibility.js"), "utf8");
const worker = fs.readFileSync(path.join(ROOT, "proxy/sw.js"), "utf8");

assert(manager.includes('const VERSION = "20260829-sj2067-r8.23"'));
assert(worker.includes('const NOVA_PROXY_RUNTIME_VERSION = "20260829-sj2067-r8.23"'));
assert(compatibility.includes('id: "nowgg-cloud-streaming"'));
assert(compatibility.includes('mode: "direct-on-proxy-policy"'));
assert(manager.includes("/unofficial proxy detected/i.test(bodyText)"));
assert(manager.includes("this._showPolicyRestriction(requested.href)"));
assert(manager.includes("Open now.gg directly"));
assert(manager.includes("Nova will not disguise or spoof the proxy"));
assert(!manager.includes('this._activateLegacy(true, "now.gg'));

console.log("PASS proxy-r822-nowgg-policy");
