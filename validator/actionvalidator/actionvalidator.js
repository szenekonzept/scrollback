var url = require("url");
var log = require("../../lib/logger.js");
var generate = require("../../lib/generate.js");
var validateRoom = require('../../lib/validate.js');
module.exports = function(core) {

	/* list of event that the basic validation function is called for.*/
	var events = ['init', 'text', 'edit', 'join', 'part', 'away', 'back','admit', 'expel', 'room', 'user'];

	/* if few more validtion is to be added for to any event add it to this list. eq:
		var handlers = {
			'init': function(action, callback){
				callback();
			}
		};
	*/
	var handlers = {
		init: function(action, callback) {
			var n;
			if(action.suggestedNick) {
				n = validateRoom(action.suggestedNick, true);
				if(n != action.suggestedNick) action.suggestedNick = n;
			}
			callback();
		},
		join: function(action, callback) {
			if(/^guest-/.test(action.from)) return callback(new Error("GUEST_CANNOT_JOIN"));
			if(!action.role) action.role = "follower";
			callback();
		},
		part: function(action, callback) {
			if(/^guest-/.test(action.from)) return callback(new Error("GUEST_CANNOT_PART"));
			if(!action.role) action.role = "none";
			callback();
		},
		text: function(action, callback) {
			var mentionMap = {};
			if(!action.text) return callback(new Error("TEXT_MISSING"));

			if(/^\//.test(action.text)){
				if(!/^\/me/.test(action.text)){
					return callback(new Error("UNRECOGNIZED_SLASH_COMMNAD"));
				}
			}

			if(action.mentions && action.mentions.length > 0 ) {
				//checking for multiple mentions for the same user
				action.mentions.forEach(function(i){
					mentionMap[i] = true;
				});
				action.mentions = Object.keys(hashmap);
			}else{
				action.mentions = [];
			}
			callback();
		},
		admit: function(action, callback) {
			if(!action.ref) return callback(new Error("REF_NOT_SPECIFIED"));
			if(!validateRoom(action.ref)) { 
				return callback(new Error("INVALID_REF"));
			}
			if(!action.role) action.role = "follow_invited";
			callback();
		},
		expel: function(action, callback) {
			if(!action.ref) return callback(new Error("REF_NOT_SPECIFIED"));
			if(!validateRoom(action.ref)) { 
				return callback(new Error("INVALID_REF"));
			}
			if(!action.role) action.role = "banned";
			callback();
		},
		edit: function(action, callback) {
  			if(!action.ref) return callback(new Error("REF_NOT_SPECIFIED"));
  			if(!action.text && !action.label) return callback(new Error("NO_OPTION_TO_EDIT"));
  			if(action.label && typeof action.label!= "object") return callback(new Error("INVALID_EDIT_OPTION_LABEL"));
  			if(action.text && typeof action.text!= "string") return callback(new Error("INVALID_EDIT_OPTION_TEXT"));
  			callback();
		}
	};
	
	events.forEach(function(event) {
		core.on(event, function(action, callback) {
			basicValidation(action, function(err) {
				if(err) return callback(err);
				if(handlers[event]){
					handlers[event](action, callback);	
				} 
				else{
					callback();	
				} 
			})
		}, "validation");
	});


	core.on("getThreads", function(action, callback) {
		// do some basic validation for this.
		//remember to is optional when q property is set.
		callback();
	}, "validation");
};

function basicValidation(action, callback) {
	if(!action.id) action.id = generate.uid();
	if(!action.type) return callback(new Error("INVALID_ACTION_TYPE"));

	/*
		validation on action.from is not need because we add the from ignore the from sent be the client.
		from and user is loaded by the entity loader using the session property.
	*/

	if(action.type === "init" || action.type === "user") {
		action.to = "me";
	}else{
		if(!action.to){
			return callback(new Error("INVALID_ROOM"));	
		}
		else if(!validateRoom(action.to)) { 
			return callback(new Error("INVALID_ROOM"));
		}
	}
	action.to = action.to.toLowerCase();
	if(!action.session) return callback(new Error("NO_SESSION_ID"));
	action.time = new Date().getTime();
	callback();
}