// FFI helpers for testing the VirtualDom diff/patch algorithm against real DOM.
//
// Unlike test-helper.js which inspects vnode *structures*, this module renders
// vnodes to actual DOM nodes and applies diff/patch updates, then provides
// inspection functions for the resulting DOM. This allows end-to-end testing
// of the diff algorithm's correctness: attribute patching, child reordering,
// keyed node identity preservation, and DOM node reuse.
//
// Imported in DiffTestHelper.can via:
//   foreign import javascript "external/diff-test-helper.js" as DiffTestHelperFFI

// Re-use the resolve helper from test-helper.js to handle the F2 arity
// workaround for VirtualDom.node constructors.
var __DTH_TEXT = 0, __DTH_NODE = 1, __DTH_KEYED_NODE = 2, __DTH_CUSTOM = 3;
var __DTH_TAGGER = 4, __DTH_THUNK = 5;

function _DTH_resolve(val) {
    if (typeof val === 'function' && val.a === 2 && val.f) {
        val = val.f(_List_Nil, _List_Nil);
    }
    if (typeof val === 'function' && val.a === 4 && val.f) {
        val = val.f(_List_Nil, _List_Nil, _List_Nil, _List_Nil);
    }
    if (val && val.$ === __DTH_THUNK) {
        val = val.__node || (val.__node = val.__thunk());
        return _DTH_resolve(val);
    }
    return val;
}


/**
 * Create a noop event node for rendering. The event node is required by
 * _VirtualDom_render and _VirtualDom_update but for test purposes we only
 * need a passthrough tagger.
 */
function _DTH_noopEventNode() {
    return function(msg, isSync) { /* noop: tests don't process messages */ };
}


/**
 * Convert a Canopy List to a JavaScript array.
 */
function _DTH_listToArray(list) {
    var arr = [];
    while (list.$ !== '[]') {
        arr.push(list.a);
        list = list.b;
    }
    return arr;
}


/**
 * Render a VirtualDom.Node into a fresh container div appended to document.body.
 * Returns the container element.
 *
 * @canopy-type VirtualDom.Node msg -> Container
 */
function renderToContainer(vNode) {
    vNode = _DTH_resolve(vNode);

    var container = document.createElement('div');
    container.setAttribute('data-diff-test', 'true');

    var eventNode = _DTH_noopEventNode();
    var tNode = _VirtualDom_render(vNode, eventNode);
    var domNode = _VirtualDom_tNodeDomNode(tNode);

    _VirtualDom_treeMap.set(domNode, tNode);

    container.appendChild(domNode);
    document.body.appendChild(container);

    // Stash the eventNode on the container so updateInContainer can reuse it
    container.__diffTestEventNode = eventNode;

    return container;
}


/**
 * Apply a diff/patch update to a container's rendered DOM. Takes the
 * container, the old vnode, and the new vnode. The old vnode must match
 * what was previously rendered or last updated to.
 *
 * @canopy-type Container -> VirtualDom.Node msg -> VirtualDom.Node msg -> Container
 */
function updateInContainer(container, oldVNode, newVNode) {
    oldVNode = _DTH_resolve(oldVNode);
    newVNode = _DTH_resolve(newVNode);

    var rootDomNode = container.firstChild;
    var eventNode = container.__diffTestEventNode || _DTH_noopEventNode();

    var newDomNode = _VirtualDom_update(rootDomNode, oldVNode, newVNode, eventNode);

    // If the root DOM node was replaced, swap it in the container
    if (newDomNode !== rootDomNode) {
        container.replaceChild(newDomNode, rootDomNode);
    }

    return container;
}


/**
 * Get the number of child nodes in the container's first child (the rendered root).
 * Returns 0 if the container is empty.
 *
 * @canopy-type Container -> Int
 */
function getChildCount(container) {
    var root = container.firstChild;
    return root ? root.childNodes.length : 0;
}


/**
 * Get the tag name of a child node at the given index within the rendered root.
 * Returns Nothing if the index is out of bounds or the child is a text node.
 *
 * @canopy-type Container -> Int -> Maybe String
 */
