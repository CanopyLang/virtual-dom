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


var _VirtualDom_divertHrefToApp;

var _VirtualDom_doc = typeof document !== 'undefined' ? document : {};

var _VirtualDom_JSON_SUCCEED = 0;

var __2_TEXT = 0, __2_NODE = 1, __2_KEYED_NODE = 2;
var __2_CUSTOM = 3, __2_TAGGER = 4, __2_THUNK = 5;
var __3_REDRAW = 0, __3_FACTS = 1, __3_TEXT = 2, __3_THUNK = 3;
var __3_TAGGER = 4, __3_REMOVE_LAST = 5, __3_APPEND = 6;
var __3_CUSTOM = 7, __3_REMOVE = 8, __3_REORDER = 9;
var __5_INSERT = 0, __5_REMOVE = 1, __5_MOVE = 2;


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
		_VirtualDom_render(virtualNode, function() {}),
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
var nodeNS = F2(function(namespace, tag)
{
	return F2(function(factList, kidList)
	{
		for (var kids = [], descendantsCount = 0; kidList.b; kidList = kidList.b) // WHILE_CONS
		{
			var kid = kidList.a;
			descendantsCount += (kid.__descendantsCount || 0);
			kids.push(kid);
		}
		descendantsCount += kids.length;

		return {
			$: __2_NODE,
			__tag: tag,
			__facts: _VirtualDom_organizeFacts(factList),
			__kids: kids,
			__namespace: namespace,
			__descendantsCount: descendantsCount
		};
	});
});


/**
 * Create a virtual DOM node without a namespace (standard HTML). This is
 * a convenience wrapper around nodeNS with namespace set to undefined.
 * @canopy-type String -> List (Attribute msg) -> List (Node msg) -> Node msg
 * @name node
 * @param {string} tag - Element tag name
 * @returns {Function} Curried function accepting facts and kids
 */
var node = nodeNS(undefined);



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
var keyedNodeNS = F2(function(namespace, tag)
{
	return F2(function(factList, kidList)
	{
		for (var kids = [], descendantsCount = 0; kidList.b; kidList = kidList.b) // WHILE_CONS
		{
			var kid = kidList.a;
			descendantsCount += (kid.b.__descendantsCount || 0);
			kids.push(kid);
		}
		descendantsCount += kids.length;

		return {
			$: __2_KEYED_NODE,
			__tag: tag,
			__facts: _VirtualDom_organizeFacts(factList),
			__kids: kids,
			__namespace: namespace,
			__descendantsCount: descendantsCount
		};
	});
});


/**
 * Create a keyed virtual DOM node without a namespace (standard HTML).
 * Convenience wrapper around keyedNodeNS with namespace set to undefined.
 * @canopy-type String -> List (Attribute msg) -> List ( String, Node msg ) -> Node msg
 * @name keyedNode
 * @param {string} tag - Element tag name
 * @returns {Function} Curried function accepting facts and keyed kids
 */
var keyedNode = keyedNodeNS(undefined);



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
		__node: node,
		__descendantsCount: 1 + (node.__descendantsCount || 0)
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
 * @param {Array} refs - Reference values for equality checking
 * @param {Function} thunk - Deferred computation producing a virtual node
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
	return _VirtualDom_thunk([func, a], function() {
		return func(a);
	});
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
	return _VirtualDom_thunk([func, a, b], function() {
		return A2(func, a, b);
	});
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
	return _VirtualDom_thunk([func, a, b, c], function() {
		return A3(func, a, b, c);
	});
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
	return _VirtualDom_thunk([func, a, b, c, d], function() {
		return A4(func, a, b, c, d);
	});
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
	return _VirtualDom_thunk([func, a, b, c, d, e], function() {
		return A5(func, a, b, c, d, e);
	});
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
	return _VirtualDom_thunk([func, a, b, c, d, e, f], function() {
		return A6(func, a, b, c, d, e, f);
	});
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
	return _VirtualDom_thunk([func, a, b, c, d, e, f, g], function() {
		return A7(func, a, b, c, d, e, f, g);
	});
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
	return _VirtualDom_thunk([func, a, b, c, d, e, f, g, h], function() {
		return A8(func, a, b, c, d, e, f, g, h);
	});
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
	return key == 'innerHTML' || key == 'formAction' ? 'data-' + key : key;
}

