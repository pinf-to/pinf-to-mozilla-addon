
"use strict";

const { Cc: CC, Cu:CU, Ci:CI } = require("chrome");
const GDEVTOOLS = CU.import("resource:///modules/devtools/gDevTools.jsm", {}).gDevTools;
const DATA = require("sdk/self").data;
const SANDBOX = require("pinf-for-mozilla-addon-sdk").sandbox;
const FBTRACE = require("./fbtrace");


const DEBUG = true;

if (DEBUG) dump("[pinf-hoist] load\n");


function main(options, callbacks) {

if (DEBUG) dump("[pinf-hoist] main() start\n");

  var API = {
    CC: CC,
    CU: CU,
    CI: CI,
    Q: require("./q"),
    GDEVTOOLS: GDEVTOOLS,
    SELF: require("sdk/self"),
    TIMERS: require("sdk/timers"),
    CLASS: require("sdk/core/heritage").Class,
    DEV_PANEL: require("dev/panel.js").Panel,
    DEV_TOOL: require("dev/toolbox").Tool,
    PANEL: require("sdk/panel"),
    PAGE_WORKER: require("sdk/page-worker"),
    REQUEST: require("sdk/request").Request,
    ADDON_INSTALLER: require("sdk/addon/installer"),
    TABS: require("sdk/tabs"),
    SYSTEM: require("sdk/system"),
    SIMPLE_PREFS: require("sdk/simple-prefs"),
    PREFERENCES_SERVICE: require("sdk/preferences/service")
  };

  API.console = FBTRACE.console;
  API.insight = FBTRACE.insight;

  API.getBootOptions = function () {
    return options;
  }

  API.inDevMode = function () {
    return !!API.SIMPLE_PREFS.prefs.dev;
  }



  function monitorComponentServer (config) {

    var pageWorker = API.PAGE_WORKER.Page({
      contentScriptFile: "./bundle-server-monitor.js",
      contentScriptOptions: {
        "rootVortexUrl": config.rootVortexUrl
      }
    });

  /*
    pageWorker.port.on("message", function (msg) {
  API.console.log("monitor worker LOADED: " + msg);
    });
  */

    pageWorker.port.on("opened", function () {
      API.insight.debug("Component Server - opened");
    });

    pageWorker.port.on("closed", function () {
      API.insight.debug("Component Server - closed");
    });

    pageWorker.port.on("reopened", function () {
      API.insight.debug("Component Server - reopened");

      function reloadExtension () {
        var addonId = API.SELF.id;

        return API.ADDON_INSTALLER.disable(addonId).then(function () {

            API.CC["@mozilla.org/observer-service;1"].
                getService(API.CI.nsIObserverService).
                notifyObservers({}, "startupcache-invalidate", null);

            return API.ADDON_INSTALLER.enable(addonId);
        });        
      }

      reloadExtension();
    });
  }


  function loadComponents () {

    // TODO: Intercept error and log/fail init.
    API.REQUEST({
      url: require.resolve("../program.json"),
      onComplete: function (response) {

        var config = response.json.config || {};
        FBTRACE.console.log("[pinf-hoist] config", config);

        var uri = config.rootVortexUrl || DATA.url("bundles/components/vortex.js");

        FBTRACE.console.log("[pinf-hoist] uri: " + uri, uri);

      // TODO: Move this into 'org.pinf.to/lib/vortex-wrapper.js'

        SANDBOX(uri, {
          debug: API.inDevMode(),
          global: {
            // Not available in this context.
            Components: undefined,
            console: FBTRACE.console,
            insight: FBTRACE.insight
          },
          onInitModule: function(moduleInterface, moduleObj, pkg, sandbox, options) {
            var origRequire = moduleObj.require;
            moduleObj.require = function(identifier) {
              if (
                identifier === "chrome" ||
                /^sdk/.test(identifier)
              ) {
                // Return SDK module that is not bundled.
                return require(identifier);
              }
              return origRequire(identifier);
            }
            for (var property in origRequire) {
              moduleObj.require[property] = origRequire[property];
            }
            // @see http://nodejs.org/docs/latest/api/globals.html
            moduleObj.require.resolve = function(uri) {
              return require.resolve(uri);
            }
            moduleObj.require.async = function(id, successCallback, errorCallback) {
              throw new Error("NYI");
            }
          }
        }, function(sandbox) {
          if (DEBUG) dump("[pinf-hoist] init sandbox\n");

          monitorComponentServer(config);

          if (DEBUG) FBTRACE.console.log("[pinf-hoist] call main using API", API);

          var api = (sandbox.for || sandbox.main)(API);

          // Follow the standard PINF.Genesis module interface init sequence.
          // TODO: Put this into a seperate module/repo to define interface and provide tooling.
          /*
            exports.resolve = function (resolver, config, previousResolvedConfig) {
              return resolver({}).then(function (resolvedConfig) {
                return resolvedConfig;
              });
            }
            exports.turn = function (resolvedConfig) {
            }
            exports.spin = function (resolvedConfig) {
            }
          */
          // NOTE: We ALWAYS resolve the config on every turn.
          //       Each module should cache its responses on subsequent
          //       calls if nothing has changed in the input!
          var defaultResolve = function (resolver, config, previousResolvedConfig) {
            return resolver({});
          }
          var resolver = function (resolverApi) {

            function resolve (api) {
              // TODO: Resolve config as in 'org.pinf.lib/lib/program.js'
              var resolvedConfig = config;
              return API.Q.resolve(resolvedConfig);
            }

            return resolve(resolverApi).fail(function (err) {
              err.message += " (while resolving parsed config using resolverApi)";
              err.stack += "\n(while resolving parsed config using resolverApi)";
              throw err;
            });
          }

          // TODO: Populate `previousResolvedSectionConfig`
          var previousResolvedSectionConfig = {};

          return API.Q.when((api.resolve && api.resolve(resolver, config, previousResolvedSectionConfig)) || defaultResolve(resolver, config, previousResolvedSectionConfig)).then(function (resolvedSectionConfig) {

            API.insight.debug("resolvedSectionConfig", resolvedSectionConfig);

            var changed = true;

            resolvedSectionConfig.$context = "todo";

            return API.Q.when(api.turn(resolvedSectionConfig)).then(function () {

              return API.Q.when(api.spin(resolvedSectionConfig)).then(function () {

              });

            }).fail(function (err) {

              API.insight.error("Fail turn/spin", err.stack);

            });
          });

          if (DEBUG) dump("[pinf-hoist] sandbox inited\n");
        });
      }
    }).get();
  }

  loadComponents();
}

function onUnload(reason) {

  if (DEBUG) dump("[pinf-hoist] unload\n");

}


exports.main = main;
exports.onUnload = onUnload;


if (DEBUG) dump("[pinf-hoist] loaded\n");

