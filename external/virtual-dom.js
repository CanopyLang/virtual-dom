// Canopy VirtualDom FFI — Core virtual DOM implementation
//
// Imported in VirtualDom.can via:
//   foreign import javascript "external/virtual-dom.js" as VirtualDomFFI
//
// This is the largest single FFI module in Canopy. It contains the complete
// virtual DOM implementation: node creation, attribute handling, diffing,
// patching, and rendering. Internal helper functions (prefixed with
// _VirtualDom_) are used by the runtime but not exported to Canopy code.
// Only the functions with FFI annotations are part of the public surface.


// ============================================================================
// HELPERS
// ============================================================================


var _VirtualDom_divertHrefToApp_stack = [];
function _VirtualDom_divertHrefToApp_push(fn) { _VirtualDom_divertHrefToApp_stack.push(fn); }
function _VirtualDom_divertHrefToApp_pop() { _VirtualDom_divertHrefToApp_stack.pop(); }
function _VirtualDom_divertHrefToApp_current() { return _VirtualDom_divertHrefToApp_stack[_VirtualDom_divertHrefToApp_stack.length - 1]; }

var _VirtualDom_doc = typeof document !== 'undefined' ? document : {};

var _VirtualDom_nextMarkerId = 0;
var _VirtualDom_MARKER = 'data-canopy';

// Controls whether data-canopy markers are stamped during _VirtualDom_render.
// Markers are only needed by the debugger (virtualize) and SSR hydration.
// They are false by default so normal rendering (Browser.sandbox/application
// without SSR) skips ~8000+ setAttribute calls per 1000-row Create.
// Set to true before calling _VirtualDom_hydrate for SSR scenarios.
var _VirtualDom_stampMarkers = false;

var _VirtualDom_JSON_SUCCEED = 0;

var __2_TEXT = 0;
var __2_NODE = 1;
var __2_KEYED_NODE = 2;
var __2_CUSTOM = 3;
var __2_TAGGER = 4;
var __2_THUNK = 5;


function _VirtualDom_appendChild(parent, child)
{
	parent.appendChild(child);
}


function _VirtualDom_toHandlerInt(handler)
{
	if (__canopy_debug)
	{
		switch (handler.$)
		{
			case 'Normal': return 0;
			case 'MayStopPropagation': return 1;
			case 'MayPreventDefault': return 2;
			case 'Custom': return 3;
		}
	}
	return handler.$;
}


function _VirtualDom_isOk(result)
{
	return result.$ === (__canopy_debug ? 'Ok' : 0);
}


/**
 * Initialize a virtual DOM application by replacing a DOM node with the
 * rendered virtual node tree. Used internally by the runtime to bootstrap
 * Canopy applications.
 * @canopy-type Node msg -> Json.Decode.Decoder flags -> a -> b -> {}
 * @name init
 */
var init = F4(function(virtualNode, flagDecoder, debugMetadata, args)
{
	// NOTE: this function needs _Platform_export available to work

	var node = args['node'];

	node.parentNode.replaceChild(
		_VirtualDom_renderDomNode(virtualNode, function() {}),
		node
	);

	return {};
});



// ============================================================================
// TEXT
// ============================================================================


/**
 * Create a virtual text node containing the given string. The string will be
 * escaped by the browser so it appears exactly as specified.
 * @canopy-type String -> Node msg
 * @name text
 * @param {string} string - The text content
 * @returns {Object} A virtual text node
 */
function text(string)
{
	return {
		$: __2_TEXT,
		__text: string
	};
}



// ============================================================================
// NODE
// ============================================================================


/**
 * Create a namespaced virtual DOM node. The namespace is used for SVG and
 * MathML elements. Pass undefined for standard HTML elements. Returns a
 * curried function that takes a fact list and child list.
 * @canopy-type String -> String -> List (Attribute msg) -> List (Node msg) -> Node msg
 * @name nodeNS
 * @param {string|undefined} namespace - XML namespace URI, or undefined for HTML
 * @param {string} tag - Element tag name
 * @returns {Function} Curried function accepting facts and kids
 */
var nodeNS = F4(function(namespace, tag, factList, kidList)
{
	for (var kids = []; kidList.b; kidList = kidList.b) // WHILE_CONS
	{
		kids.push(kidList.a);
	}

	return {
		$: __2_NODE,
		__tag: tag,
		__facts: _VirtualDom_organizeFacts(factList),
		__kids: kids,
		__namespace: namespace
	};
});


/**
 * Create a virtual DOM node without a namespace (standard HTML). This is
 * a convenience wrapper around nodeNS with namespace set to undefined.
 * @canopy-type String -> List (Attribute msg) -> List (Node msg) -> Node msg
 * @name node
 * @param {string} tag - Element tag name
 * @returns {Function} Curried function accepting facts and kids
 */
var node = F3(function(tag, factList, kidList)
{
	return A4(nodeNS, undefined, tag, factList, kidList);
});



// ============================================================================
// KEYED NODE
// ============================================================================


/**
 * Create a namespaced keyed virtual DOM node. Each child is a (key, node)
 * pair that enables more efficient list diffing when children are reordered,
 * inserted, or removed.
 * @canopy-type String -> String -> List (Attribute msg) -> List ( String, Node msg ) -> Node msg
 * @name keyedNodeNS
 * @param {string|undefined} namespace - XML namespace URI, or undefined for HTML
 * @param {string} tag - Element tag name
 * @returns {Function} Curried function accepting facts and keyed kids
 */
var keyedNodeNS = F4(function(namespace, tag, factList, kidList)
{
	for (var kids = []; kidList.b; kidList = kidList.b) // WHILE_CONS
	{
		kids.push(kidList.a);
	}

	return {
		$: __2_KEYED_NODE,
		__tag: tag,
		__facts: _VirtualDom_organizeFacts(factList),
		__kids: kids,
		__namespace: namespace
	};
});


/**
 * Create a keyed virtual DOM node without a namespace (standard HTML).
 * Convenience wrapper around keyedNodeNS with namespace set to undefined.
 * @canopy-type String -> List (Attribute msg) -> List ( String, Node msg ) -> Node msg
 * @name keyedNode
 * @param {string} tag - Element tag name
 * @returns {Function} Curried function accepting facts and keyed kids
 */
var keyedNode = F3(function(tag, factList, kidList)
{
	return A4(keyedNodeNS, undefined, tag, factList, kidList);
});



// ============================================================================
// CUSTOM
// ============================================================================


/**
 * Create a custom virtual DOM node backed by a user-supplied render function
 * and diff function. Used internally for embedding non-virtual-DOM widgets.
 * @canopy-type List (Attribute msg) -> model -> (model -> DomNode) -> (model -> model -> Maybe Patch) -> Node msg
 * @name custom
 */
function _VirtualDom_custom(factList, model, render, diff)
{
	return {
		$: __2_CUSTOM,
		__facts: _VirtualDom_organizeFacts(factList),
		__model: model,
		__render: render,
		__diff: diff
	};
}



// ============================================================================
// MAP
// ============================================================================


/**
 * Transform the messages produced by a virtual DOM node by applying a
 * function to each message. This is essential for composing nested
 * components in the Canopy Architecture.
 * @canopy-type (a -> msg) -> Node a -> Node msg
 * @name map
 * @param {Function} tagger - Function to transform messages
 * @param {Object} node - Virtual DOM node whose messages to transform
 * @returns {Object} A tagger virtual node wrapping the original
 */
var map = F2(function(tagger, node)
{
	return {
		$: __2_TAGGER,
		__tagger: tagger,
		__node: node
	};
});



// ============================================================================
// LAZY
// ============================================================================


/**
 * Create a thunk (lazy) virtual node. The thunk stores references for
 * equality checking and a deferred computation. During diffing, if all
 * refs are referentially equal to the previous render, the subtree is
 * skipped entirely.
 *
 * When thunk is null, the computation is derived directly from refs:
 * refs[0] is the view function and refs[1..n] are its arguments. This
 * avoids allocating a separate closure object per lazy call.
 *
 * @param {Array} refs - Reference values for equality checking
 * @param {Function|null} thunk - Deferred computation, or null to derive from refs
 * @returns {Object} A thunk virtual node
 */
function _VirtualDom_thunk(refs, thunk)
{
	return {
		$: __2_THUNK,
		__refs: refs,
		__thunk: thunk,
		__node: undefined
	};
}

/**
 * Force a thunk node to produce its virtual DOM node, caching the result.
 * Supports both closure-based thunks (__thunk !== null) and refs-based
 * thunks (__thunk === null) where refs[0] is the function and refs[1..n]
 * are its arguments.
 */