/**
 * Sanitize URI string values by stripping javascript: protocol URIs to
 * prevent XSS.
 * @canopy-type String -> String
 * @name noJavaScriptUri
 * @param {string} value - URI value to sanitize
 * @returns {string} Empty string if javascript: URI, otherwise unchanged
 */
function noJavaScriptUri(value)
{
	return _VirtualDom_RE_js.test(value) ? '' : value;
}

/**
 * Sanitize URI string values by stripping both javascript: and data:text/html
 * protocol URIs to prevent XSS.
 * @canopy-type String -> String
 * @name noJavaScriptOrHtmlUri
 * @param {string} value - URI value to sanitize
 * @returns {string} Empty string if dangerous URI, otherwise unchanged
 */
function noJavaScriptOrHtmlUri(value)
{
	return _VirtualDom_RE_js_html.test(value) ? '' : value;
}

/**
 * Sanitize JSON-wrapped values that might contain javascript: or data:text/html
 * URIs. Unwraps the JSON value, checks the string, and re-wraps if dangerous.
 * @canopy-type Json.Decode.Value -> Json.Decode.Value
 * @name noJavaScriptOrHtmlJson
 * @param {*} value - Json-wrapped value to sanitize
 * @returns {*} Json-wrapped empty string if dangerous, otherwise unchanged
 */
function noJavaScriptOrHtmlJson(value)
{
	return (typeof _Json_unwrap(value) === 'string' && _VirtualDom_RE_js_html.test(_Json_unwrap(value)))
		? _Json_wrap('') : value;
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
		__$message: func(record.__$message),
		__$stopPropagation: record.__$stopPropagation,
		__$preventDefault: record.__$preventDefault
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
// RENDER
//
// Convert a virtual DOM tree into real DOM nodes. The eventNode parameter
// is a linked list of tagger functions that transform messages as they
// bubble up through nested `map` calls.
// ============================================================================


function _VirtualDom_render(vNode, eventNode)
{
	var tag = vNode.$;

	if (tag === __2_THUNK)
	{
		return _VirtualDom_render(vNode.__node || (vNode.__node = vNode.__thunk()), eventNode);
	}

	if (tag === __2_TEXT)
	{
		return _VirtualDom_doc.createTextNode(vNode.__text);
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

		var subEventRoot = { __tagger: tagger, __parent: eventNode };
		var domNode = _VirtualDom_render(subNode, subEventRoot);
		domNode.elm_event_node_ref = subEventRoot;
		return domNode;
	}

	if (tag === __2_CUSTOM)
	{
		var domNode = vNode.__render(vNode.__model);
		_VirtualDom_applyFacts(domNode, eventNode, vNode.__facts);
		return domNode;
	}

	// at this point `tag` must be __2_NODE or __2_KEYED_NODE

	var domNode = vNode.__namespace
		? _VirtualDom_doc.createElementNS(vNode.__namespace, vNode.__tag)
		: _VirtualDom_doc.createElement(vNode.__tag);

	if (_VirtualDom_divertHrefToApp && vNode.__tag == 'a')
	{
		domNode.addEventListener('click', _VirtualDom_divertHrefToApp(domNode));
	}

	_VirtualDom_applyFacts(domNode, eventNode, vNode.__facts);

	for (var kids = vNode.__kids, i = 0; i < kids.length; i++)
	{
		_VirtualDom_appendChild(domNode, _VirtualDom_render(tag === __2_NODE ? kids[i] : kids[i].b, eventNode));
	}

	return domNode;
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
	for (var key in facts)
	{
		var value = facts[key];

		key === 'a__1_STYLE'
			? _VirtualDom_applyStyles(domNode, value)
			:
		key === 'a__1_EVENT'
			? _VirtualDom_applyEvents(domNode, eventNode, value)
			:
		key === 'a__1_ATTR'
			? _VirtualDom_applyAttrs(domNode, value)
			:
		key === 'a__1_ATTR_NS'
			? _VirtualDom_applyAttrsNS(domNode, value)
			:
		((key !== 'value' && key !== 'checked') || domNode[key] !== value) && (domNode[key] = value);
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
		domNodeStyle[key] = styles[key];
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
	var allCallbacks = domNode.elmFs || (domNode.elmFs = {});

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
				oldCallback.__handler = newHandler;
				continue;
			}
			domNode.removeEventListener(key, oldCallback);
		}

		oldCallback = _VirtualDom_makeCallback(eventNode, newHandler);
		domNode.addEventListener(key, oldCallback,
			_VirtualDom_passiveSupported
			&& { passive: _VirtualDom_toHandlerInt(newHandler) < 2 }
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
}
catch(e) {}



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
		var message = !tag ? value : tag < 3 ? value.a : value.__$message;
		var stopPropagation = tag == 1 ? value.b : tag == 3 && value.__$stopPropagation;
		var currentEventNode = (
			stopPropagation && event.stopPropagation(),
			(tag == 2 ? value.b : tag == 3 && value.__$preventDefault) && event.preventDefault(),
			eventNode
		);
		var tagger;
		var i;
		while (tagger = currentEventNode.__tagger)
		{
			if (typeof tagger == 'function')
			{
				message = tagger(message);
			}
			else
			{
				for (var i = tagger.length; i--; )
				{
					message = tagger[i](message);
				}
			}
			currentEventNode = currentEventNode.__parent;
		}
		currentEventNode(message, stopPropagation); // stopPropagation implies isSync
	}

	callback.__handler = initialHandler;

	return callback;
}

