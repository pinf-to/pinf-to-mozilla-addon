
const { Cc: CC, Cu:CU, Ci:CI } = require("chrome");

const DEBUG = false;

var Trace = require("firebug.sdk/lib/core/trace").FBTrace.to("DBG_PGS/HOIST");


function normalizeLogArguments (label, obj) {
    if (typeof obj === "undefined") {
        obj = label;
        label = ("" + obj);
    }
    return {
        label: label,
        obj: obj
    };
}

function log (label, obj) {
    var args = normalizeLogArguments(label, obj);
    Trace.sysout(args.label, args.obj);
}


var Console = function (context) {
    var self = this;

    self._context = context;

    self._prefixLabel = function (label) {
        if (self._context.name) {
            label = "[" + self._context.name + "] " + label;
        }
        return label;
    }
}
Console.prototype.for = function (context) {
    return (new Console(context));
}
Console.prototype.log = function () {
if (DEBUG) dump("[pinf-hoist] console.log\n");
    return log(this._prefixLabel("" + arguments[0]), Array.prototype.slice.call(arguments));
}
Console.prototype.verbose = function (label, obj) {
if (DEBUG) dump("[pinf-hoist] console.verbose\n");
    return log(this._prefixLabel("" + arguments[0]), Array.prototype.slice.call(arguments));
}
Console.prototype.debug = function (label, obj) {
if (DEBUG) dump("[pinf-hoist] console.debug\n");
    return log(this._prefixLabel("DEBUG: " + arguments[0]), Array.prototype.slice.call(arguments));
}
Console.prototype.error = function (label, obj) {
if (DEBUG) dump("[pinf-hoist] console.error\n");
    return log(this._prefixLabel("ERROR: " + arguments[0]), Array.prototype.slice.call(arguments));
}


var Insight = function (context) {
    var self = this;

    self._context = context;

    self._prefixLabel = function (label) {
        if (self._context.name) {
            label = "[" + self._context.name + "] " + label;
        }
        return label;
    }
}
Insight.prototype.for = function (context) {
    return (new Insight(context));
}
Insight.prototype.log = function (label, obj) {
if (DEBUG) dump("[pinf-hoist] insight.log\n");
    var args = normalizeLogArguments(label, obj);
    return log(this._prefixLabel(args.label), args.obj);
}
Insight.prototype.verbose = function (label, obj) {
if (DEBUG) dump("[pinf-hoist] insight.verbose\n");
    var args = normalizeLogArguments(label, obj);
    return log(this._prefixLabel(args.label), args.obj);
}
Insight.prototype.debug = function (label, obj) {
if (DEBUG) dump("[pinf-hoist] insight.debug\n");
    var args = normalizeLogArguments(label, obj);
    return log(this._prefixLabel("DEBUG: " + args.label), args.obj);
}
Insight.prototype.error = function (label, obj) {
if (DEBUG) dump("[pinf-hoist] insight.error\n");
    var args = normalizeLogArguments(label, obj);
    return log(this._prefixLabel("ERROR: " + args.label), args.obj);
}


//exports.FBTrace = FBTrace;

exports.Console = Console;
exports.console = new Console({
    name: "pinf-program"
});

exports.Insight = Insight;
exports.insight = new Insight({
    name: "pinf-program"
});