function _VirtualDom_forceThunk(vNode)
{
	if (vNode.__node) { return vNode.__node; }
	var thunkFn = vNode.__thunk;
	if (thunkFn)
	{
		vNode.__node = thunkFn();
		return vNode.__node;
	}
	var refs = vNode.__refs;
	var fn = refs[0];
	switch (refs.length)
	{
		case 2: vNode.__node = fn(refs[1]); break;
		case 3: vNode.__node = A2(fn, refs[1], refs[2]); break;
		case 4: vNode.__node = A3(fn, refs[1], refs[2], refs[3]); break;
		case 5: vNode.__node = A4(fn, refs[1], refs[2], refs[3], refs[4]); break;
		default:
			var args = refs.slice(1);
			vNode.__node = fn.apply(null, args);
	}
	return vNode.__node;
}

/**
 * Lazily evaluate a view function with one argument. The virtual DOM subtree
 * is only rebuilt when the argument changes (by reference equality).
 * @canopy-type (a -> Node msg) -> a -> Node msg
 * @name lazy
 * @param {Function} func - View function
 * @param {*} a - Argument to check for changes
 * @returns {Object} A thunk virtual node
 */
var lazy = F2(function(func, a)
{
	return _VirtualDom_thunk([func, a], null);
});

/**
 * Lazily evaluate a view function with two arguments. The subtree is only
 * rebuilt when either argument changes (by reference equality).
 * @canopy-type (a -> b -> Node msg) -> a -> b -> Node msg
 * @name lazy2
 * @param {Function} func - View function
 * @param {*} a - First argument
 * @param {*} b - Second argument
 * @returns {Object} A thunk virtual node
 */
var lazy2 = F3(function(func, a, b)
{
	return _VirtualDom_thunk([func, a, b], null);
});

/**
 * Lazily evaluate a view function with three arguments. The subtree is only
 * rebuilt when any argument changes (by reference equality).
 * @canopy-type (a -> b -> c -> Node msg) -> a -> b -> c -> Node msg
 * @name lazy3
 * @param {Function} func - View function
 * @param {*} a - First argument
 * @param {*} b - Second argument
 * @param {*} c - Third argument
 * @returns {Object} A thunk virtual node
 */
var lazy3 = F4(function(func, a, b, c)
{
	return _VirtualDom_thunk([func, a, b, c], null);
});

/**
 * Lazily evaluate a view function with four arguments. The subtree is only
 * rebuilt when any argument changes (by reference equality).
 * @canopy-type (a -> b -> c -> d -> Node msg) -> a -> b -> c -> d -> Node msg
 * @name lazy4
 * @param {Function} func - View function
 * @param {*} a - First argument
 * @param {*} b - Second argument
 * @param {*} c - Third argument
 * @param {*} d - Fourth argument
 * @returns {Object} A thunk virtual node
 */
var lazy4 = F5(function(func, a, b, c, d)
{
	return _VirtualDom_thunk([func, a, b, c, d], null);
});

/**
 * Lazily evaluate a view function with five arguments. The subtree is only
 * rebuilt when any argument changes (by reference equality).
 * @canopy-type (a -> b -> c -> d -> e -> Node msg) -> a -> b -> c -> d -> e -> Node msg
 * @name lazy5
 * @param {Function} func - View function
 * @param {*} a - First argument
 * @param {*} b - Second argument
 * @param {*} c - Third argument
 * @param {*} d - Fourth argument
 * @param {*} e - Fifth argument
 * @returns {Object} A thunk virtual node
 */
var lazy5 = F6(function(func, a, b, c, d, e)
{
	return _VirtualDom_thunk([func, a, b, c, d, e], null);
});

/**
 * Lazily evaluate a view function with six arguments. The subtree is only
 * rebuilt when any argument changes (by reference equality).
 * @canopy-type (a -> b -> c -> d -> e -> f -> Node msg) -> a -> b -> c -> d -> e -> f -> Node msg
 * @name lazy6
 * @param {Function} func - View function
 * @param {*} a - First argument
 * @param {*} b - Second argument
 * @param {*} c - Third argument
 * @param {*} d - Fourth argument
 * @param {*} e - Fifth argument
 * @param {*} f - Sixth argument
 * @returns {Object} A thunk virtual node
 */
var lazy6 = F7(function(func, a, b, c, d, e, f)
{
	return _VirtualDom_thunk([func, a, b, c, d, e, f], null);
});

/**
 * Lazily evaluate a view function with seven arguments. The subtree is only
 * rebuilt when any argument changes (by reference equality).
 * @canopy-type (a -> b -> c -> d -> e -> f -> g -> Node msg) -> a -> b -> c -> d -> e -> f -> g -> Node msg
 * @name lazy7
 * @param {Function} func - View function
 * @param {*} a - First argument
 * @param {*} b - Second argument
 * @param {*} c - Third argument
 * @param {*} d - Fourth argument
 * @param {*} e - Fifth argument
 * @param {*} f - Sixth argument
 * @param {*} g - Seventh argument
 * @returns {Object} A thunk virtual node
 */
var lazy7 = F8(function(func, a, b, c, d, e, f, g)
{
	return _VirtualDom_thunk([func, a, b, c, d, e, f, g], null);
});

/**
 * Lazily evaluate a view function with eight arguments. The subtree is only
 * rebuilt when any argument changes (by reference equality).
 * @canopy-type (a -> b -> c -> d -> e -> f -> g -> h -> Node msg) -> a -> b -> c -> d -> e -> f -> g -> h -> Node msg
 * @name lazy8
 * @param {Function} func - View function
 * @param {*} a - First argument
 * @param {*} b - Second argument
 * @param {*} c - Third argument
 * @param {*} d - Fourth argument
 * @param {*} e - Fifth argument
 * @param {*} f - Sixth argument
 * @param {*} g - Seventh argument
 * @param {*} h - Eighth argument
 * @returns {Object} A thunk virtual node
 */
var lazy8 = F9(function(func, a, b, c, d, e, f, g, h)
{
	return _VirtualDom_thunk([func, a, b, c, d, e, f, g, h], null);
});



// ============================================================================
// FACTS (Attributes, Properties, Styles, Events)
// ============================================================================


/**
 * Create an event handler fact. Wraps a handler (decoder + behavior tag)
 * so it can be attached to a virtual DOM node and later bound to a real
 * DOM event listener.
 * @canopy-type String -> Handler msg -> Attribute msg
 * @name on
 * @param {string} key - DOM event name (e.g. "click", "input")
 * @param {Object} handler - Handler value containing decoder and behavior tag
 * @returns {Object} An event fact record
 */
var on = F2(function(key, handler)
{
	return {
		$: 'a__1_EVENT',
		__key: key,
		__value: handler
	};
});

/**
 * Create a CSS style fact. Multiple styles on the same node are merged by
 * the fact organizer.
 * @canopy-type String -> String -> Attribute msg
 * @name style
 * @param {string} key - CSS property name (e.g. "backgroundColor")
 * @param {string} value - CSS property value (e.g. "red")
 * @returns {Object} A style fact record
 */
var style = F2(function(key, value)
{
	return {
		$: 'a__1_STYLE',
		__key: key,
		__value: value
	};
});

/**
 * Create a DOM property fact. Properties are set via JavaScript property
 * assignment (e.g. `node.className = 'foo'`) rather than setAttribute.
 * The value is a Json.Decode.Value (wrapped JS value).
 * @canopy-type String -> Json.Decode.Value -> Attribute msg
 * @name property
 * @param {string} key - Property name (e.g. "className", "htmlFor")
 * @param {*} value - Json-wrapped property value
 * @returns {Object} A property fact record
 */
var property = F2(function(key, value)
{
	return {
		$: 'a__1_PROP',
		__key: key,
		__value: value
	};
});

/**
 * Create an HTML attribute fact. Attributes are set via setAttribute
 * (e.g. `node.setAttribute('class', 'foo')`).
 * @canopy-type String -> String -> Attribute msg
 * @name attribute
 * @param {string} key - Attribute name (e.g. "class", "for")
 * @param {string} value - Attribute value
 * @returns {Object} An attribute fact record
 */
var attribute = F2(function(key, value)
{
	return {
		$: 'a__1_ATTR',
		__key: key,
		__value: value
	};
});

/**
 * Create a namespaced HTML attribute fact. Used for XML-namespaced
 * attributes like xlink:href in SVG.
 * @canopy-type String -> String -> String -> Attribute msg
 * @name attributeNS
 * @param {string} namespace - XML namespace URI
 * @param {string} key - Attribute name
 * @param {string} value - Attribute value
 * @returns {Object} A namespaced attribute fact record
 */