function _VirtualDom_equalEvents(x, y)
{
	return x.$ == y.$ && _Json_equality(x.a, y.a);
}



// ============================================================================
// DIFF
//
// Computes a list of patches that describe how to transform the old virtual
// DOM tree into the new one. Each patch records its target index (position
// in a depth-first traversal) so that the patcher can skip unchanged subtrees.
// ============================================================================


function _VirtualDom_diff(x, y)
{
	var patches = [];
	_VirtualDom_diffHelp(x, y, patches, 0);
	return patches;
}


function _VirtualDom_pushPatch(patches, type, index, data)
{
	var patch = {
		$: type,
		__index: index,
		__data: data,
		__domNode: undefined,
		__eventNode: undefined
	};
	patches.push(patch);
	return patch;
}


function _VirtualDom_diffHelp(x, y, patches, index)
{
	if (x === y)
	{
		return;
	}

	var xType = x.$;
	var yType = y.$;

	// Bail if you run into different types of nodes. Implies that the
	// structure has changed significantly and it's not worth a diff.
	if (xType !== yType)
	{
		if (xType === __2_NODE && yType === __2_KEYED_NODE)
		{
			y = _VirtualDom_dekey(y);
			yType = __2_NODE;
		}
		else
		{
			_VirtualDom_pushPatch(patches, __3_REDRAW, index, y);
			return;
		}
	}

	// Now we know that both nodes are the same $.
	switch (yType)
	{
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
				return;
			}
			y.__node = y.__thunk();
			var subPatches = [];
			_VirtualDom_diffHelp(x.__node, y.__node, subPatches, 0);
			subPatches.length > 0 && _VirtualDom_pushPatch(patches, __3_THUNK, index, subPatches);
			return;

		case __2_TAGGER:
			// gather nested taggers
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

			// Just bail if different numbers of taggers. This implies the
			// structure of the virtual DOM has changed.
			if (nesting && xTaggers.length !== yTaggers.length)
			{
				_VirtualDom_pushPatch(patches, __3_REDRAW, index, y);
				return;
			}

			// check if taggers are "the same"
			if (nesting ? !_VirtualDom_pairwiseRefEqual(xTaggers, yTaggers) : xTaggers !== yTaggers)
			{
				_VirtualDom_pushPatch(patches, __3_TAGGER, index, yTaggers);
			}

			// diff everything below the taggers
			_VirtualDom_diffHelp(xSubNode, ySubNode, patches, index + 1);
			return;

		case __2_TEXT:
			if (x.__text !== y.__text)
			{
				_VirtualDom_pushPatch(patches, __3_TEXT, index, y.__text);
			}
			return;

		case __2_NODE:
			_VirtualDom_diffNodes(x, y, patches, index, _VirtualDom_diffKids);
			return;

		case __2_KEYED_NODE:
			_VirtualDom_diffNodes(x, y, patches, index, _VirtualDom_diffKeyedKids);
			return;

		case __2_CUSTOM:
			if (x.__render !== y.__render)
			{
				_VirtualDom_pushPatch(patches, __3_REDRAW, index, y);
				return;
			}

			var factsDiff = _VirtualDom_diffFacts(x.__facts, y.__facts);
			factsDiff && _VirtualDom_pushPatch(patches, __3_FACTS, index, factsDiff);

			var patch = y.__diff(x.__model, y.__model);
			patch && _VirtualDom_pushPatch(patches, __3_CUSTOM, index, patch);

			return;
	}
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

