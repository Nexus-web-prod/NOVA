const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

const ROOT = path.join(__dirname, "..");
const manager = fs.readFileSync(path.join(ROOT, "proxy/js/nova-proxy-manager.js"), "utf8");

assert.match(manager, /const VERSION = "20260829-sj2067-r8\.(?:21|22|23)"/, "R8.21+ transport cache buster missing");

for (const file of ["index.js", "index.mjs"]) {
  const source = fs.readFileSync(path.join(ROOT, "proxy/transports/libcurl", file), "utf8");
  assert(source.includes("this.closed_streams = /* @__PURE__ */ new Map()"), `${file}: closed-stream tombstones missing`);
  assert(source.includes('this.connection.remember_closed_stream(this.stream_id, "local-close")'), `${file}: local closes must create tombstones`);
  assert(source.includes('this.remember_closed_stream(stream.stream_id, "remote-close")'), `${file}: remote closes must create tombstones`);
  assert(source.includes("if (this.closed_streams.has(stream_id)) return"), `${file}: late packets for closed streams must be ignored`);
  assert(source.includes("now - info.closed_at > 1e4"), `${file}: tombstones must expire after ten seconds`);
  assert(source.includes("this.closed_streams.size > 2048"), `${file}: tombstones must remain memory bounded`);
  assert(source.includes("count % 100 === 0"), `${file}: genuine unknown-stream warnings must be rate limited`);
  assert(!source.includes("packet for a stream which doesn't exist"), `${file}: noisy legacy warning remains`);
}

console.log("PASS proxy-r821-wisp-lifecycle");