var attributeNS = F3(function(namespace, key, value)
{
	return {
		$: 'a__1_ATTR_NS',
		__key: key,
		__value: { __namespace: namespace, __value: value }
	};
});



// ============================================================================
// XSS ATTACK VECTOR CHECKS
//
// For some reason, tabs can appear in href protocols and it still works.
// So '\tjava\tSCRIPT:alert("!!!")' and 'javascript:alert("!!!")' are the same
// in practice. That is why _VirtualDom_RE_js and _VirtualDom_RE_js_html look
// so freaky.
//
// Pulling the regular expressions out to the top level gives a slight speed
// boost in small benchmarks (4-10%) but hoisting values to reduce allocation
// can be unpredictable in large programs where JIT may have a harder time with
// functions that are not fully self-contained. The benefit is more that the js
// and js_html ones are so weird that I prefer to see them near each other.
// ============================================================================


var _VirtualDom_RE_script = /^script$/i;
var _VirtualDom_RE_on_formAction = /^(on|formAction$)/i;
var _VirtualDom_RE_js = /^\s*j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/i;
var _VirtualDom_RE_js_html = /^\s*(j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:|d\s*a\s*t\s*a\s*:\s*t\s*e\s*x\s*t\s*\/\s*h\s*t\s*m\s*l\s*(,|;))/i;


/**
 * Sanitize tag names by replacing "script" with "p" to prevent XSS via
 * injected script elements.
 * @canopy-type String -> String
 * @name noScript
 * @param {string} tag - Tag name to sanitize
 * @returns {string} Sanitized tag name ("p" if script, otherwise unchanged)
 */
function noScript(tag)
{
	return _VirtualDom_RE_script.test(tag) ? 'p' : tag;
}

/**
 * Sanitize attribute keys by prefixing "on*" event handlers and "formAction"
 * with "data-" to prevent XSS via inline event handlers.
 * @canopy-type String -> String
 * @name noOnOrFormAction
 * @param {string} key - Attribute key to sanitize
 * @returns {string} Sanitized key (prefixed with "data-" if dangerous)
 */
function noOnOrFormAction(key)
{
	return _VirtualDom_RE_on_formAction.test(key) ? 'data-' + key : key;
}

/**
 * Sanitize property keys by prefixing "innerHTML" and "formAction" with
 * "data-" to prevent XSS via dangerous DOM properties.
 * @canopy-type String -> String
 * @name noInnerHtmlOrFormAction
 * @param {string} key - Property key to sanitize
 * @returns {string} Sanitized key (prefixed with "data-" if dangerous)
 */
function noInnerHtmlOrFormAction(key)
{
	return key == 'innerHTML' || key == 'formAction' || key == 'srcdoc' ? 'data-' + key : key;
}

/**
 * List of URI protocols that can execute code or load arbitrary content,
 * and must never appear in href/src/action attributes.
 */
var _VirtualDom_DANGEROUS_PROTOCOLS = ['javascript', 'data', 'vbscript', 'file'];

/**
 * Return true if the URI string uses a dangerous protocol.
 * Uses the URL API for accurate parsing, falling back to the legacy regex
 * for browsers where URL is unavailable.
 * @param {string} value
 * @returns {boolean}
 */
function _VirtualDom_isDangerousUri(value)
{
	if (typeof value !== 'string') return false;
	try
	{
		var url = new URL(value, location.href);
		// url.protocol includes the trailing colon, e.g. "javascript:"
		var proto = url.protocol.slice(0, -1).toLowerCase();
		return _VirtualDom_DANGEROUS_PROTOCOLS.indexOf(proto) >= 0;
	}
	catch (_)
	{
		// URL constructor throws for relative URLs without a base — treat as safe.
		// Still guard against the classic tab-obfuscated javascript: pattern.
		return _VirtualDom_RE_js.test(value);
	}
}

/**
 * Sanitize URI string values by stripping javascript: and other dangerous
 * protocol URIs to prevent XSS.
 * @canopy-type String -> String
 * @name noJavaScriptUri
 * @param {string} value - URI value to sanitize
 * @returns {string} Empty string if dangerous URI, otherwise unchanged
 */
function noJavaScriptUri(value)
{
	return _VirtualDom_isDangerousUri(value) ? '' : value;
}

/**
 * Sanitize URI string values by stripping javascript:, data:, vbscript:,
 * and file: protocol URIs to prevent XSS.
 * @canopy-type String -> String
 * @name noJavaScriptOrHtmlUri
 * @param {string} value - URI value to sanitize
 * @returns {string} Empty string if dangerous URI, otherwise unchanged
 */
function noJavaScriptOrHtmlUri(value)
{
	return _VirtualDom_isDangerousUri(value) ? '' : value;
}

/**
 * Sanitize JSON-wrapped values that might contain dangerous URIs.
 * Unwraps the JSON value, checks the string, and re-wraps if dangerous.
 * @canopy-type Json.Decode.Value -> Json.Decode.Value
 * @name noJavaScriptOrHtmlJson
 * @param {*} value - Json-wrapped value to sanitize
 * @returns {*} Json-wrapped empty string if dangerous, otherwise unchanged
 */
function noJavaScriptOrHtmlJson(value)
{
	var str = _Json_unwrap(value);
	return (typeof str === 'string' && _VirtualDom_isDangerousUri(str))
		? _Json_wrap('') : value;
}


/**
 * Check if a property key is dangerous (could cause prototype pollution).
 * Blocks __proto__, constructor, and prototype to prevent attackers from
 * polluting Object.prototype via crafted virtual DOM properties.
 * @param {string} key - Property key to check
 * @returns {boolean} True if the key is dangerous
 */
function _VirtualDom_dangerousProperty(key)
{
	return key === '__proto__' || key === 'constructor' || key === 'prototype';
}



// ============================================================================
// MAP FACTS
// ============================================================================


/**
 * Transform the messages in an attribute by applying a function. Only event
 * handler attributes are affected; style, property, and attribute facts
 * pass through unchanged.
 * @canopy-type (a -> b) -> Attribute a -> Attribute b
 * @name mapAttribute
 * @param {Function} func - Function to transform messages
 * @param {Object} attr - Attribute to transform
 * @returns {Object} Transformed attribute
 */
var mapAttribute = F2(function(func, attr)
{
	return (attr.$ === 'a__1_EVENT')
		? A2(on, attr.__key, _VirtualDom_mapHandler(func, attr.__value))
		: attr;
});

/**
 * Transform the decoder inside an event handler by mapping over the
 * decoded message value. Handles all four handler variants (Normal,
 * MayStopPropagation, MayPreventDefault, Custom).
 * @param {Function} func - Function to transform messages
 * @param {Object} handler - Event handler to transform
 * @returns {Object} Transformed handler with mapped decoder
 */
function _VirtualDom_mapHandler(func, handler)
{
	var tag = _VirtualDom_toHandlerInt(handler);

	// 0 = Normal
	// 1 = MayStopPropagation
	// 2 = MayPreventDefault
	// 3 = Custom

	return {
		$: handler.$,
		a:
			!tag
				? _Json_mapMany(func, [handler.a])
				:
			_Json_mapMany(
				tag < 3
					? _VirtualDom_mapEventTuple
					: _VirtualDom_mapEventRecord,
				[{ $: _VirtualDom_JSON_SUCCEED, __msg: func }, handler.a]
			)
	};
}

var _VirtualDom_mapEventTuple = F2(function(func, tuple)
{
	return _Utils_Tuple2(func(tuple.a), tuple.b);
});

var _VirtualDom_mapEventRecord = F2(function(func, record)
{
	return {
		message: func(record.message),
		stopPropagation: record.stopPropagation,
		preventDefault: record.preventDefault
	}
});



// ============================================================================
// ORGANIZE FACTS
//
// Converts the linked list of fact records into a plain JS object grouped
// by category (props at top level, styles/events/attrs/attrNS in sub-objects).
// ============================================================================


function _VirtualDom_organizeFacts(factList)
{
	for (var facts = {}; factList.b; factList = factList.b) // WHILE_CONS
	{
		var entry = factList.a;

		var tag = entry.$;
		var key = entry.__key;
		var value = entry.__value;

		if (tag === 'a__1_PROP')
		{
			if (_VirtualDom_dangerousProperty(key)) { continue; }

			(key === 'className')
				? _VirtualDom_addClass(facts, key, _Json_unwrap(value))
				: facts[key] = _Json_unwrap(value);

			continue;
		}

		var subFacts = facts[tag] || (facts[tag] = {});
		(tag === 'a__1_ATTR' && key === 'class')
			? _VirtualDom_addClass(subFacts, key, value)
			: subFacts[key] = value;
	}

	return facts;
}