function _VirtualDom_diffNodes(x, y, patches, index, diffKids)
{
	// Bail if obvious indicators have changed. Implies more serious
	// structural changes such that it's not worth it to diff.
	if (x.__tag !== y.__tag || x.__namespace !== y.__namespace)
	{
		_VirtualDom_pushPatch(patches, __3_REDRAW, index, y);
		return;
	}

	var factsDiff = _VirtualDom_diffFacts(x.__facts, y.__facts);
	factsDiff && _VirtualDom_pushPatch(patches, __3_FACTS, index, factsDiff);

	diffKids(x, y, patches, index);
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
			|| category === 'a__1_EVENT' && _VirtualDom_equalEvents(xValue, yValue))
		{
			continue;
		}

		diff = diff || {};
		diff[xKey] = yValue;
	}

	// add new stuff
	for (var yKey in y)
	{
		if (!(yKey in x))
		{
			diff = diff || {};
			diff[yKey] = y[yKey];
		}
	}

	return diff;
}



// ============================================================================
// DIFF KIDS
//
// Pairwise diff of non-keyed children. Handles length mismatches by
// emitting REMOVE_LAST or APPEND patches.
// ============================================================================


function _VirtualDom_diffKids(xParent, yParent, patches, index)
{
	var xKids = xParent.__kids;
	var yKids = yParent.__kids;

	var xLen = xKids.length;
	var yLen = yKids.length;

	// FIGURE OUT IF THERE ARE INSERTS OR REMOVALS

	if (xLen > yLen)
	{
		_VirtualDom_pushPatch(patches, __3_REMOVE_LAST, index, {
			__length: yLen,
			__diff: xLen - yLen
		});
	}
	else if (xLen < yLen)
	{
		_VirtualDom_pushPatch(patches, __3_APPEND, index, {
			__length: xLen,
			__kids: yKids
		});
	}

	// PAIRWISE DIFF EVERYTHING ELSE

	for (var minLen = xLen < yLen ? xLen : yLen, i = 0; i < minLen; i++)
	{
		var xKid = xKids[i];
		_VirtualDom_diffHelp(xKid, yKids[i], patches, ++index);
		index += xKid.__descendantsCount || 0;
	}
}



// ============================================================================
// KEYED DIFF
//
// Diff keyed children using a look-ahead strategy. Tracks insertions,
// removals, and moves via a changes dictionary keyed by the child's
// string key. Falls back to brute-force insert/remove when keys
// don't match.
// ============================================================================


