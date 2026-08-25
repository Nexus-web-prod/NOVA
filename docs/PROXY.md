# Proxy runtime

The proxy is a protected subsystem. Cleanup work must not move, rename, remove,
upgrade, or rewrite its files without a dedicated compatibility change and a
full browser regression pass.

The current manager is `proxy/js/nova-proxy-manager.js`. It registers
`proxy/sw.js`, loads
Scramjet 2.0.67-alpha.2 with controller 0.0.14 and utilities 0.0.3, and selects
libcurl or Epoxy transports. Vortex/BareMux remains the legacy fallback. The
configured Wisp endpoint is declared in the manager.

Protected paths are consolidated under `proxy/`, including Scramjet,
controllers, transports, BareMux, Epoxy, Vortex, service workers, diagnostics,
and proxy compatibility/manager modules.

Removal requires proof that no static reference, dynamic loader, service
worker, fallback, deployment step, or browser compatibility path uses the file.
