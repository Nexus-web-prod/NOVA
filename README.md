<p align="center">
  <img src="website/assets/readme/nova-nexus-header.png" alt="NOVA — owned by Nexus" width="100%">
</p>

<h1 align="center">V7</h1>

<p align="center">
  <strong>The open web was never supposed to feel ordinary.</strong>
</p>

<p align="center">
  No noise. No limits. Just Nova.<br>
  <sub>Owned by <strong>NEXUS</strong>.</sub>
</p>

## Maintenance

Nova is a Cloudflare Pages application with a static frontend, a Pages worker,
Turso-backed APIs, social and game features, voice rooms, and a protected proxy
runtime.

- Development: serve this directory from a local HTTP server.
- Tests: `node --test tests/*.test.js tests/*.test.mjs`
- Deploy production, dev, beta, and main: `./scripts/deploy/deploy.sh`
- On macOS, double-click `scripts/deploy/Deploy Nova.command`.

See [Architecture](docs/ARCHITECTURE.md), [Proxy](docs/PROXY.md),
[Database](docs/DATABASE.md), [Deployment](docs/DEPLOYMENT.md),
[Testing](docs/TESTING.md), and [Security](docs/SECURITY.md).