function _VirtualDom_addClass(object, key, newClass)
{
	var classes = object[key];
	object[key] = classes ? classes + ' ' + newClass : newClass;
}



// ============================================================================
// tNODE DATA STRUCTURE
//
// A tNode is a parallel tree that stores DOM node references alongside the
// virtual DOM tree. This eliminates the need to walk the live DOM during
// diff+patch, making the implementation immune to browser extensions
// (Grammarly, password managers, ad blockers) that inject/remove DOM nodes.
//
// Structure by vnode type:
//   TEXT:       { __domNode }
//   NODE:       { __domNode, __kids: [tNode] }
//   KEYED_NODE: { __domNode, __kids: [tNode] }
//   CUSTOM:     { __domNode }
//   TAGGER:     { __tagger, __child: tNode }
//   THUNK:      (delegates to inner node's tNode)
// ============================================================================


// ============================================================================
// RENDER
//
// Convert a virtual DOM tree into real DOM nodes AND build the parallel tNode
// tree. The eventNode parameter is a function (sendToApp) that dispatches
// messages. Tagger nodes wrap it via function composition.
//
// Returns a tNode. The DOM node is stored in tNode.__domNode (or in the
// innermost tNode for tagger chains).
// ============================================================================


function _VirtualDom_render(vNode, eventNode)
{
	var tag = vNode.$;

	if (tag === __2_THUNK)
	{
		return _VirtualDom_render(_VirtualDom_forceThunk(vNode), eventNode);
	}

	if (tag === __2_TEXT)
	{
		var domNode = _VirtualDom_doc.createTextNode(vNode.__text);
		return { __domNode: domNode };
	}

	if (tag === __2_TAGGER)
	{
		var subNode = vNode.__node;
		var tagger = vNode.__tagger;

		while (subNode.$ === __2_TAGGER)
		{
			typeof tagger !== 'object'
				? tagger = [tagger, subNode.__tagger]
				: tagger.push(subNode.__tagger);

			subNode = subNode.__node;
		}

		var subEventRoot = _VirtualDom_wrapEventNode(tagger, eventNode);
		var childTNode = _VirtualDom_render(subNode, subEventRoot);
		return { __tagger: tagger, __eventNode: subEventRoot, __child: childTNode };
	}

	if (tag === __2_CUSTOM)
	{
		var domNode = vNode.__render(vNode.__model);
		if (domNode.setAttribute) { domNode.setAttribute(_VirtualDom_MARKER, _VirtualDom_nextMarkerId++); }
		_VirtualDom_applyFacts(domNode, eventNode, vNode.__facts);
		return { __domNode: domNode };
	}

	// at this point `tag` must be __2_NODE or __2_KEYED_NODE

	var domNode = vNode.__namespace
		? _VirtualDom_doc.createElementNS(vNode.__namespace, vNode.__tag)
		: _VirtualDom_doc.createElement(vNode.__tag);

	// Stamp marker for extension-safe DOM identification. Skipped in normal
	// rendering (sandbox/application without SSR) to avoid ~8000 setAttribute
	// calls per 1000-row Create. Enabled by _VirtualDom_stampMarkers for SSR.
	if (_VirtualDom_stampMarkers)
	{
		domNode.setAttribute(_VirtualDom_MARKER, _VirtualDom_nextMarkerId++);
	}

	var _divertHref = _VirtualDom_divertHrefToApp_current();
	if (_divertHref && vNode.__tag == 'a')
	{
		domNode.addEventListener('click', _divertHref(domNode));
	}

	_VirtualDom_applyFacts(domNode, eventNode, vNode.__facts);

	var kids = vNode.__kids;
	var tNodeKids = new Array(kids.length);
	for (var i = 0; i < kids.length; i++)
	{
		var kidVNode = tag === __2_NODE ? kids[i] : kids[i].b;
		var kidTNode = _VirtualDom_render(kidVNode, eventNode);
		tNodeKids[i] = kidTNode;
		_VirtualDom_appendChild(domNode, _VirtualDom_tNodeDomNode(kidTNode));
	}

	return { __domNode: domNode, __kids: tNodeKids };
}


/**
 * Extract the DOM node from a tNode. For tagger tNodes, this walks down to
 * the innermost child where the actual DOM node lives.
 */
function _VirtualDom_tNodeDomNode(tNode)
{
	while (tNode.__child)
	{
		tNode = tNode.__child;
	}
	return tNode.__domNode;
}


/**
 * Wrap an eventNode (sendToApp function) with a tagger chain, producing
 * a new function that applies tagger transformations before dispatching.
 */
function _VirtualDom_wrapEventNode(tagger, eventNode)
{
	return function(msg, isSync) {
		if (typeof tagger === 'function')
		{
			msg = tagger(msg);
		}
		else
		{
			for (var i = tagger.length; i--; )
			{
				msg = tagger[i](msg);
			}
		}
		return eventNode(msg, isSync);
	};
}


/**
 * Legacy render adapter: returns just the DOM node (for call sites that
 * expect a plain DOM node). Creates the tNode internally but only returns
 * the DOM node.
 */
function _VirtualDom_renderDomNode(vNode, eventNode)
{
	var tNode = _VirtualDom_render(vNode, eventNode);
	return _VirtualDom_tNodeDomNode(tNode);
}



// ============================================================================
// APPLY FACTS
//
// Apply the organized facts object to a real DOM node. Dispatches to
// specialized helpers for styles, attributes, namespaced attributes,
// events, and plain properties.
// ============================================================================


function _VirtualDom_applyFacts(domNode, eventNode, facts)
{
	// Direct property access for the four known sub-object fact types is faster
	// than a for...in loop when every element has exactly one fact (the benchmark
	// common case). The for...in at the end handles plain props (rare).

	var styles = facts['a__1_STYLE'];
	if (styles) { _VirtualDom_applyStyles(domNode, styles); }

	var events = facts['a__1_EVENT'];
	if (events) { _VirtualDom_applyEvents(domNode, eventNode, events); }

	var attrs = facts['a__1_ATTR'];
	if (attrs) { _VirtualDom_applyAttrs(domNode, attrs); }

	var attrsNS = facts['a__1_ATTR_NS'];
	if (attrsNS) { _VirtualDom_applyAttrsNS(domNode, attrsNS); }

	for (var key in facts)
	{
		switch (key)
		{
			case 'a__1_STYLE': case 'a__1_EVENT': case 'a__1_ATTR': case 'a__1_ATTR_NS': continue;
		}
		var value = facts[key];
		!_VirtualDom_dangerousProperty(key)
			&& ((key !== 'value' && key !== 'checked') || domNode[key] !== value)
			&& (domNode[key] = value);
	}
}



// ============================================================================
// APPLY STYLES
// ============================================================================


function _VirtualDom_applyStyles(domNode, styles)
{
	var domNodeStyle = domNode.style;

	for (var key in styles)
	{
		var value = styles[key];
		if (key.indexOf('--') === 0)
		{
			value
				? domNodeStyle.setProperty(key, value)
				: domNodeStyle.removeProperty(key);
		}
		else
		{
			domNodeStyle[key] = value;
		}
	}
}



// ============================================================================
// APPLY ATTRS
// ============================================================================


function _VirtualDom_applyAttrs(domNode, attrs)
{
	for (var key in attrs)
	{
		var value = attrs[key];
		typeof value !== 'undefined'
			? domNode.setAttribute(key, value)
			: domNode.removeAttribute(key);
	}
}



// ============================================================================
// APPLY NAMESPACED ATTRS
// ============================================================================


function _VirtualDom_applyAttrsNS(domNode, nsAttrs)
{
	for (var key in nsAttrs)
	{
		var pair = nsAttrs[key];
		var namespace = pair.__namespace;
		var value = pair.__value;

		typeof value !== 'undefined'
			? domNode.setAttributeNS(namespace, key, value)
			: domNode.removeAttributeNS(namespace, key);
	}
}



// ============================================================================
// APPLY EVENTS
// ============================================================================


function _VirtualDom_applyEvents(domNode, eventNode, events)
{
	var allCallbacks = domNode.canopyFs || (domNode.canopyFs = {});

	for (var key in events)
	{
		var newHandler = events[key];
		var oldCallback = allCallbacks[key];

		if (!newHandler)
		{
			domNode.removeEventListener(key, oldCallback);
			allCallbacks[key] = undefined;
			continue;
		}

		if (oldCallback)
		{
			var oldHandler = oldCallback.__handler;
			if (oldHandler.$ === newHandler.$)
			{
				// Always update both handler and eventNode — cheap (no DOM API
				// calls) and guarantees correct tagger wrapping after diff.
				oldCallback.__handler = newHandler;
				oldCallback.__eventNode = eventNode;
				continue;
			}
			domNode.removeEventListener(key, oldCallback);
		}

		oldCallback = _VirtualDom_makeCallback(eventNode, newHandler);
		domNode.addEventListener(key, oldCallback,
			_VirtualDom_passiveSupported
			&& (_VirtualDom_toHandlerInt(newHandler) < 2
				? _VirtualDom_passiveTrue
				: _VirtualDom_passiveFalse)
		);
		allCallbacks[key] = oldCallback;
	}
}