function _VirtualDom_diffKeyedKids(xParent, yParent, patches, rootIndex)
{
	var localPatches = [];

	var changes = {}; // Dict String Entry
	var inserts = []; // Array { index : Int, entry : Entry }
	// type Entry = { tag : String, vnode : VNode, index : Int, data : _ }

	var xKids = xParent.__kids;
	var yKids = yParent.__kids;
	var xLen = xKids.length;
	var yLen = yKids.length;
	var xIndex = 0;
	var yIndex = 0;

	var index = rootIndex;

	while (xIndex < xLen && yIndex < yLen)
	{
		var x = xKids[xIndex];
		var y = yKids[yIndex];

		var xKey = x.a;
		var yKey = y.a;
		var xNode = x.b;
		var yNode = y.b;

		var newMatch = undefined;
		var oldMatch = undefined;

		// check if keys match

		if (xKey === yKey)
		{
			index++;
			_VirtualDom_diffHelp(xNode, yNode, localPatches, index);
			index += xNode.__descendantsCount || 0;

			xIndex++;
			yIndex++;
			continue;
		}

		// look ahead 1 to detect insertions and removals.

		var xNext = xKids[xIndex + 1];
		var yNext = yKids[yIndex + 1];

		if (xNext)
		{
			var xNextKey = xNext.a;
			var xNextNode = xNext.b;
			oldMatch = yKey === xNextKey;
		}

		if (yNext)
		{
			var yNextKey = yNext.a;
			var yNextNode = yNext.b;
			newMatch = xKey === yNextKey;
		}


		// swap x and y
		if (newMatch && oldMatch)
		{
			index++;
			_VirtualDom_diffHelp(xNode, yNextNode, localPatches, index);
			_VirtualDom_insertNode(changes, localPatches, xKey, yNode, yIndex, inserts);
			index += xNode.__descendantsCount || 0;

			index++;
			_VirtualDom_removeNode(changes, localPatches, xKey, xNextNode, index);
			index += xNextNode.__descendantsCount || 0;

			xIndex += 2;
			yIndex += 2;
			continue;
		}

		// insert y
		if (newMatch)
		{
			index++;
			_VirtualDom_insertNode(changes, localPatches, yKey, yNode, yIndex, inserts);
			_VirtualDom_diffHelp(xNode, yNextNode, localPatches, index);
			index += xNode.__descendantsCount || 0;

			xIndex += 1;
			yIndex += 2;
			continue;
		}

		// remove x
		if (oldMatch)
		{
			index++;
			_VirtualDom_removeNode(changes, localPatches, xKey, xNode, index);
			index += xNode.__descendantsCount || 0;

			index++;
			_VirtualDom_diffHelp(xNextNode, yNode, localPatches, index);
			index += xNextNode.__descendantsCount || 0;

			xIndex += 2;
			yIndex += 1;
			continue;
		}

		// remove x, insert y
		if (xNext && xNextKey === yNextKey)
		{
			index++;
			_VirtualDom_removeNode(changes, localPatches, xKey, xNode, index);
			_VirtualDom_insertNode(changes, localPatches, yKey, yNode, yIndex, inserts);
			index += xNode.__descendantsCount || 0;

			index++;
			_VirtualDom_diffHelp(xNextNode, yNextNode, localPatches, index);
			index += xNextNode.__descendantsCount || 0;

			xIndex += 2;
			yIndex += 2;
			continue;
		}

		break;
	}

	// eat up any remaining nodes with removeNode and insertNode

	while (xIndex < xLen)
	{
		index++;
		var x = xKids[xIndex];
		var xNode = x.b;
		_VirtualDom_removeNode(changes, localPatches, x.a, xNode, index);
		index += xNode.__descendantsCount || 0;
		xIndex++;
	}

	while (yIndex < yLen)
	{
		var endInserts = endInserts || [];
		var y = yKids[yIndex];
		_VirtualDom_insertNode(changes, localPatches, y.a, y.b, undefined, endInserts);
		yIndex++;
	}

	if (localPatches.length > 0 || inserts.length > 0 || endInserts)
	{
		_VirtualDom_pushPatch(patches, __3_REORDER, rootIndex, {
			__patches: localPatches,
			__inserts: inserts,
			__endInserts: endInserts
		});
	}
}



