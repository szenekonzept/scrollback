/* jshint browser:true */
/* global SockJS*/

"use strict";

var generate = require("../lib/generate.js"),
	appUtils = require("../lib/app-utils.js"),
	pending = require("../lib/pendingQueries.js"),
	config, core, client, store;

var backOff = 1,
	pendingQueries = {},
	pendingActions = {},
	session,
	queue = [],
	initDone = false,
	actionQueue = [];

/*
	{
		keygenerated: [
			{
				queryObject: {},
				next: callback for the next listener.
			},
			.
			.
			.,
			{
				queryObject: {},
				next: callback for the next listener.
			}
		]
	}
*/
var currentQueries = {};


function sendAction(action) {
	action.session = session;
	action.from = store.get("user");
	client.send(JSON.stringify(action));
}



function disconnected() {
	console.log("Disconnected:", backOff);

	if (backOff === 1) {
		core.emit("setstate", {
			app: {
				connectionStatus: "offline"
			}
		}, function(err) {
			if (err) console.log(err.message);
		});
	}
	if (backOff < 180) {
		backOff *= 2;
	} else {
		backOff = 180;
	}

	setTimeout(connect, backOff * 1000);
}


function connect() {
	client = new SockJS(config.server.protocol + "//" + config.server.apiHost + "/socket");
	client.onclose = disconnected;

	client.onopen = function() {
		backOff = 1;
		sendInit();
	};

	client.onmessage = receiveMessage;
}


function receiveMessage(event) {
	var data, note, userId;

	try {
		data = JSON.parse(event.data);
	} catch (err) {
		core.emit("error", err);
	}

	if (["getTexts", "getThreads", "getUsers", "getRooms", "getSessions", "getEntities", "upload/getPolicy", "getNotes", "error"].indexOf(data.type) !== -1) {
		if (pendingQueries[data.id]) {
			if (data.results) { pendingQueries[data.id].query.results = data.results; }
			if (data.response) { pendingQueries[data.id].query.response = data.response; }

			if (data.type === "error") {
				pendingQueries[data.id](data);
			} else {
				pendingQueries[data.id]();
			}

			delete pendingQueries[data.id];
		}
	}

	if (["text", "edit", "back", "away", "join", "part", "admit", "expel", "user", "room", "init", "note-dn", "error"].indexOf(data.type) !== -1) {
		//data is an action
		if (pendingActions[data.id]) {
			pendingActions[data.id](data);
			delete pendingActions[data.id];
		}

		// Generate notifications from the action
		userId = store.get("user");

		if (data.note && data.from !== userId) {
			for (var n in data.note) {
				if (data.note[n]) {
					note = data.note[n];

					if (typeof note.score !== "number") {
						note.score = 0;
					}

					note.to = userId;
					note.ref = data.id;
					note.time = data.time;
					note.noteType = n;

					core.emit("note-dn", note);
				}
			}
		}

//		console.log(data.type+ "-dn", data);
		core.emit(data.type + "-dn", data);
	}
}

function sendInit() {
	var init = {};
	init.id = generate.uid();
	init.resource = generate.uid();
	init.type = "init";
	init.to = "me";
	init.origin = {};
	core.emit("init-up", init, function() {});
}

module.exports = function(c, conf, s) {
	core = c;
	config = conf;
	store = s;

	connect();
	function sendQuery(query, next) {
		console.log("sending query", query);
		query.session = session;
		client.send(JSON.stringify(query));
		pendingQueries[query.id] = next;
		pendingQueries[query.id].query = query;
	}


	[ "getTexts", "getUsers", "getRooms", "getThreads", "getEntities", "upload/getPolicy", "getNotes" ].forEach(function(e) {
		core.on(e, function(q, n) {
			console.log("Making query:", q);
			q.type = e;
			var key = pending.generateKey(q);
			console.log("checking key: ", key, currentQueries);
			
			if(currentQueries[key]) {
				currentQueries[key].push({
					query:q,
					next: n
				});
				
				return;
			}
			
			function finishQuery(err) {
				console.log("Callback fired");
				currentQueries[key].forEach(function(item){
					item.query.results = q.results;
					item.next(err);
				});
				delete currentQueries[key];
			}
			
			currentQueries[key] = [{
				query:q,
				next: n
			}];

			if (initDone) {
				sendQuery(q, finishQuery);
			} else {
				queue.push(function() {
					sendQuery(q, finishQuery);
				});
			}
			
		}, 10);
	});

	[	
		"text-up", "edit-up", "back-up", "away-up",
		"join-up", "part-up", "admit-up", "expel-up",
		"room-up", "note-up"
	].forEach(function(event) {
		core.on(event, function(action, next) {
			action.type = event.replace(/-up$/, "");
			if (initDone) {
				sendAction(action);
			} else {
				actionQueue.push(function() {
					sendAction(action);
				});
			}
			next();
		}, 1);
	});

	core.on("user-up", function(userUp, next) {
		if (appUtils.isGuest(userUp.user.id)) {
			next();
			core.emit("user-dn", userUp);
		} else {
			userUp.type = "user";
			if (initDone) {
				sendAction(userUp);
			} else {
				actionQueue.push(function() {
					sendAction(userUp);
				});
			}
			next();
		}
	}, 1);

	core.on("init-up", function(init, next) {
		if (!init.session) session = init.session = "web://" + generate.uid();

		init.type = "init";
		init.to = "me";

		client.send(JSON.stringify(init));

		pendingActions[init.id] = function(action) {
			if (action.type === "init") {
				initDone = true;
				while (queue.length) {
					queue.splice(0, 1)[0]();
				}
				core.emit("setstate", {
					app: {
						connectionStatus: "online"
					},
					user: action.user.id
				});
			}
		};

		next();
	}, 1);

	core.on("statechange", function(changes, next) {
		if (changes.app && changes.app.connectionStatus === "online") {
			initDone = true;
			while (queue.length) {
				queue.splice(0, 1)[0]();
			}
		}
		next();
	}, 1000);
};