// ============================================================================
// PASSIVE EVENTS
// ============================================================================


var _VirtualDom_passiveSupported;

try
{
	window.addEventListener('t', null, Object.defineProperty({}, 'passive', {
		get: function() { _VirtualDom_passiveSupported = true; }
	}));
	window.removeEventListener('t', null);
}
catch(e) {}

// Pre-allocated passive options objects to avoid per-addEventListener allocations.
// Created lazily after _VirtualDom_passiveSupported is known.
var _VirtualDom_passiveTrue = { passive: true };
var _VirtualDom_passiveFalse = { passive: false };



// ============================================================================
// SCOPED CSS (Styled Components)
//
// CSS facts are hashed into class names and injected as <style> rules.
// This enables pseudo-classes, media queries, and other CSS features that
// inline styles cannot express.
// ============================================================================


var _VirtualDom_cssRuleCache = {};  // cssText → className (deduplicates by full text, not hash)
var _VirtualDom_cssSheet = null;    // lazily created CSSStyleSheet

function _VirtualDom_getCssSheet()
{
	if (_VirtualDom_cssSheet) { return _VirtualDom_cssSheet; }

	var styleEl = _VirtualDom_doc.getElementById
		? _VirtualDom_doc.getElementById('canopy-styled')
		: null;

	if (!styleEl && _VirtualDom_doc.createElement)
	{
		styleEl = _VirtualDom_doc.createElement('style');
		styleEl.id = 'canopy-styled';
		var parent = _VirtualDom_doc.head || _VirtualDom_doc.documentElement;
		if (parent) { parent.appendChild(styleEl); }
	}

	// Only cache when we actually get a sheet — avoids permanently caching
	// null in SSR environments where the sheet becomes available later
	if (styleEl && styleEl.sheet)
	{
		_VirtualDom_cssSheet = styleEl.sheet;
	}

	return _VirtualDom_cssSheet;
}


/**
 * FNV-1a hash (32-bit) to generate stable, short class names from CSS text.
 * Uses codePointAt for correct Unicode handling (surrogate pairs, emoji).
 */
function _VirtualDom_hashCss(cssText)
{
	var hash = 0x811c9dc5;
	for (var i = 0; i < cssText.length;)
	{
		var cp = cssText.codePointAt(i);
		hash ^= cp;
		hash = (hash * 0x01000193) >>> 0;
		i += cp > 0xFFFF ? 2 : 1;
	}
	return '_c_' + hash.toString(36);
}


/**
 * Create a scoped CSS fact with pseudo-class/media query support.
 * Takes a Canopy linked list of { selector : String, declarations : String }
 * records. The declarations are hashed into a deterministic class name,
 * CSS rules are injected into a shared stylesheet, and the class is applied
 * to the element.
 *
 * Selectors starting with `@` (media/container queries) are wrapped around
 * the class selector. Other selectors are appended to `.className` directly
 * (e.g. `:hover` → `.className:hover`, ` .child` → `.className .child`).
 *
 * @canopy-type List { selector : String, declarations : String } -> Attribute msg
 * @name cssScoped
 */
function _VirtualDom_cssScoped(ruleList)
{
	// Collect rules from Canopy linked list into a JS array, and build
	// the hash input string in one pass
	var rules = [];
	var allText = '';
	for (var list = ruleList; list.b; list = list.b)
	{
		var rule = list.a;
		rules.push(rule);
		allText += rule.selector + '{' + rule.declarations + '}';
	}

	// Cache by full CSS text to prevent hash collisions from silently
	// dropping different CSS that hashes to the same class name
	var cached = _VirtualDom_cssRuleCache[allText];
	if (cached)
	{
		return { $: 'a__1_ATTR', __key: 'class', __value: cached };
	}

	var className = _VirtualDom_hashCss(allText);

	// Handle the (extremely rare) case where two different CSS texts produce
	// the same hash — append a disambiguating suffix
	var candidateName = className;
	var suffix = 0;
	while (_VirtualDom_cssRuleCache['__name__' + candidateName])
	{
		suffix++;
		candidateName = className + '_' + suffix;
	}
	className = candidateName;

	var sheet = _VirtualDom_getCssSheet();
	if (sheet)
	{
		for (var i = 0; i < rules.length; i++)
		{
			var selectorText = rules[i].selector;
			var cssRule;

			if (selectorText.charAt(0) === '@')
			{
				// @media / @container queries: wrap the class selector
				// e.g. "@media (max-width: 768px)" → "@media (...) { .cls { decls } }"
				cssRule = selectorText + ' { .' + className + ' { ' + rules[i].declarations + ' } }';
			}
			else
			{
				// Pseudo-class/element: append to class (e.g. ":hover" → ".cls:hover")
				// Nested selector: already has leading space (e.g. " .child" → ".cls .child")
				// Base: empty selector → just ".cls"
				cssRule = '.' + className + selectorText + ' { ' + rules[i].declarations + ' }';
			}

			try { sheet.insertRule(cssRule, sheet.cssRules.length); }
			catch (e) { /* invalid CSS — skip silently */ }
		}
	}

	_VirtualDom_cssRuleCache[allText] = className;
	_VirtualDom_cssRuleCache['__name__' + className] = true;

	return {
		$: 'a__1_ATTR',
		__key: 'class',
		__value: className
	};
}



// ============================================================================
// EVENT HANDLERS
//
// Creates a callback closure that: decodes the event, extracts the message,
// handles stopPropagation / preventDefault based on the handler type, and
// walks up the tagger chain to transform the message before dispatching.
// ============================================================================


function _VirtualDom_makeCallback(eventNode, initialHandler)
{
	function callback(event)
	{
		var handler = callback.__handler;
		var result = _Json_runHelp(handler.a, event);

		if (!_VirtualDom_isOk(result))
		{
			return;
		}

		var tag = _VirtualDom_toHandlerInt(handler);

		// 0 = Normal
		// 1 = MayStopPropagation
		// 2 = MayPreventDefault
		// 3 = Custom

		var value = result.a;
		var message = !tag ? value : tag < 3 ? value.a : value.message;
		var stopPropagation = tag == 1 ? value.b : tag == 3 && value.stopPropagation;

		stopPropagation && event.stopPropagation();
		(tag == 2 ? value.b : tag == 3 && value.preventDefault) && event.preventDefault();

		// eventNode is a function (sendToApp or wrapped sendToApp) — call directly.
		// No tagger chain walking needed; taggers are composed into eventNode
		// via _VirtualDom_wrapEventNode.
		callback.__eventNode(message, stopPropagation); // stopPropagation implies isSync
	}

	callback.__handler = initialHandler;
	callback.__eventNode = eventNode;

	return callback;
}

function _VirtualDom_equalEvents(x, y)
{
	return x.$ == y.$ && _Json_equality(x.a, y.a);
}



// ============================================================================
// DIFF (Legacy wrapper)
//
// Returns the new vnode directly. The actual diffing is done by
// _VirtualDom_applyPatches which performs combined diff+patch via tNodes.
// ============================================================================


function _VirtualDom_diff(x, y)
{
	return y;
}


// assumes the incoming arrays are the same length
function _VirtualDom_pairwiseRefEqual(as, bs)
{
	for (var i = 0; i < as.length; i++)
	{
		if (as[i] !== bs[i])
		{
			return false;
		}
	}

	return true;
}



// ============================================================================
// DIFF FACTS
// ============================================================================


