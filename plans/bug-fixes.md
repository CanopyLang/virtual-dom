# canopy/virtual-dom — Bug Fixes

From lydell/elm-safe-virtual-dom and elm-janitor. All production-proven.

---

## Browser Extension / Third-Party Script Crashes (CRITICAL)

- [x] **Fix crashes from browser extensions modifying the DOM.** (elm/html#44, elm/browser#121, elm/browser#66, elm/virtual-dom#147, elm/virtual-dom#182)
  Extensions like Grammarly, ad blockers, password managers insert/remove DOM nodes. Stock Elm walks the real DOM by index and goes off-track, crashing with `Cannot read properties of undefined (reading '$')`. The tNode tree eliminates this class of crashes entirely.
- [x] **Add safe removal helper** that checks `domNode.parentNode` before calling `removeChild`, preventing crashes when extensions already removed a node.

## Html.map Type Corruption (CRITICAL)

- [x] **Rewrite Html.map to use simple function wrapping instead of tagger chains.** (elm/virtual-dom#105, #162, #171, #166, elm/html#160, elm/compiler#2069)
  Stock Elm stores mutable `{__tagger, __parent}` chains on DOM nodes via `elm_event_node_ref`. These go out of sync with lazy/keyed nodes, delivering messages of the wrong type to `update` — causing runtime crashes or silent data corruption.
  Fix: pass a `sendToApp` function (called `eventNode`) through render/diff. Each `Html.map` wraps it via `_VirtualDom_wrapEventNode`. Event callbacks store `__eventNode` directly — no chain walking.
- [x] **Eliminate `_Json_equality` for event decoder comparison.** Instead of comparing decoders (which was buggy, especially with `oneOf`), always update mutable `__handler` and `__eventNode` references on callback functions. Cheap (no DOM API calls) and correct.

## Page Translation Support (HIGH)

- [ ] **Support Google Translate, Firefox Translate, Safari Translate.** (No upstream issue — affects all Elm apps)
  Google Translate removes text nodes and inserts `<font>` tags. Firefox mutates text in-place. Safari replaces text nodes.
  Detection: check if `domNode.parentNode` exists and if `domNode.data` matches expected text.
  When translation detected: set `_VirtualDom_everTranslated = true`, re-render ALL text nodes in the parent element (removing `<font>` artifacts), and switch to full text node replacement (instead of in-place `domNode.data = text`) to work around a Chrome race condition where updating text during translation fetch produces stale translated text.

## Html.Keyed Improvements (MEDIUM)

- [ ] **Implement forward+backward+swap keyed diffing algorithm.** (elm/virtual-dom#175, #178, #183, #180)
  Stock Elm uses a "one lookahead" approach. New algorithm: (1) forward scan matching keys, (2) backward scan, (3) swap detection, (4) move remainder using `kidsMap` for O(1) lookup.
- [ ] **Use `Element.prototype.moveBefore` API** (shipped in Chrome/Firefox) to move keyed elements without resetting scroll position, animations, iframe state, or video playback. Feature-detect with fallback to `insertBefore`.
- [ ] **Handle duplicate keys gracefully** by appending a postfix (`_elmW6BL`) during virtual node construction and building a `__kidsMap` dictionary alongside `__kids` array.
- [ ] **Add `_VirtualDom_upkey`** to convert non-keyed → keyed when one side is NODE and the other is KEYED_NODE.

## CSS Custom Properties (MEDIUM)

- [ ] **Support `Html.Attributes.style "--primary-color" "salmon"`.** (elm/html#177, elm/virtual-dom#127)
  Use `domNode.style.setProperty(key, value)` for keys starting with `-` (CSS custom properties), and `domNode.style[key] = value` for regular properties.

## SVG xlinkHref Flickering (MEDIUM)

- [ ] **Fix namespaced attribute diffing.** (elm/virtual-dom#62, elm/virtual-dom#159)
  Compare both namespace and value before updating. Skip no-op mutations that cause Safari flickering.

## lazy + input Behavior (MEDIUM)

- [ ] **Apply properties even when `oldNode === newNode` in lazy nodes.** (elm/virtual-dom#189)
  Wrapping an input in `lazy` must not change behavior for `value`/`checked` properties, since users can mutate these by typing/clicking. Implement `_VirtualDom_quickVisit` that traverses lazy subtrees to update props and event handlers without re-evaluating the view function.
