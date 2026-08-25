# Testing

Run the local suite with:

```sh
node --test tests/*.test.js tests/*.test.mjs
```

Several historical R8 proxy tests assert superseded revision strings. Record
the baseline before maintenance and require cleanup changes to introduce no new
failures.

Before release, manually verify boot, sign-in, home, browser navigation,
social, games, voice, admin, settings, Nova Island, and every holiday theme.
Proxy verification must cover Scramjet startup, libcurl, Epoxy fallback,
Vortex/BareMux fallback, service-worker routing, navigation, and diagnostics.