function _VirtualDom_diffFacts(x, y, category)
{
	var diff;

	// look for changes and removals
	for (var xKey in x)
	{
		if (!Object.prototype.hasOwnProperty.call(x, xKey)) continue;
		if (xKey === 'a__1_STYLE' || xKey === 'a__1_EVENT' || xKey === 'a__1_ATTR' || xKey === 'a__1_ATTR_NS')
		{
			var subDiff = _VirtualDom_diffFacts(x[xKey], y[xKey] || {}, xKey);
			if (subDiff)
			{
				diff = diff || {};
				diff[xKey] = subDiff;
			}
			continue;
		}

		// remove if not in the new facts
		if (!(xKey in y))
		{
			diff = diff || {};
			diff[xKey] =
				!category
					? (typeof x[xKey] === 'string' ? '' : null)
					:
				(category === 'a__1_STYLE')
					? ''
					:
				(category === 'a__1_EVENT' || category === 'a__1_ATTR')
					? undefined
					:
				{ __namespace: x[xKey].__namespace, __value: undefined };

			continue;
		}

		var xValue = x[xKey];
		var yValue = y[xKey];

		// reference equal, so don't worry about it
		if (xValue === yValue && xKey !== 'value' && xKey !== 'checked'
			|| category === 'a__1_EVENT' && _VirtualDom_equalEvents(xValue, yValue)
			|| category === 'a__1_ATTR_NS' && xValue.__namespace === yValue.__namespace && xValue.__value === yValue.__value)
		{
			continue;
		}

		diff = diff || {};
		diff[xKey] = yValue;
	}

	// add new stuff
	for (var yKey in y)
	{
		if (!Object.prototype.hasOwnProperty.call(y, yKey)) continue;
		if (!(yKey in x))
		{
			diff = diff || {};
			diff[yKey] = y[yKey];
		}
	}

	return diff;
}



// ============================================================================
// APPLY PATCHES (Legacy wrapper)
//
// In the tNode architecture, _VirtualDom_diff returns the new vnode directly.
// _VirtualDom_applyPatches performs the combined diff+patch using the tNode
// tree stored on the root DOM node.
// ============================================================================


function _VirtualDom_applyPatches(rootDomNode, oldVirtualNode, newVirtualNode, eventNode)
{
	// newVirtualNode is what _VirtualDom_diff returned (just the new vnode)
	var tNode = rootDomNode.__canopyTree;

	if (!tNode)
	{
		// First call — no tNode exists yet (e.g., initial virtualize path).
		// Build a tNode from the existing DOM.
		tNode = _VirtualDom_buildTNode(rootDomNode, oldVirtualNode);
	}

	var newTNode = _VirtualDom_updateTNode(tNode, oldVirtualNode, newVirtualNode, eventNode);
	var newDomNode = _VirtualDom_tNodeDomNode(newTNode);
	newDomNode.__canopyTree = newTNode;
	return newDomNode;
}


/**
 * Build a tNode tree from an existing DOM node and vnode, for the case
 * where we need to bootstrap the tNode tree from pre-existing DOM
 * (e.g., after _VirtualDom_virtualize).
 */
function _VirtualDom_buildTNode(domNode, vNode)
{
	var tag = vNode.$;

	if (tag === __2_THUNK)
	{
		return _VirtualDom_buildTNode(domNode, _VirtualDom_forceThunk(vNode));
	}

	if (tag === __2_TEXT)
	{
		return { __domNode: domNode };
	}

	if (tag === __2_TAGGER)
	{
		var subNode = vNode.__node;
		var tagger = vNode.__tagger;

		while (subNode.$ === __2_TAGGER)
		{
			typeof tagger !== 'object'
				? tagger = [tagger, subNode.__tagger]
				: tagger.push(subNode.__tagger);
			subNode = subNode.__node;
		}

		var childTNode = _VirtualDom_buildTNode(domNode, subNode);
		return { __tagger: tagger, __eventNode: undefined, __child: childTNode };
	}

	if (tag === __2_CUSTOM)
	{
		return { __domNode: domNode };
	}

	// NODE or KEYED_NODE
	var kids = vNode.__kids;
	var childNodes = domNode.childNodes;
	var tNodeKids = new Array(kids.length);
	for (var i = 0; i < kids.length && i < childNodes.length; i++)
	{
		var kidVNode = tag === __2_NODE ? kids[i] : kids[i].b;
		tNodeKids[i] = _VirtualDom_buildTNode(childNodes[i], kidVNode);
	}

	return { __domNode: domNode, __kids: tNodeKids };
}



// ============================================================================
// VIRTUALIZE
//
// Convert a real DOM node tree back into virtual DOM nodes. Used by the
// debugger to capture the current state of the DOM.
// ============================================================================


function _VirtualDom_virtualize(domNode)
{
	// TEXT NODES

	if (domNode.nodeType === 3)
	{
		return text(domNode.textContent);
	}


	// WEIRD NODES

	if (domNode.nodeType !== 1)
	{
		return text('');
	}


	// ELEMENT NODES

	var attrList = _List_Nil;
	var attrs = domNode.attributes;
	for (var i = attrs.length; i--; )
	{
		var attr = attrs[i];
		var name = attr.name;
		var value = attr.value;
		attrList = _List_Cons( A2(attribute, name, value), attrList );
	}

	var tag = domNode.tagName.toLowerCase();
	var kidList = _List_Nil;
	var kids = domNode.childNodes;

	for (var i = kids.length; i--; )
	{
		kidList = _List_Cons(_VirtualDom_virtualize(kids[i]), kidList);
	}
	return A3(node, tag, attrList, kidList);
}



// ============================================================================
// DEKEY
//
// Convert a keyed node into a regular node by stripping the keys from
// each child. Used during diffing when one tree uses keyed nodes and
// the other does not.
// ============================================================================


function _VirtualDom_dekey(keyedNode)
{
	var keyedKids = keyedNode.__kids;
	var len = keyedKids.length;
	var kids = new Array(len);
	for (var i = 0; i < len; i++)
	{
		kids[i] = keyedKids[i].b;
	}

	return {
		$: __2_NODE,
		__tag: keyedNode.__tag,
		__facts: keyedNode.__facts,
		__kids: kids,
		__namespace: keyedNode.__namespace
	};
}



// ============================================================================
// COMBINED DIFF + PATCH (tNode Architecture)
//
// Walk old vdom, new vdom, and the tNode tree simultaneously. The tNode tree
// stores DOM node references, eliminating all DOM walking. Changes are applied
// inline — no patch objects are allocated.
//
// This is immune to browser extensions (Grammarly, LastPass, 1Password, etc.)
// because we never traverse live DOM children to find our nodes.
// ============================================================================


/**
 * Render a new vdom tree into the DOM, replacing the old DOM node, and return
 * the new tNode. Used when a redraw is needed (type change, tag change, etc.).
 */
function _VirtualDom_redrawTNode(domNode, vNode, eventNode)
{
	var parentNode = domNode.parentNode;
	var newTNode = _VirtualDom_render(vNode, eventNode);
	var newDomNode = _VirtualDom_tNodeDomNode(newTNode);

	if (parentNode && newDomNode !== domNode)
	{
		parentNode.replaceChild(newDomNode, domNode);
	}
	return newTNode;
}


/**
 * Public API for the combined diff+patch. Called by browser.js as:
 *   domNode = _VirtualDom_update(domNode, currNode, nextNode, sendToApp);
 *
 * Looks up the tNode tree stored on the root DOM node, performs the combined
 * diff+patch, stores the updated tNode tree, and returns the (possibly new)
 * root DOM node.
 */
function _VirtualDom_update(domNode, x, y, eventNode)
{
	var tNode = domNode.__canopyTree;

	if (!tNode)
	{
		// First update — no tNode exists yet. Build from existing DOM.
		tNode = _VirtualDom_buildTNode(domNode, x);
	}

	var newTNode = _VirtualDom_updateTNode(tNode, x, y, eventNode);
	var newDomNode = _VirtualDom_tNodeDomNode(newTNode);
	newDomNode.__canopyTree = newTNode;
	return newDomNode;
}


/**
 * Core recursive diff+patch. Takes the old tNode, old vnode, new vnode,
 * and eventNode. Returns the updated tNode (which may be a completely new
 * tNode if a redraw occurred).
 */