// ============================================================================
// CHANGES FROM KEYED DIFF
//
// Track insertions, removals, and moves of keyed children. When a removed
// key is later inserted (or vice versa), the entry is promoted to a MOVE
// and the sub-patches are recorded.
// ============================================================================


var _VirtualDom_POSTFIX = '_elmW6BL';


function _VirtualDom_insertNode(changes, localPatches, key, vnode, yIndex, inserts)
{
	var entry = changes[key];

	// never seen this key before
	if (!entry)
	{
		entry = {
			__tag: __5_INSERT,
			__vnode: vnode,
			__index: yIndex,
			__data: undefined
		};

		inserts.push({ __index: yIndex, __entry: entry });
		changes[key] = entry;

		return;
	}

	// this key was removed earlier, a match!
	if (entry.__tag === __5_REMOVE)
	{
		inserts.push({ __index: yIndex, __entry: entry });

		entry.__tag = __5_MOVE;
		var subPatches = [];
		_VirtualDom_diffHelp(entry.__vnode, vnode, subPatches, entry.__index);
		entry.__index = yIndex;
		entry.__data.__data = {
			__patches: subPatches,
			__entry: entry
		};

		return;
	}

	// this key has already been inserted or moved, a duplicate!
	_VirtualDom_insertNode(changes, localPatches, key + _VirtualDom_POSTFIX, vnode, yIndex, inserts);
}


function _VirtualDom_removeNode(changes, localPatches, key, vnode, index)
{
	var entry = changes[key];

	// never seen this key before
	if (!entry)
	{
		var patch = _VirtualDom_pushPatch(localPatches, __3_REMOVE, index, undefined);

		changes[key] = {
			__tag: __5_REMOVE,
			__vnode: vnode,
			__index: index,
			__data: patch
		};

		return;
	}

	// this key was inserted earlier, a match!
	if (entry.__tag === __5_INSERT)
	{
		entry.__tag = __5_MOVE;
		var subPatches = [];
		_VirtualDom_diffHelp(vnode, entry.__vnode, subPatches, index);

		_VirtualDom_pushPatch(localPatches, __3_REMOVE, index, {
			__patches: subPatches,
			__entry: entry
		});

		return;
	}

	// this key has already been removed or moved, a duplicate!
	_VirtualDom_removeNode(changes, localPatches, key + _VirtualDom_POSTFIX, vnode, index);
}



// ============================================================================
// ADD DOM NODES
//
// Each DOM node has an "index" assigned in order of traversal. It is important
// to minimize our crawl over the actual DOM, so these indexes (along with the
// descendantsCount of virtual nodes) let us skip touching entire subtrees of
// the DOM if we know there are no patches there.
// ============================================================================


function _VirtualDom_addDomNodes(domNode, vNode, patches, eventNode)
{
	_VirtualDom_addDomNodesHelp(domNode, vNode, patches, 0, 0, vNode.__descendantsCount, eventNode);
}