function getChildTag(container, index) {
    var root = container.firstChild;
    if (!root || index < 0 || index >= root.childNodes.length) {
        return _Maybe_Nothing;
    }
    var child = root.childNodes[index];
    return child.tagName ? _Maybe_Just(child.tagName.toLowerCase()) : _Maybe_Nothing;
}


/**
 * Get the text content of a child node at the given index within the rendered root.
 * Returns Nothing if the index is out of bounds.
 *
 * @canopy-type Container -> Int -> Maybe String
 */
function getChildText(container, index) {
    var root = container.firstChild;
    if (!root || index < 0 || index >= root.childNodes.length) {
        return _Maybe_Nothing;
    }
    return _Maybe_Just(root.childNodes[index].textContent);
}


/**
 * Get the full text content of the rendered root element.
 *
 * @canopy-type Container -> String
 */
function getTextContent(container) {
    var root = container.firstChild;
    return root ? root.textContent : '';
}


/**
 * Get the innerHTML of the rendered root element.
 *
 * @canopy-type Container -> String
 */
function getInnerHTML(container) {
    var root = container.firstChild;
    return root ? root.innerHTML : '';
}


/**
 * Get the value of a DOM attribute on the rendered root element.
 * Returns Nothing if the attribute is not set.
 *
 * @canopy-type Container -> String -> Maybe String
 */
function getDomAttribute(container, name) {
    var root = container.firstChild;
    if (!root || !root.getAttribute) {
        return _Maybe_Nothing;
    }
    var val = root.getAttribute(name);
    return val !== null ? _Maybe_Just(val) : _Maybe_Nothing;
}


/**
 * Get the value of a DOM property on the rendered root element.
 * Returns Nothing if the property is undefined.
 *
 * @canopy-type Container -> String -> Maybe String
 */
function getDomProperty(container, name) {
    var root = container.firstChild;
    if (!root) {
        return _Maybe_Nothing;
    }
    var val = root[name];
    return val !== undefined ? _Maybe_Just(String(val)) : _Maybe_Nothing;
}


/**
 * Get the value of a CSS style property on the rendered root element.
 * Returns Nothing if the property is not set (empty string).
 *
 * @canopy-type Container -> String -> Maybe String
 */
function getDomStyle(container, name) {
    var root = container.firstChild;
    if (!root || !root.style) {
        return _Maybe_Nothing;
    }
    var val = root.style[name] || root.style.getPropertyValue(name);
    return val ? _Maybe_Just(val) : _Maybe_Nothing;
}


/**
 * Walk a path of child indices from the rendered root to find a nested DOM
 * node. Returns Nothing if any index is out of bounds.
 *
 * The path is a Canopy List of Int. For example, [0, 2, 1] means:
 * root.childNodes[0].childNodes[2].childNodes[1]
 *
 * @canopy-type Container -> List Int -> Maybe Container
 */
function getChildAtPath(container, path) {
    var indices = _DTH_listToArray(path);
    var node = container.firstChild;
    if (!node) {
        return _Maybe_Nothing;
    }
    for (var i = 0; i < indices.length; i++) {
        var idx = indices[i];
        if (!node.childNodes || idx < 0 || idx >= node.childNodes.length) {
            return _Maybe_Nothing;
        }
        node = node.childNodes[idx];
    }
    return _Maybe_Just(node);
}


/**
 * Check if two DOM nodes are the exact same reference. Used for identity
 * preservation tests (verifying that the diff algorithm reuses DOM nodes
 * rather than recreating them).
 *
 * @canopy-type Container -> Container -> Bool
 */
function isDomSameNode(node1, node2) {
    return node1 === node2;
}


/**
 * Get the tag name of the container's first child (the rendered root element).
 * Returns Nothing if the container is empty or the root is a text node.
 *
 * @canopy-type Container -> Maybe String
 */
function getRootTag(container) {
    var root = container.firstChild;
    if (!root || !root.tagName) {
        return _Maybe_Nothing;
    }
    return _Maybe_Just(root.tagName.toLowerCase());
}


/**
 * Get the text content of the container's first child (the rendered root).
 * Returns empty string if the container is empty.
 *
 * @canopy-type Container -> String
 */
function getRootText(container) {
    var root = container.firstChild;
    return root ? root.textContent : '';
}