function _VirtualDom_updateTNode(tNode, x, y, eventNode)
{
	// Same reference — nothing to do
	if (x === y)
	{
		return tNode;
	}

	var xType = x.$;
	var yType = y.$;

	// Type mismatch — redraw, unless NODE↔KEYED_NODE which we can dekey
	if (xType !== yType)
	{
		if (xType === __2_NODE && yType === __2_KEYED_NODE)
		{
			y = _VirtualDom_dekey(y);
			yType = __2_NODE;
		}
		else
		{
			return _VirtualDom_redrawTNode(_VirtualDom_tNodeDomNode(tNode), y, eventNode);
		}
	}

	switch (yType)
	{
		case __2_TEXT:
			var domNode = tNode.__domNode;
			if (x.__text !== y.__text)
			{
				// Detect translated text (browser/extension translation):
				// if DOM text doesn't match old vdom, a translator changed it.
				// We preserve the translation by not updating.
				if (domNode.nodeType === 3 && domNode.data === x.__text)
				{
					domNode.replaceData(0, domNode.length, y.__text);
				}
			}
			return tNode;

		case __2_THUNK:
			var xRefs = x.__refs;
			var yRefs = y.__refs;
			var i = xRefs.length;
			var same = i === yRefs.length;
			while (same && i--)
			{
				same = xRefs[i] === yRefs[i];
			}
			if (same)
			{
				y.__node = x.__node;
				return tNode;
			}
			return _VirtualDom_updateTNode(tNode, _VirtualDom_forceThunk(x), _VirtualDom_forceThunk(y), eventNode);

		case __2_TAGGER:
			var xTaggers = x.__tagger;
			var yTaggers = y.__tagger;
			var nesting = false;

			var xSubNode = x.__node;
			while (xSubNode.$ === __2_TAGGER)
			{
				nesting = true;
				typeof xTaggers !== 'object'
					? xTaggers = [xTaggers, xSubNode.__tagger]
					: xTaggers.push(xSubNode.__tagger);
				xSubNode = xSubNode.__node;
			}

			var ySubNode = y.__node;
			while (ySubNode.$ === __2_TAGGER)
			{
				nesting = true;
				typeof yTaggers !== 'object'
					? yTaggers = [yTaggers, ySubNode.__tagger]
					: yTaggers.push(ySubNode.__tagger);
				ySubNode = ySubNode.__node;
			}

			if (nesting && xTaggers.length !== yTaggers.length)
			{
				return _VirtualDom_redrawTNode(_VirtualDom_tNodeDomNode(tNode), y, eventNode);
			}

			// Build updated eventNode with new tagger wrapping
			var subEventNode;
			if (nesting ? !_VirtualDom_pairwiseRefEqual(xTaggers, yTaggers) : xTaggers !== yTaggers)
			{
				subEventNode = _VirtualDom_wrapEventNode(yTaggers, eventNode);
			}
			else
			{
				subEventNode = tNode.__eventNode || _VirtualDom_wrapEventNode(yTaggers, eventNode);
			}

			var childTNode = _VirtualDom_updateTNode(tNode.__child, xSubNode, ySubNode, subEventNode);
			return { __tagger: yTaggers, __eventNode: subEventNode, __child: childTNode };

		case __2_NODE:
			var domNode = tNode.__domNode;
			if (x.__tag !== y.__tag || x.__namespace !== y.__namespace)
			{
				return _VirtualDom_redrawTNode(domNode, y, eventNode);
			}

			var factsDiff = _VirtualDom_diffFacts(x.__facts, y.__facts);
			if (factsDiff) { _VirtualDom_applyFacts(domNode, eventNode, factsDiff); }

			var newKidTNodes = _VirtualDom_updateTNodeKids(domNode, tNode.__kids, x.__kids, y.__kids, eventNode);
			tNode.__kids = newKidTNodes;
			return tNode;

		case __2_KEYED_NODE:
			var domNode = tNode.__domNode;
			if (x.__tag !== y.__tag || x.__namespace !== y.__namespace)
			{
				return _VirtualDom_redrawTNode(domNode, y, eventNode);
			}

			var factsDiff = _VirtualDom_diffFacts(x.__facts, y.__facts);
			if (factsDiff) { _VirtualDom_applyFacts(domNode, eventNode, factsDiff); }

			var newKidTNodes = _VirtualDom_updateTNodeKeyedKids(domNode, tNode.__kids, x.__kids, y.__kids, eventNode);
			tNode.__kids = newKidTNodes;
			return tNode;

		case __2_CUSTOM:
			var domNode = tNode.__domNode;
			if (x.__render !== y.__render)
			{
				return _VirtualDom_redrawTNode(domNode, y, eventNode);
			}

			var factsDiff = _VirtualDom_diffFacts(x.__facts, y.__facts);
			if (factsDiff) { _VirtualDom_applyFacts(domNode, eventNode, factsDiff); }

			var patch = y.__diff(x.__model, y.__model);
			if (patch) { patch(domNode); }
			return tNode;
	}

	return tNode;
}


/**
 * Update non-keyed children using tNode references. No DOM walking needed —
 * child DOM nodes are stored in tNode.__kids[i].__domNode.
 */
function _VirtualDom_updateTNodeKids(domNode, kidTNodes, xKids, yKids, eventNode)
{
	var xLen = xKids.length;
	var yLen = yKids.length;
	var newKidTNodes = new Array(yLen);

	var minLen = xLen < yLen ? xLen : yLen;

	// Fast path for single-element removal. When exactly one child is removed:
	// scan forward to find the removal position k (first thunk-ref mismatch),
	// verify the tail matches shifted by 1, then remove one DOM node instead
	// of patching O(n) rows in place.
	if (xLen === yLen + 1)
	{
		var k = yLen; // default: last element removed
		for (var i = 0; i < yLen; i++)
		{
			if (!_VirtualDom_sameThunkRefs(xKids[i], yKids[i]))
			{
				k = i;
				break;
			}
		}

		var isRemoval = true;
		for (var i = k; i < yLen; i++)
		{
			if (!_VirtualDom_sameThunkRefs(xKids[i + 1], yKids[i]))
			{
				isRemoval = false;
				break;
			}
		}

		if (isRemoval)
		{
			var removedDom = _VirtualDom_tNodeDomNode(kidTNodes[k]);
			if (removedDom.parentNode)
			{
				removedDom.parentNode.removeChild(removedDom);
			}
			for (var i = 0; i < k; i++) { newKidTNodes[i] = kidTNodes[i]; }
			for (var i = k; i < yLen; i++) { newKidTNodes[i] = kidTNodes[i + 1]; }
			return newKidTNodes;
		}
	}

	// Update existing children pairwise
	for (var i = 0; i < minLen; i++)
	{
		var oldTNode = kidTNodes[i];
		var newTNode = _VirtualDom_updateTNode(oldTNode, xKids[i], yKids[i], eventNode);
		newKidTNodes[i] = newTNode;
	}

	// Remove excess old children (reverse order to avoid index shifting)
	for (var i = xLen - 1; i >= yLen; i--)
	{
		var childDom = _VirtualDom_tNodeDomNode(kidTNodes[i]);
		if (childDom.parentNode)
		{
			childDom.parentNode.removeChild(childDom);
		}
	}

	// Append new children via DocumentFragment to batch all DOM inserts into
	// a single reflow-triggering operation instead of N separate appends.
	if (xLen < yLen)
	{
		var frag = _VirtualDom_doc.createDocumentFragment();
		for (var i = xLen; i < yLen; i++)
		{
			var kidTNode = _VirtualDom_render(yKids[i], eventNode);
			newKidTNodes[i] = kidTNode;
			frag.appendChild(_VirtualDom_tNodeDomNode(kidTNode));
		}
		domNode.appendChild(frag);
	}

	return newKidTNodes;
}


/**
 * Returns true if x and y are the same virtual node for purposes of lazy
 * memoization: either the same object reference, or both are thunks whose
 * refs arrays are pairwise identical. Used to detect structural identity
 * without forcing thunks.
 */
function _VirtualDom_sameThunkRefs(x, y)
{
	if (x === y) { return true; }
	if (x.$ !== __2_THUNK || y.$ !== __2_THUNK) { return false; }
	var xRefs = x.__refs;
	var yRefs = y.__refs;
	var n = xRefs.length;
	if (n !== yRefs.length) { return false; }
	for (var i = 0; i < n; i++)
	{
		if (xRefs[i] !== yRefs[i]) { return false; }
	}
	return true;
}


/**
 * Compute the set of indices in `arr` that form the Longest Increasing
 * Subsequence (LIS). Elements with value -1 (new nodes with no prior position)
 * are excluded. Returns a Set of positions in `arr` whose values are part of
 * the LIS — these elements are already in relative order and need not move.
 *
 * O(n log n) time, O(n) space. Uses patience-sort tails + parent backtracking.
 */
function _VirtualDom_lisIndices(arr)
{
	var n = arr.length;
	var tails = [];
	var tailIndices = [];
	var parent = new Int32Array(n).fill(-1);
	for (var i = 0; i < n; i++)
	{
		var val = arr[i];
		if (val < 0) { continue; }
		var lo = 0, hi = tails.length;
		while (lo < hi)
		{
			var mid = (lo + hi) >>> 1;
			tails[mid] < val ? (lo = mid + 1) : (hi = mid);
		}
		tails[lo] = val;
		tailIndices[lo] = i;
		parent[i] = lo > 0 ? tailIndices[lo - 1] : -1;
	}
	var result = new Set();
	var idx = tailIndices.length > 0 ? tailIndices[tailIndices.length - 1] : -1;
	while (idx >= 0)
	{
		result.add(idx);
		idx = parent[idx];
	}
	return result;
}


