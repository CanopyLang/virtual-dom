# canopy/virtual-dom — Features

---

## Virtualization / SSR Hydration (data-elm)

- [ ] **Complete the previously half-implemented virtualization system.**
  Auto-add `data-elm` attribute to all Elm-rendered elements. During virtualization, only virtualize text nodes and `data-elm` elements — leave browser extension elements, `<script>` tags, etc. untouched.
- [ ] **Handle `<textarea>` hydration** by reading `.value` and ignoring children.
- [ ] **Parse `style` attribute** into individual key-value pairs during virtualization.
- [ ] **Detect boolean properties** (`hidden`, `readonly`, `checked`) and convert to boolean properties during virtualization.
- [ ] **Preserve SVG namespaces** during virtualization.
- [ ] **Skip comment nodes** during virtualization (useful as SSR text node separators).

## Performance Instrumentation (from antew)

- [ ] **Consider adding optional performance hooks** for view/diff/patch timing.
  antew/browser adds `performance.now()` timing around the three render phases and dispatches CustomEvents (`elm-view`, `elm-vdom-diff`, `elm-vdom-patch`). Also tracks `Html.Lazy` success/failure rates via `elm-lazy-success`/`elm-lazy-failure` events.
  Consider: built-in dev-mode instrumentation that can be stripped in production builds.
- [ ] **Consider structural equality fallback for lazy memoization.**
  antew's experiment shows that many lazy failures are "false negatives" — structurally identical values with different JS object identity. A shallow structural equality check as fallback could rescue these at reasonable cost.
