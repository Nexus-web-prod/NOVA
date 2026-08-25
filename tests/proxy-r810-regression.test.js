'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const libcurl = fs.readFileSync(path.join(ROOT, 'proxy/transports/libcurl/index.mjs'), 'utf8');
const manager = fs.readFileSync(path.join(ROOT, 'proxy/js/nova-proxy-manager.js'), 'utf8');
const pt = fs.readFileSync(path.join(ROOT, 'proxy/proxy-transports/index.mjs'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'proxy/sw.js'), 'utf8');

assert(manager.includes('20260822-sj2067-r8.17'), 'R8.10 manager revision missing');
assert(sw.includes('20260822-sj2067-r8.17'), 'R8.10 service-worker revision missing');

// Discord/zlib-stream: do not silently drop a WebSocket send when curl reports
// CURLE_AGAIN (81). The exact frame must stay queued and retry in order.
assert(libcurl.includes('this.send_queue.push({ data: stable, is_text })'), 'WebSocket sends must be queued');
assert(libcurl.includes('if (result === 81)'), 'CURLE_AGAIN must be handled explicitly');
assert(libcurl.includes('this._flush_send_queue();'), 'queued WebSocket frames must be retried/flushed');
assert(libcurl.includes('setTimeout(() => {'), 'backpressured sends must retry asynchronously');

// Frame completion is determined by libcurl bytesleft, not by an arbitrary
// buffer-size inequality. Exact 64KiB frames must be deliverable.
assert(libcurl.includes('if (!_get_result_bytes_left(result_ptr))'), 'bytes_left must decide receive completion');
assert(!libcurl.includes('data_size !== buffer_size && !_get_result_bytes_left(result_ptr)'), 'old 64KiB frame corruption guard must be gone');

// Preserve exact ArrayBufferView ranges, important for compressed binary data.
assert(libcurl.includes('new Uint8Array(data.buffer, data.byteOffset, data.byteLength)'), 'binary views must preserve byteOffset/byteLength');

// Preserve close semantics instead of turning every upstream close into code 0.
assert(libcurl.includes('close_code = bytes[0] * 256 + bytes[1]'), 'close frame status code must be decoded');
assert(libcurl.includes('new CloseEvent("close", { code, reason, wasClean })'), 'browser-facing close event must preserve metadata');
assert(libcurl.includes('_close_websocket(this.http_handle)'), 'client close must send a WebSocket close control frame');
assert(pt.includes('const wasClean = numericCode !== 0 && numericCode !== 1006'), 'proxy-transports must preserve clean-close semantics');
assert(pt.includes('reason: String(reason || "")'), 'proxy-transports must preserve close reason metadata');

// No Discord-specific hostname or gateway hacks in the transport patch.
const patchedRegion = libcurl.slice(libcurl.indexOf('class CurlWebSocket'), libcurl.indexOf('class TLSSocket'));
assert(!/discord\.com|gateway\.discord\.gg/i.test(patchedRegion), 'libcurl WebSocket fix must remain generic');

console.log('proxy-r810-regression: PASS');
