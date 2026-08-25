# Architecture

Nova is served from `website/html/index.html`. Styles live in `website/css/`,
browser modules in `website/js/`, runtime media in `website/assets/`, and JSON
catalogs in `website/data/`.

`_worker.js` supplies the Pages API, authentication, profiles, settings,
social features, administration, ads entitlements, board games, and Turso
persistence. Voice room coordination is deployed separately from
`voice-worker/` and is bound as `VOICE_ROOMS`.

`proxy/sw.js` owns proxy routing. The proxy runtime and its workers, transports,
WASM, compatibility code, and fallback paths are a protected subsystem; see
`PROXY.md` before changing any of them.

Runtime paths are intentionally kept stable. The authoritative deployment file
list is maintained in `scripts/deploy/deploy-pages-turso.sh`.