// assumes `patches` is non-empty and indexes increase monotonically.
function _VirtualDom_addDomNodesHelp(domNode, vNode, patches, i, low, high, eventNode)
{
	var patch = patches[i];
	var index = patch.__index;

	while (index === low)
	{
		var patchType = patch.$;

		if (patchType === __3_THUNK)
		{
			_VirtualDom_addDomNodes(domNode, vNode.__node, patch.__data, eventNode);
		}
		else if (patchType === __3_REORDER)
		{
			patch.__domNode = domNode;
			patch.__eventNode = eventNode;

			var subPatches = patch.__data.__patches;
			if (subPatches.length > 0)
			{
				_VirtualDom_addDomNodesHelp(domNode, vNode, subPatches, 0, low, high, eventNode);
			}
		}
		else if (patchType === __3_REMOVE)
		{
			patch.__domNode = domNode;
			patch.__eventNode = eventNode;

			var data = patch.__data;
			if (data)
			{
				data.__entry.__data = domNode;
				var subPatches = data.__patches;
				if (subPatches.length > 0)
				{
					_VirtualDom_addDomNodesHelp(domNode, vNode, subPatches, 0, low, high, eventNode);
				}
			}
		}
		else
		{
			patch.__domNode = domNode;
			patch.__eventNode = eventNode;
		}

		i++;

		if (!(patch = patches[i]) || (index = patch.__index) > high)
		{
			return i;
		}
	}

	var tag = vNode.$;

	if (tag === __2_TAGGER)
	{
		var subNode = vNode.__node;

		while (subNode.$ === __2_TAGGER)
		{
			subNode = subNode.__node;
		}

		return _VirtualDom_addDomNodesHelp(domNode, subNode, patches, i, low + 1, high, domNode.elm_event_node_ref);
	}

	// tag must be __2_NODE or __2_KEYED_NODE at this point

	var vKids = vNode.__kids;
	var childNodes = domNode.childNodes;
	for (var j = 0; j < vKids.length; j++)
	{
		low++;
		var vKid = tag === __2_NODE ? vKids[j] : vKids[j].b;
		var nextLow = low + (vKid.__descendantsCount || 0);
		if (low <= index && index <= nextLow)
		{
			i = _VirtualDom_addDomNodesHelp(childNodes[j], vKid, patches, i, low, nextLow, eventNode);
			if (!(patch = patches[i]) || (index = patch.__index) > high)
			{
				return i;
			}
		}
		low = nextLow;
	}
	return i;
}



// ============================================================================
// APPLY PATCHES
//
// Walk the patch list, locate each target DOM node, and apply the
// corresponding transformation (redraw, update facts, replace text, etc.).
// ============================================================================


function _VirtualDom_applyPatches(rootDomNode, oldVirtualNode, patches, eventNode)
{
	if (patches.length === 0)
	{
		return rootDomNode;
	}

	_VirtualDom_addDomNodes(rootDomNode, oldVirtualNode, patches, eventNode);
	return _VirtualDom_applyPatchesHelp(rootDomNode, patches);
}

function _VirtualDom_applyPatchesHelp(rootDomNode, patches)
{
	for (var i = 0; i < patches.length; i++)
	{
		var patch = patches[i];
		var localDomNode = patch.__domNode
		var newNode = _VirtualDom_applyPatch(localDomNode, patch);
		if (localDomNode === rootDomNode)
		{
			rootDomNode = newNode;
		}
	}
	return rootDomNode;
}

