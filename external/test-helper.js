// Test helper FFI for inspecting VirtualDom node internals.
//
// VirtualDom nodes are opaque to Canopy code and cannot be compared with (==)
// because they contain function references after fact organization. This module
// provides read-only introspection for test assertions.
//
// IMPORTANT: Due to a compiler arity mismatch in FFI wrapping, VirtualDom.node
// and similar constructors return partially-applied F2 functions instead of
// plain node objects. The _TH_resolve helper forces evaluation by calling the
// F2 with empty list arguments. This correctly recovers the tag name and node
// type, but attributes, children, and other arguments passed in the Canopy
// source are lost. Consequently, only tag name, node type, namespace, and text
// content can be reliably verified.
//
// Imported in TestHelper.can via:
//   foreign import javascript "external/test-helper.js" as TestHelperFFI

// Node type constants (must match virtual-dom.js)
var __TH_TEXT = 0, __TH_NODE = 1, __TH_KEYED_NODE = 2, __TH_CUSTOM = 3;
var __TH_TAGGER = 4, __TH_THUNK = 5;


// Resolve a VirtualDom value that may be a partially-applied FN function
// due to compiler arity mismatch in FFI wrapping, or a thunk node that
// needs to be forced to reveal its underlying node.
function _TH_resolve(val) {
    // Handle partially-applied F2 (node, keyedNode)
    if (typeof val === 'function' && val.a === 2 && val.f) {
        val = val.f(_List_Nil, _List_Nil);
    }
    // Handle partially-applied F4 (nodeNS, keyedNodeNS)
    if (typeof val === 'function' && val.a === 4 && val.f) {
        val = val.f(_List_Nil, _List_Nil, _List_Nil, _List_Nil);
    }
    // Handle thunk nodes (lazy): force evaluation
    if (val && val.$ === __TH_THUNK) {
        val = val.__node || (val.__node = val.__thunk());
        // The thunk result may itself be a partially-applied function
        return _TH_resolve(val);
    }
    return val;
}


/**
 * Get the HTML tag name of an element node. Returns Nothing for text nodes.
 * @canopy-type a -> Maybe String
 * @name getTag
 */
function getTag(node) {
    node = _TH_resolve(node);
    if (node.$ === __TH_NODE || node.$ === __TH_KEYED_NODE) {
        return _Maybe_Just(node.__tag);
    }
    return _Maybe_Nothing;
}


/**
 * Get the text content of a text node. Returns Nothing for element nodes.
 * @canopy-type a -> Maybe String
 * @name getText
 */
function getText(node) {
    if (node.$ === __TH_TEXT) {
        return _Maybe_Just(node.__text);
    }
    return _Maybe_Nothing;
}


/**
 * Count the number of child nodes. Returns 0 for text nodes.
 * Note: due to the FFI arity mismatch, children passed in the Canopy
 * source are lost. This always returns 0 for element nodes.
 * @canopy-type a -> Int
 * @name childCount
 */
function childCount(node) {
    node = _TH_resolve(node);
    if (node.$ === __TH_NODE || node.$ === __TH_KEYED_NODE) {
        return node.__kids.length;
    }
    return 0;
}


/**
 * Check if a node is a text node (type tag 0).
 * @canopy-type a -> Bool
 * @name isTextNode
 */
function isTextNode(node) {
    return node.$ === __TH_TEXT;
}


/**
 * Check if a node is a regular element node (type tag 1).
 * @canopy-type a -> Bool
 * @name isElementNode
 */
function isElementNode(node) {
    node = _TH_resolve(node);
    return node.$ === __TH_NODE;
}


/**
 * Check if a node is a keyed element node (type tag 2).
 * @canopy-type a -> Bool
 * @name isKeyedNode
 */
function isKeyedNode(node) {
    node = _TH_resolve(node);
    return node.$ === __TH_KEYED_NODE;
}


/**
 * Check if a node is a mapped/tagger node (type tag 4).
 * @canopy-type a -> Bool
 * @name isMappedNode
 */
function isMappedNode(node) {
    // Tagger nodes wrap an inner node, not an F2, so no resolve needed.
    // But if the tagger itself is an F2 due to the bug, resolve it.
    node = _TH_resolve(node);
    return node.$ === __TH_TAGGER;
}


/**
 * Get the namespace URI of a namespaced element node.
 * Returns Nothing for non-namespaced nodes or text nodes.
 * @canopy-type a -> Maybe String
 * @name getNamespace
 */
function getNamespace(node) {
    node = _TH_resolve(node);
    if ((node.$ === __TH_NODE || node.$ === __TH_KEYED_NODE) && node.__namespace !== undefined) {
        return _Maybe_Just(node.__namespace);
    }
    return _Maybe_Nothing;
}


/**
 * Get the key of a raw attribute record (before fact organization).
 * @canopy-type a -> String
 * @name getAttrKey
 */
function getAttrKey(attr) {
    return attr.__key || '';
}


/**
 * Get the string value of a raw attribute record (before fact organization).
 * Returns empty string for non-string values.
 * @canopy-type a -> String
 * @name getAttrValue
 */
function getAttrValue(attr) {
    var v = attr.__value;
    // Plain string value (style, attribute)
    if (typeof v === 'string') {
        return v;
    }
    if (v === undefined || v === null) {
        return '';
    }
    // attributeNS wraps value in { __namespace, __value }
    if (typeof v.__value === 'string' && v.__namespace !== undefined) {
        return v.__value;
    }
    // Json-wrapped value in debug mode: { $: 0, a: rawValue }
    if (v.$ === 0 && v.a !== undefined) {
        return String(v.a);
    }
    // Json-wrapped value in production: the raw value itself
    if (typeof v === 'number' || typeof v === 'boolean') {
        return String(v);
    }
    return '';
}


/**
 * Get the type tag of a raw attribute record.
 * Returns empty string for non-attribute values.
 * @canopy-type a -> String
 * @name getAttrType
 */
function getAttrType(attr) {
    return typeof attr.$ === 'string' ? attr.$ : '';
}
