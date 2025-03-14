"use strict";

var juri = require("juri")(),
	format = require("./format.js"),
	propMap = {
		nav: {
			dialog: "d",
			dialogState: "ds",
			view: "v"
		}
	};

module.exports = {
	parse: function(url, state) {
		var params = {},
			parts, path, search, value;

		if (typeof url !== "string") {
			throw new TypeError("ERR_INVALID_TYPE");
		}

		if (state && typeof state === "object") {
			state.nav = (state.nav && typeof state.nav === "object") ? state.nav : {};
		} else {
			state = { nav: {} };
		}

		// strip out the host and protocol from the URL
		url = url.replace(/^([a-z]+\:)?\/\/[^\/]+/, "");

		parts = url.split("?");
		path = parts[0];
		search = parts[1];

		if (search) {
			search.split("&").forEach(function(kv) {
				var pair = kv.split("=");

				if (pair[0]) {
					params[pair[0]] = pair.length > 1 ? decodeURIComponent(pair[1]) : true;
				}
			});
		}

		path = (/^\//.test(path) ? path.substr(1) : path).split("/");

		if (path.length === 0 || path[0] === "" || path[0] === "me") {
			state.nav.mode = "home";
		} else if (path.length >= 1) {
			state.nav.room = path[0].toLowerCase();

			if (path.length === 1) {
				state.nav.mode = "room";
				state.nav.threadRange = { time: parseFloat(params.t) || null, before: 20 };
			} else {
				state.nav.mode = "chat";

				if (path[1] && path[1] !== "all") {
					state.nav.thread = path[1];
				} else {
					state.nav.thread = null;
				}

				state.nav.textRange = { time: parseFloat(params.t) || null };
				state.nav.textRange[params.t ? "after" : "before"] = 30;
			}
		}

		if (params.embed) {
			state.context = (state.context && typeof state.context === "object") ? state.context : {};
			state.context.env = "embed";

			try {
				state.context.embed = juri.decode(params.embed);
			} catch (e) {
				state.context.embed = {};
			}
		}

		for (var section in propMap) {
			for (var prop in propMap[section]) {
				value = params[propMap[section][prop]];

				if (value) {
					try {
						if (/^o!\(/.test(value)) {
							// looks like an encoded object
							state[section][prop] = juri.decode(value.substr(2));
						} else {
							state[section][prop] = value;
						}
					} catch (e) {
						state[section][prop] = {};
					}

				}
			}
		}

		return state;
	},

	build: function(state, store) {
		var params = {},
			queries = [],
			url, title;

		if (typeof state !== "object" || state === null || typeof state.nav !== "object" || state.nav === null) {
			throw new Error("ERR_INVALID_STATE");
		}

		switch (state.nav.mode) {
		case "home":
			url = "/me";
			break;
		case "room":
			if (state.nav.threadRange && state.nav.threadRange.time) {
				params.t = state.nav.threadRange.time;
			}

			url = "/" + state.nav.room;
			break;
		case "chat":
			if (state.nav.textRange && state.nav.textRange.time) {
				params.t = state.nav.textRange.time;
			}

			if (state.nav.thread && store) {
				title = (store.get("indexes", "threadsById", state.nav.thread) || {}).title;
			}

			url = "/" + state.nav.room + "/" + (state.nav.thread ? state.nav.thread : "all") + (title ? "/" + format.urlComponent(title) : "");
			break;
		default:
			url = "/";
		}

		for (var key in params) {
			queries.push(
				encodeURIComponent(key) + "=" + encodeURIComponent(params[key])
			);
		}

		if (state.context && state.context.embed) {
			queries.push("embed=" + juri.encode(state.context.embed));
		}

		for (var section in propMap) {
			if (state[section]) {
				for (var prop in propMap[section]) {
					if (state[section][prop]) {
						if (typeof state[section][prop] === "object") {
							queries.push(propMap[section][prop] + "=o!" + juri.encode(state[section][prop]));
						} else {
							queries.push(propMap[section][prop] + "=" + encodeURIComponent(state[section][prop]));
						}
					}
				}
			}
		}

		if (queries.length) {
			url += "?" + queries.join("&");
		}

		return url;
	}
};