function _VirtualDom_applyPatch(domNode, patch)
{
	switch (patch.$)
	{
		case __3_REDRAW:
			return _VirtualDom_applyPatchRedraw(domNode, patch.__data, patch.__eventNode);

		case __3_FACTS:
			_VirtualDom_applyFacts(domNode, patch.__eventNode, patch.__data);
			return domNode;

		case __3_TEXT:
			domNode.replaceData(0, domNode.length, patch.__data);
			return domNode;

		case __3_THUNK:
			return _VirtualDom_applyPatchesHelp(domNode, patch.__data);

		case __3_TAGGER:
			if (domNode.elm_event_node_ref)
			{
				domNode.elm_event_node_ref.__tagger = patch.__data;
			}
			else
			{
				domNode.elm_event_node_ref = { __tagger: patch.__data, __parent: patch.__eventNode };
			}
			return domNode;

		case __3_REMOVE_LAST:
			var data = patch.__data;
			for (var i = 0; i < data.__diff; i++)
			{
				domNode.removeChild(domNode.childNodes[data.__length]);
			}
			return domNode;

		case __3_APPEND:
			var data = patch.__data;
			var kids = data.__kids;
			var i = data.__length;
			var theEnd = domNode.childNodes[i];
			for (; i < kids.length; i++)
			{
				domNode.insertBefore(_VirtualDom_render(kids[i], patch.__eventNode), theEnd);
			}
			return domNode;

		case __3_REMOVE:
			var data = patch.__data;
			if (!data)
			{
				domNode.parentNode.removeChild(domNode);
				return domNode;
			}
			var entry = data.__entry;
			if (typeof entry.__index !== 'undefined')
			{
				domNode.parentNode.removeChild(domNode);
			}
			entry.__data = _VirtualDom_applyPatchesHelp(domNode, data.__patches);
			return domNode;

		case __3_REORDER:
			return _VirtualDom_applyPatchReorder(domNode, patch);

		case __3_CUSTOM:
			return patch.__data(domNode);

		default:
			throw new Error('Ran into an unknown patch!');
	}
}


function _VirtualDom_applyPatchRedraw(domNode, vNode, eventNode)
{
	var parentNode = domNode.parentNode;
	var newNode = _VirtualDom_render(vNode, eventNode);

	if (!newNode.elm_event_node_ref)
	{
		newNode.elm_event_node_ref = domNode.elm_event_node_ref;
	}

	if (parentNode && newNode !== domNode)
	{
		parentNode.replaceChild(newNode, domNode);
	}
	return newNode;
}


function _VirtualDom_applyPatchReorder(domNode, patch)
{
	var data = patch.__data;

	// remove end inserts
	var frag = _VirtualDom_applyPatchReorderEndInsertsHelp(data.__endInserts, patch);

	// removals
	domNode = _VirtualDom_applyPatchesHelp(domNode, data.__patches);

	// inserts
	var inserts = data.__inserts;
	for (var i = 0; i < inserts.length; i++)
	{
		var insert = inserts[i];
		var entry = insert.__entry;
		var node = entry.__tag === __5_MOVE
			? entry.__data
			: _VirtualDom_render(entry.__vnode, patch.__eventNode);
		domNode.insertBefore(node, domNode.childNodes[insert.__index]);
	}

	// add end inserts
	if (frag)
	{
		_VirtualDom_appendChild(domNode, frag);
	}

	return domNode;
}


function _VirtualDom_applyPatchReorderEndInsertsHelp(endInserts, patch)
{
	if (!endInserts)
	{
		return;
	}

	var frag = _VirtualDom_doc.createDocumentFragment();
	for (var i = 0; i < endInserts.length; i++)
	{
		var insert = endInserts[i];
		var entry = insert.__entry;
		_VirtualDom_appendChild(frag, entry.__tag === __5_MOVE
			? entry.__data
			: _VirtualDom_render(entry.__vnode, patch.__eventNode)
		);
	}
	return frag;
}



// ============================================================================
// VIRTUALIZE
//
// Convert a real DOM node tree back into virtual DOM nodes. Used by the
// debugger to capture the current state of the DOM.
// ============================================================================


function _VirtualDom_virtualize(node)
{
	// TEXT NODES

	if (node.nodeType === 3)
	{
		return text(node.textContent);
	}


	// WEIRD NODES

	if (node.nodeType !== 1)
	{
		return text('');
	}


	// ELEMENT NODES

	var attrList = _List_Nil;
	var attrs = node.attributes;
	for (var i = attrs.length; i--; )
	{
		var attr = attrs[i];
		var name = attr.name;
		var value = attr.value;
		attrList = _List_Cons( A2(attribute, name, value), attrList );
	}

	var tag = node.tagName.toLowerCase();
	var kidList = _List_Nil;
	var kids = node.childNodes;

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
		__namespace: keyedNode.__namespace,
		__descendantsCount: keyedNode.__descendantsCount
	};
}
