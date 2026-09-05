# Testing

Run the local suite with:

```sh
node --test tests/*.test.js tests/*.test.mjs
```

Superseded R8 revision-pinning checks are retained in `tests/legacy/` for
historical reference and are intentionally excluded from the current suite.
The active proxy contract is covered by the R8.21-R8.23, compatibility, routing,
and transport tests in `tests/`.

Before release, manually verify boot, sign-in, home, browser navigation,
social, games, voice, admin, settings, Nova Island, and every holiday theme.
Proxy verification must cover Scramjet startup, libcurl, Epoxy fallback,
Vortex/BareMux fallback, service-worker routing, navigation, and diagnostics.
