const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

const ROOT = path.join(__dirname, "..");
const manager = fs.readFileSync(path.join(ROOT, "proxy/js/nova-proxy-manager.js"), "utf8");
const compatibility = fs.readFileSync(path.join(ROOT, "proxy/js/nova-proxy-compatibility.js"), "utf8");
const worker = fs.readFileSync(path.join(ROOT, "proxy/sw.js"), "utf8");

assert(manager.includes('const VERSION = "20261011-sj2067-r8.30-tiktok-vortex-always-ready"'));
assert(worker.includes('const NOVA_PROXY_RUNTIME_VERSION = "20261011-sj2067-r8.30-tiktok-vortex-always-ready"'));
assert(compatibility.includes('id: "nowgg-cloud-streaming"'));
assert(compatibility.includes('mode: "direct-on-proxy-policy"'));
assert(manager.includes("/unofficial proxy detected/i.test(bodyText)"));
assert(manager.includes("this._showPolicyRestriction(requested.href, offered)"));
assert(manager.includes("Continue with now.gg’s official proxy"));
assert(manager.includes('event.data?.type !== "nova-nowgg-official-proxy"'));
assert(manager.includes("this.go(target)"));
assert(manager.includes("Nova does not disguise itself or bypass the site’s policy"));
assert(!manager.includes('this._activateLegacy(true, "now.gg'));

console.log("PASS proxy-r822-nowgg-policy");
