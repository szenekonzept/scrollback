/* global $ */

"use strict";

var formField = require("../ui/utils/form-field.js"),
	handleAuthErrors = require('./handleAuthErrors.es6');

module.exports = function(core) {
	core.on('conf-show', function(tabs) {
		var room = tabs.room,
			guestPermRead = false,
			guestPermWrite = false,
			registeredPermRead = false,
			registeredPermWrite = false,
			followerPermRead = false,
			followerPermWrite = false,
			readLevel,
			writeLevel,
			openRoom;

		room.guides = room.guides || {};
		room.guides.authorizer = room.guides.authorizer || {};

		room.guides.authorizer.readLevel = room.guides.authorizer.readLevel || 'guest';
		room.guides.authorizer.writeLevel = room.guides.authorizer.writeLevel || 'guest';

		room.guides = room.guides || {};

		openRoom = (room.guides.authorizer && typeof room.guides.authorizer.openRoom === "boolean") ? room.guides.authorizer.openRoom : true;
		readLevel = room.guides.authorizer.readLevel; // guest, registered, follower
		writeLevel = room.guides.authorizer.writeLevel;

		switch (readLevel) {
		case 'guest':
			guestPermRead = true;
			break;
		case 'registered':
			registeredPermRead = true;
			break;
		case 'follower':
			followerPermRead = true;
		}

		switch (writeLevel) {
		case 'guest':
			guestPermWrite = true;
			break;
		case 'registered':
			registeredPermWrite = true;
			break;
		case 'follower':
			followerPermWrite = true;
		}

		var div = $('<div>').append(
			formField('Who can read messages?', 'radio', "authorizer-read", [['authorizer-read-guest', 'Anyone (Public)', guestPermRead], ['authorizer-read-users', 'Logged in users', registeredPermRead], ['authorizer-read-followers', 'Followers', followerPermRead]]),
			formField('Who can post messages?', 'radio', "authorizer-write", [['authorizer-post-guest', 'Anyone (Public)', guestPermWrite], ['authorizer-post-users', 'Logged in users', registeredPermWrite], ['authorizer-post-followers', 'Followers', followerPermWrite]]),
			formField("Anyone can follow without request", "toggle", "authorizer-open-room", openRoom)
		);

		tabs.authorizer = {
			html: div,
			text: "Permissions"
		};
	}, 800);

	core.on('conf-save', function(room) {
		var mapRoles = {
				guest: 'guest',
				users: 'registered',
				followers: 'follower'
			},
			readLevel = mapRoles[$('input:radio[name="authorizer-read"]:checked').attr('id').substring(16)],
			writeLevel = mapRoles[$('input:radio[name="authorizer-write"]:checked').attr('id').substring(16)];

		room.guides = room.guides || {};

		room.guides.authorizer = {
			readLevel: readLevel,
			writeLevel: writeLevel,
			openRoom: $("#authorizer-open-room").is(':checked')
		};
	}, 500);

	core.on('error-dn', function(error) {
		var errorActions = [ "admit", "expel", "edit", "part", "room", "user" ];

		if (error.message === "ERR_NOT_ALLOWED" && errorActions.indexOf(error.action) > -1) {
			handleAuthErrors(error);
		}
	}, 1000);
};
