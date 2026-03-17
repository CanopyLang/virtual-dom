# canopy/virtual-dom — Architecture: tNode Tree Rewrite

The most significant improvement available. A +1215/-748 line rewrite of VirtualDom.js by Simon Lydell, production-proven at Insurello, NoRedInk (thousands of errors/day → zero), and StorageMart. Corresponds to elm/virtual-dom PR #187.

---

## Replace the 4-step render pipeline with a 1-step combined diff+patch

- [x] **Implement tNode tree architecture.**
  Stock Elm: (1) view → vdom, (2) diff old vs new → patches, (3) walk real DOM to attach nodes to patches (`_VirtualDom_addDomNodes`), (4) apply patches. Step 3 is the root cause of crashes when browser extensions/translators modify the DOM.
  New approach: Store DOM references in a parallel "tNode" tree (`{__domNode, __kids}`) on `rootDomNode.__canopyTree`. Diff and patch in a single pass by traversing old vdom, new vdom, and tNode simultaneously. No patch objects. No DOM walking. No `__descendantsCount`.

## Eliminate patch object allocation entirely

- [x] `_VirtualDom_diff` becomes a no-op that returns the new vnode. `_VirtualDom_applyPatches` does the real combined diff+patch work.

## Fact Application Ordering

- [ ] **Apply facts in correct order:** remove old styles → remove old props → remove old attrs → remove old ns-attrs → apply new styles → apply new attrs → apply new ns-attrs → apply new props → apply new events. Properties last so they win over attributes (properties are diffed against real DOM).
