# Third-party notices

## qrcode-generator

Nova includes the browser build of `qrcode-generator` 1.4.4 by Kazuhiko Arase,
used only to generate verification QR codes locally. It is distributed under
the MIT License. Source: https://github.com/kazuhikoarase/qrcode-generator

## Mercury Workshop proxy runtime

Nova vendors the following browser runtime packages locally so the deployed
Cloudflare Pages build does not require `npm install`, `node_modules`, or a
runtime CDN:

- `@mercuryworkshop/scramjet` 2.0.67-alpha.2 — AGPL-3.0-only
- `@mercuryworkshop/scramjet-controller` 0.0.14
- `@mercuryworkshop/scramjet-utils` 0.0.3 — AGPL-3.0-only
- `@mercuryworkshop/proxy-transports` 1.0.2 — MIT
- `@mercuryworkshop/libcurl-transport` 2.0.5 — AGPL-3.0-only (bundles `libcurl.js` 0.7.4 browser/WASM runtime)
- `@mercuryworkshop/epoxy-transport` 3.0.1 — AGPL-3.0-only (bundles `@mercuryworkshop/epoxy-tls` 2.1.19-1 browser/WASM runtime)
- Existing `@mercuryworkshop/bare-mux` 2.1.7 remains only as Nova's isolated legacy rollback/final fallback path.

Upstream source: https://github.com/MercuryWorkshop
