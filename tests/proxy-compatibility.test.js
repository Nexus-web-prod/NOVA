"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/nova-proxy-compatibility.js"), "utf8");
const context = { URL };
context.globalThis = context;
vm.runInNewContext(source, context);

const classify = context.NovaProxyCompatibility.classify;
assert.equal(classify("https://accounts.google.com/v3/signin")?.id, "google-auth");
assert.equal(classify("https://www.google.com/search?q=nova"), null);
assert.equal(classify("https://www.google.com/recaptcha/api2/demo"), null);
assert.equal(classify("https://www.epicgames.com/id/authorize?client_id=test")?.id, "epic-auth");
assert.equal(classify("https://www.epicgames.com/site/en-US/home"), null);
assert.equal(classify("https://login.microsoftonline.com/common/oauth2/authorize")?.id, "microsoft-auth");
assert.equal(classify("http://accounts.google.com/signin"), null);
assert.equal(classify("not a url"), null);

console.log("proxy compatibility rules: ok");
