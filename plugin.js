
exports.for = function (API) {

	var exports = {};

	exports.resolve = function (resolver, config, previousResolvedConfig) {

		return resolver({}).then(function (resolvedConfig) {

			resolvedConfig.path = API.getTargetPath();


//console.log("resolvedConfig.path", resolvedConfig.path);


			return resolvedConfig;
		});
	}

	exports.turn = function (resolvedConfig) {

//console.log("turn for firefox extension", resolvedConfig);

		var programDescriptorPath = API.getRootPath();
		var programDescriptor = API.programDescriptor;

		var sourcePath = API.PATH.dirname(programDescriptorPath);

		var pubPath = API.getTargetPath();

		var templatePath = API.PATH.join(__dirname, "template");
		var templateDescriptorPath = API.PATH.join(templatePath, "package.json");
		var templateDescriptor = API.FS.readJsonSync(templateDescriptorPath);

		API.ASSERT.equal(typeof templateDescriptor.directories.deploy, "string", "'directories.deploy' must be set in '" + templateDescriptorPath + "'");

		var relativeBaseUri = "";

		function getBootPackageDescriptor () {
			return programDescriptor.getBootPackageDescriptor().then(function (packageDescriptor) {
				return packageDescriptor._data;
			}).fail(function (err) {
				return {};
			});			
		}

		return getBootPackageDescriptor().then(function (packageDescriptor) {

			return API.Q.denodeify(function (callback) {

				function copy (fromPath, toPath, callback) {

					API.console.debug("Copying and transforming fileset", fromPath, "to", toPath, "...");

					var domain = require('domain').create();
					domain.on('error', function(err) {
						// The error won't crash the process, but what it does is worse!
						// Though we've prevented abrupt process restarting, we are leaking
						// resources like crazy if this ever happens.
						// This is no better than process.on('uncaughtException')!
						console.error("UNHANDLED DOMAIN ERROR:", err.stack, new Error().stack);
						process.exit(1);
					});
					domain.run(function() {

						try {

							var isDirectory = API.FS.statSync(fromPath).isDirectory();

							var destinationStream = null;

							if (isDirectory) {
								destinationStream = API.GULP.dest(toPath);
							} else {
								destinationStream = API.GULP.dest(API.PATH.dirname(toPath));
							}

							destinationStream.once("error", function (err) {
								return callback(err);
							});

							destinationStream.once("end", function () {

								API.console.debug("... done");

								return callback();
							});

							var filter = API.GULP_FILTER([
								'index.html',
								'**/index.html'
							]);

							// TODO: Respect gitignore by making pinf walker into gulp plugin. Use pinf-package-insight to load ignore rules.
							var stream = null;
							if (isDirectory) {
								stream = API.GULP.src([
									"**",
									"!.pub/",
									"!.pub/**",
									"!npm-debug.log",
									"!node_modules/",
									"!node_modules/**"
								], {
									cwd: fromPath
								});
							} else {
								stream = API.GULP.src([
									API.PATH.basename(fromPath)
								], {
									cwd: API.PATH.dirname(fromPath)
								});											
							}

							stream
								.pipe(API.GULP_PLUMBER())
								.pipe(API.GULP_DEBUG({
									title: '[pinf-to-mozilla-addon]',
									minimal: true
								}))
//								.pipe(filter)
								// TODO: Add generic variables here and move to `to.pinf.lib`.
								.pipe(API.GULP_REPLACE(/%%[^%]+%%/g, function (matched) {

									if (matched === "%%ID%%") {
										return resolvedConfig.id;
									} else
									if (matched === "%%NAME%%") {
										return resolvedConfig.name;
									}

/*									
									// TODO: Arrive at minimal set of core variables and options to add own.
									if (matched === "%boot.loader.uri%") {
										return (relativeBaseUri?relativeBaseUri+"/":"") + "bundles/loader.js";
									} else
									if (matched === "%boot.bundle.uri%") {
										return (relativeBaseUri?relativeBaseUri+"/":"") + ("bundles/" + packageDescriptor.main).replace(/\/\.\//, "/");
									}
*/
									return matched;
								}))
//								.pipe(filter.restore())											
								.pipe(destinationStream);

							return stream.once("error", function (err) {
								err.message += " (while running gulp)";
								err.stack += "\n(while running gulp)";
								return callback(err);
							});
						} catch (err) {
							return callback(err);
						}
					});
				}

				function copyFiles (fromPath, toPath, callback) {

					return API.FS.remove(toPath, function (err) {
						if (err) return callback(err);

						return copy(API.PATH.join(templatePath), toPath, function (err) {
							if (err) return callback(err);

							function copyRest (callback) {
								if (!API.FS.existsSync(API.PATH.join(toPath, "node_modules"))) {
									API.FS.mkdirsSync(API.PATH.join(toPath, "node_modules"));
								}

								return API.FS.symlink(API.FS.realpathSync(API.PATH.join(__dirname, "node_modules/pinf-for-mozilla-addon-sdk")), API.PATH.join(toPath, "node_modules/pinf-for-mozilla-addon-sdk"), function (err) {
									if (err) return callback(err);

									return API.FS.symlink(API.FS.realpathSync(API.PATH.join(__dirname, "node_modules/firebug.sdk")), API.PATH.join(toPath, "node_modules/firebug.sdk"), callback);
								});
							}

							if (!fromPath) {
								return copyRest(callback);
							}

							return copy(fromPath, API.PATH.join(toPath, templateDescriptor.directories.deploy), function (err) {
								if (err) return callback(err);
								return copyRest(callback);
							});
						});
					});
				}

				function copyCustomTemplates (callback) {
					if (!resolvedConfig.templates) return callback(null);
					var waitfor = API.WAITFOR.serial(callback);
					for (var uri in resolvedConfig.templates) {
						waitfor(uri, function (uri, callback) {
							return copy(
								API.PATH.join(sourcePath, config.templates[uri]),
								API.PATH.join(pubPath, uri),
								callback
							);
						});
					}
					return waitfor();
				}

				function writeProgramDescriptor (callback) {

					var pubProgramDescriptorPath = API.PATH.join(pubPath, "program.json");

					// TODO: Use PINF config tooling to transform program descriptor from one context to another.

					var bundles = {};

					if (
						packageDescriptor.exports &&
						packageDescriptor.exports.bundles
					) {
						for (var bundleUri in packageDescriptor.exports.bundles) {
							bundles[bundleUri] = {
								"source": {
									"path": API.PATH.relative(API.PATH.dirname(pubProgramDescriptorPath), programDescriptorPath),
									"overlay": {
										"layout": {
											"directories": {
										        "bundles": API.PATH.relative(API.PATH.dirname(programDescriptorPath), API.PATH.join(pubPath, templateDescriptor.directories.deploy))
										    }
									    }
									}
								},
								"path": "./" + API.PATH.join(templateDescriptor.directories.deploy, packageDescriptor.exports.bundles[bundleUri])
							};
						}
					}

					var descriptor = {
						boot: {
							runtime: API.PATH.relative(API.PATH.dirname(pubProgramDescriptorPath), API.getRuntimeDescriptorPath())
						}
					};

					// TODO: Add more program properties needed to seed the runtime system.

					if (Object.keys(bundles).length > 0) {
						descriptor.exports = {
							"bundles": bundles
						};
					}

					descriptor.config = resolvedConfig.config || {};

					API.console.debug(("Writing program descriptor to: " + pubProgramDescriptorPath).yellow);
					return API.FS.writeFile(pubProgramDescriptorPath, JSON.stringify(descriptor, null, 4), callback);
				}

				var fromPath = null;
				if (resolvedConfig.bundlesBasePath) {
					fromPath = resolvedConfig.bundlesBasePath;
				} else
				if (
					packageDescriptor.layout &&
					packageDescriptor.layout.directories &&
					packageDescriptor.layout.directories.bundles
				) {
					fromPath = API.PATH.join(sourcePath, packageDescriptor.layout.directories.bundles);
				} else {
					fromPath = API.PATH.join(sourcePath, "bundles");
					if (!API.FS.existsSync(fromPath)) {
						fromPath = null;
					}
				}

				return copyFiles(fromPath, pubPath, function (err) {
					if (err) return callback(err)

					return copyCustomTemplates(function (err) {
						if (err) return callback(err);

						return writeProgramDescriptor(function (err) {
							if (err) return callback(err);

							var targetPath = API.PATH.join(pubPath, templateDescriptor.directories.deploy);

							API.FS.removeSync(targetPath);

							if (!fromPath) {
								return callback(null);
							}

							return API.FS.symlink(fromPath, targetPath, callback);
						});
					});
				});
			})();
		});

	}

	exports.spin = function (resolvedConfig) {

//console.log("spin for firefox extension");

	}

	return exports;
}
