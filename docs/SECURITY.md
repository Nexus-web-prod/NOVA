# Security

Secrets belong in Cloudflare environment bindings, never in the repository.
Keep authentication and entitlement checks server-backed and fail-closed.

The deployment script uses an explicit runtime allowlist and removes internal
admin modules from the public bundle. Keep `_headers` protections and CSP rules
in sync with required Pages, proxy, Wisp, voice, and advertising origins.

Do not weaken authorization, role checks, privacy routes, input validation, or
cookie handling as part of maintenance. Review `docs/THIRD_PARTY_NOTICES.md` when
changing vendored runtime dependencies.
