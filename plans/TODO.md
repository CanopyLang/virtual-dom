# canopy/virtual-dom — TODO

## Status: Production Ready (v1.0.3)

Core virtual DOM implementation. All features: nodes, attributes, events, keyed nodes, lazy evaluation, XSS sanitization.

---

## Plans

- [Bug Fixes](bug-fixes.md) — Critical upstream fixes from lydell/elm-safe-virtual-dom and elm-janitor
- [Architecture](architecture.md) — tNode tree rewrite (the biggest improvement)
- [Features](features.md) — Virtualization/SSR, performance instrumentation
- [Tests](tests.md) — Test coverage improvements

## References

- lydell/elm-safe-virtual-dom: https://github.com/lydell/elm-safe-virtual-dom
- elm/virtual-dom PR #187: https://github.com/elm/virtual-dom/pull/187
- elm-janitor/virtual-dom stack-1.0.5 (same rewrite)
- antew/virtual-dom: https://github.com/antew/virtual-dom (performance instrumentation)
- andre-dietrich/elm-patch: https://github.com/andre-dietrich/elm-patch (DOM resilience, innerHTML)
- NoRedInk blog post (Nov 2025): thousands of vdom errors/day → zero after adopting lydell's fork