/**
 * Update keyed children using tNode references. Uses a map from
 * key → { vnode, tNode, used } for O(1) lookup. Handles insertions,
 * removals, and reorders without walking the live DOM.
 *
 * Prefers Element.prototype.moveBefore (Chrome 133+) for reordering when
 * available, falling back to insertBefore.
 */
function _VirtualDom_updateTNodeKeyedKids(domNode, kidTNodes, xKids, yKids, eventNode)
{
	// Build map: key → { vnode, tNode, used } and orphan pool (unmatched old nodes)
	// for recycling. Orphans are collected in xKids order (= prior DOM order) so
	// that assigning them in-order to unmatched new positions requires no extra moves.
	var oldMap = {};
	for (var i = 0; i < xKids.length; i++)
	{
		var xKey = xKids[i].a;
		oldMap[xKey] = { vnode: xKids[i].b, tNode: kidTNodes[i], used: false };
	}

	// Build new tNode array and DOM order.
	// Two passes: first match existing keys, then assign orphans to unmatched
	// positions rather than creating fresh DOM nodes. This avoids the costly
	// remove+create cycle on operations like Replace where all keys change.
	var newKidTNodes = new Array(yKids.length);
	var newDomOrder = new Array(yKids.length);
	var unmatchedPositions = [];

	for (var i = 0; i < yKids.length; i++)
	{
		var old = oldMap[yKids[i].a];
		if (old)
		{
			var newTNode = _VirtualDom_updateTNode(old.tNode, old.vnode, yKids[i].b, eventNode);
			old.used = true;
			newKidTNodes[i] = newTNode;
			newDomOrder[i] = _VirtualDom_tNodeDomNode(newTNode);
		}
		else
		{
			unmatchedPositions.push(i);
		}
	}

	// Collect unused old entries in xKids (= prior DOM) order for recycling
	var orphanPool = [];
	for (var i = 0; i < xKids.length; i++)
	{
		var entry = oldMap[xKids[i].a];
		if (!entry.used)
		{
			orphanPool.push(entry);
		}
	}

	// Assign orphans to unmatched positions (patch in place) or create fresh nodes
	var orphanIdx = 0;
	for (var i = 0; i < unmatchedPositions.length; i++)
	{
		var pos = unmatchedPositions[i];
		var yKid = yKids[pos].b;
		if (orphanIdx < orphanPool.length)
		{
			// Recycle: patch an existing DOM node instead of destroy+create.
			// For compatible node types this is an in-place attribute/text patch.
			// For incompatible types _VirtualDom_updateTNode calls redrawTNode
			// which does replaceChild, keeping the new element in the same DOM slot.
			var orphan = orphanPool[orphanIdx++];
			var newTNode = _VirtualDom_updateTNode(orphan.tNode, orphan.vnode, yKid, eventNode);
			newKidTNodes[pos] = newTNode;
			newDomOrder[pos] = _VirtualDom_tNodeDomNode(newTNode);
		}
		else
		{
			// No orphan available: create a fresh DOM node
			var newTNode = _VirtualDom_render(yKid, eventNode);
			newKidTNodes[pos] = newTNode;
			newDomOrder[pos] = _VirtualDom_tNodeDomNode(newTNode);
		}
	}

	// Remove only the orphans that were not recycled
	for (var i = orphanIdx; i < orphanPool.length; i++)
	{
		var oldDom = _VirtualDom_tNodeDomNode(orphanPool[i].tNode);
		if (oldDom.parentNode)
		{
			oldDom.parentNode.removeChild(oldDom);
		}
	}

	// Efficient O(n log n) DOM reordering using minimum-moves algorithm.
	// Computes the LIS of current DOM positions in desired order and only
	// moves elements NOT in the LIS, processing right-to-left so that
	// anchor references remain valid throughout.
	var _moveBeforeOp = domNode.moveBefore ? domNode.moveBefore.bind(domNode) : null;

	// Snapshot current marker-element positions before any moves
	var domElems = [];
	for (var c = domNode.firstChild; c; c = c.nextSibling)
	{
		if (c.nodeType === 1 && c.hasAttribute(_VirtualDom_MARKER))
		{
			domElems.push(c);
		}
	}
	var nodeToIdx = new Map();
	for (var i = 0; i < domElems.length; i++)
	{
		nodeToIdx.set(domElems[i], i);
	}

	// Compute old indices for desired order (-1 for new/untracked elements)
	var oldIndices = new Array(newDomOrder.length);
	for (var i = 0; i < newDomOrder.length; i++)
	{
		var idx = nodeToIdx.get(newDomOrder[i]);
		oldIndices[i] = (idx !== undefined) ? idx : -1;
	}

	// Find which positions are already in relative order (LIS)
	var lisSet = _VirtualDom_lisIndices(oldIndices);

	// Move non-LIS elements right-to-left; each gets inserted before its successor
	for (var i = newDomOrder.length - 1; i >= 0; i--)
	{
		if (lisSet.has(i)) { continue; }
		var el = newDomOrder[i];
		var anchor = (i + 1 < newDomOrder.length) ? newDomOrder[i + 1] : null;
		if (_moveBeforeOp)
		{
			_moveBeforeOp(el, anchor);
		}
		else
		{
			domNode.insertBefore(el, anchor);
		}
	}

	return newKidTNodes;
}



// ============================================================================
// SSR HYDRATION
//
// Walk existing server-rendered DOM, attach data-canopy markers, and wire
// up event handlers without re-rendering. This enables server-side rendering
// without a full client re-render.
// ============================================================================


/**
 * Hydrate a server-rendered DOM tree by walking vdom and existing DOM in
 * parallel. Attaches markers, event handlers, and builds the tNode tree
 * needed for subsequent updates. Returns a tNode.
 *
 * @canopy-type DomNode -> Node msg -> (msg -> ()) -> DomNode
 * @name hydrate
 */
function _VirtualDom_hydrate(domNode, vNode, eventNode)
{
	_VirtualDom_stampMarkers = true;
	var tNode = _VirtualDom_hydrateHelp(domNode, vNode, eventNode);
	var rootDom = _VirtualDom_tNodeDomNode(tNode);
	rootDom.__canopyTree = tNode;
	return rootDom;
}


function _VirtualDom_hydrateHelp(domNode, vNode, eventNode)
{
	var tag = vNode.$;

	if (tag === __2_THUNK)
	{
		return _VirtualDom_hydrateHelp(domNode, vNode.__node || (vNode.__node = vNode.__thunk()), eventNode);
	}

	if (tag === __2_TEXT)
	{
		return { __domNode: domNode };
	}

	if (tag === __2_TAGGER)
	{
		var subNode = vNode.__node;
		var tagger = vNode.__tagger;

		while (subNode.$ === __2_TAGGER)
		{
			typeof tagger !== 'object'
				? tagger = [tagger, subNode.__tagger]
				: tagger.push(subNode.__tagger);
			subNode = subNode.__node;
		}

		var subEventRoot = _VirtualDom_wrapEventNode(tagger, eventNode);
		var childTNode = _VirtualDom_hydrateHelp(domNode, subNode, subEventRoot);
		return { __tagger: tagger, __eventNode: subEventRoot, __child: childTNode };
	}

	if (tag === __2_CUSTOM)
	{
		if (domNode.setAttribute) { domNode.setAttribute(_VirtualDom_MARKER, _VirtualDom_nextMarkerId++); }
		_VirtualDom_applyFacts(domNode, eventNode, vNode.__facts);
		return { __domNode: domNode };
	}

	// NODE or KEYED_NODE
	domNode.setAttribute(_VirtualDom_MARKER, _VirtualDom_nextMarkerId++);

	var _divertHref = _VirtualDom_divertHrefToApp_current();
	if (_divertHref && vNode.__tag == 'a')
	{
		domNode.addEventListener('click', _divertHref(domNode));
	}

	// Apply only events (styles/attrs are already in the server-rendered HTML)
	var facts = vNode.__facts;
	if (facts['a__1_EVENT'])
	{
		_VirtualDom_applyEvents(domNode, eventNode, facts['a__1_EVENT']);
	}

	// Recurse into children
	var kids = vNode.__kids;
	var childNodes = domNode.childNodes;
	var isKeyed = tag === __2_KEYED_NODE;
	var tNodeKids = new Array(kids.length);

	for (var i = 0, j = 0; i < kids.length && j < childNodes.length; i++, j++)
	{
		tNodeKids[i] = _VirtualDom_hydrateHelp(childNodes[j], isKeyed ? kids[i].b : kids[i], eventNode);
	}

	return { __domNode: domNode, __kids: tNodeKids };
}
