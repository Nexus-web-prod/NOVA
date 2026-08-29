const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert");

const ROOT = path.join(__dirname, "..");
for (const file of ["scramjet.js", "scramjet.mjs"]) {
  const source = fs.readFileSync(path.join(ROOT, "proxy/scramjet", file), "utf8");
  assert(source.includes('function c(e,t,r,o){if((e='), `${file}: central rewrite contract was changed`);
  assert(source.includes('function h(e,t){if((e='), `${file}: central unrewrite contract was changed`);
  assert(source.includes('"string"!=typeof e||!e?e:e.startsWith("blob:")'), `${file}: targeted media attribute guard missing`);
  assert(source.includes('"string"!=typeof e||!e?e:e.startsWith("#")'), `${file}: targeted SVG attribute guard missing`);
}

console.log("PASS proxy-r823-scramjet-contract");
