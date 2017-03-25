/**
 * Generates Code for Props
 * @param {Object} vnode
 * @return {String} generated code
 */
var generateProps = function(vnode) {
	var attrs = vnode.props.attrs;
	var generatedObject = "{attrs: {";

	if(attrs) {
		for(var attr in attrs) {
			// Get attr by it's actual name (in case it had any arguments)
			var attrName = attrs[attr].name;

			// If it is a directive, mark it as dynamic
			if(directives[attrName]) {
				vnode.dynamic = true;
			}
			if(specialDirectives[attrName]) {
				// Special directive found that generates code after initial generation, push it to its known special directives to run afterGenerate later
				if(specialDirectives[attrName].afterGenerate) {
					if(!vnode.specialDirectivesAfter) {
						vnode.specialDirectivesAfter = {};
					}
					vnode.specialDirectivesAfter[attr] = attrs[attr];
				}

				// Invoke any special directives that need to change values before code generation
				if(specialDirectives[attrName].beforeGenerate) {
					specialDirectives[attrName].beforeGenerate(attrs[attr].value, attrs[attr].meta, vnode);
				}

				// Invoke any special directives that need to change values of props during code generation
				if(specialDirectives[attrName].duringPropGenerate) {
					generatedObject += specialDirectives[attrName].duringPropGenerate(attrs[attr].value, attrs[attr].meta, vnode);
				}

				// Keep a flag to know to always rerender this
				vnode.dynamic = true;

				// Remove special directive
				delete attrs[attr];
			} else {
				var normalizedProp = JSON.stringify(attrs[attr].value);
				var compiledProp = compileTemplate(normalizedProp, true);
				if(normalizedProp !== compiledProp) {
					vnode.dynamic = true;
				}
				generatedObject += `"${attr}": ${compiledProp}, `;
			}
		}

		if(Object.keys(attrs).length) {
			generatedObject = generatedObject.slice(0, -2) + "}";
		} else {
			generatedObject += "}";
		}
	}

	var dom = vnode.props.dom;
	if(dom) {
		vnode.dynamic = true;
		generatedObject += ", dom: {";
		for(var domProp in dom) {
			generatedObject += `"${domProp}": ${dom[domProp]}, `;
		}
		generatedObject = generatedObject.slice(0, -2) + "}";
	}

	// Close the generated object
	generatedObject += "}";
  return generatedObject;
}

/**
 * Generates Code for Event Listeners
 * @param {Object} listeners
 * @return {String} generated code
 */
var generateEventListeners = function(listeners) {
	if(Object.keys(listeners).length === 0) {
		return "{}";
	}
	var generatedObject = "{";

	for(var type in listeners) {
		generatedObject += `"${type}": [${generateArray(listeners[type])}], `;
	}

	generatedObject = generatedObject.slice(0, -2) + "}";

  return generatedObject;
}

/**
 * Generates Code for Metadata
 * @param {Object} meta
 * @return {String} generated code
 */
var generateMeta = function(meta) {
	var generatedObject = "{";

	for(var key in meta) {
		if(key === 'eventListeners') {
			generatedObject += `"${key}": ${generateEventListeners(meta[key])}, `;
		} else {
			generatedObject += `"${key}": ${meta[key]}, `;
		}
	}

	generatedObject = generatedObject.slice(0, -2) + "}";

  return generatedObject;
}

/**
 * Generates Code for an Array
 * @param {Array} arr
 * @return {String} generated array
 */
var generateArray = function(arr) {
	var generatedArray = "";

	for(var i = 0; i < arr.length; i++) {
		generatedArray += `${arr[i]}, `;
	}

	generatedArray = generatedArray.slice(0, -2);

  return generatedArray;
}

/**
 * Creates an "h" Call for a VNode
 * @param {Object} vnode
 * @param {Array} children
 * @return {String} "h" call
 */
var createCall = function(vnode) {
	var call = `h("${vnode.type}", `;
	call += generateProps(vnode) + ", ";
	// Generate code for children recursively here (in case modified by special directives)
	var children = vnode.children.map(generateEl);
	// Detected static vnode, tell diffing engine to skip it
	if(vnode.children.length === 1 && children.length === 1 && typeof vnode.children[0] === "string" && "\"" + vnode.children[0] + "\"" === children[0] && !vnode.dynamic) {
		vnode.meta.shouldRender = "instance.$initialRender";
	}

	call += generateMeta(vnode.meta);
	call += children.length ? ", " + generateArray(children) : "";
	call += ")";
  return call;
}

var generateEl = function(el) {
	var code = "";

	if(typeof el === "string") {
		// Escape newlines and double quotes, and compile the string
		code += `"${compileTemplate(escapeString(el), true)}"`;
	} else {
		// Recursively generate code for children
		if(!el.meta) {
			el.meta = defaultMetadata();
			if(el.isSVG) {
				el.meta.isSVG = true;
			}
		}
		el.props = {
			attrs: el.props
		}
		var slotNameAttr = el.props.attrs.name;
		var compiledCode = el.type === "slot" ? `instance.$slots['${(slotNameAttr && slotNameAttr.value) || ("default")}']` : createCall(el);
		if(el.specialDirectivesAfter) {
			// There are special directives that need to change the value after code generation, so
			// run them now
			for(var specialDirectiveAfter in el.specialDirectivesAfter) {
				compiledCode = specialDirectives[specialDirectiveAfter.name].afterGenerate(el.specialDirectivesAfter[specialDirectiveAfter].value, el.specialDirectivesAfter[specialDirectiveAfter].meta, compiledCode, el);
			}
		}
		code += compiledCode;
	}
  return code;
}

var generate = function(ast) {
	// Get root element
	var root = ast.children[0];
	// Begin Code
  var code = "var instance = this; return " + generateEl(root);

  try {
    return new Function("h", code);
  } catch(e) {
    error("Could not create render function");
    return noop;
  }
}
