jQuery(document).ready(function($) {
 
var AppView = Backbone.View.extend({
	el: $("#theinterview"),
	
	initialize: function() {
		console.log("initialize app-view");
		
		var _this = this;
		
		this.socket = io.connect();
		
		// Config
		this.room = "the-interview";
		this.isInitiator = false;
		
		this.pcConfig = {'iceServers':[
			{'url':'stun:23.21.150.121'}, 
			{url: 'turn:numb.viagenie.ca', credential: 'muazkh', username: 'webrtc@live.com'}
		]};
		
		this.pcContraints = {
			optional : [
				{DtlsSrtpKeyAgreement : true},
				{RtpDataChannels: true}
			]
		};
		
		//Create an RTC object
        this.createPeerConnection();
		this.socket.on('initiator', this.onInitiator);
		this.socket.on('ready', this.onReady);
		this.socket.on('offer', this.onOffer);
        this.socket.on('candidate', this.onCandidate);
        this.socket.on('answer', this.onAnswer);
		this.socket.on('group', this.onGroupJoin);
		this.socket.on('gotUserMedia', this.onGotUserMedia);
		
		
		window.sketchpad = Raphael.sketchpad("whiteboard-canvas", {
			width: "100%", //550
			height: 200, //200
			editing: true
		});
		
		
		this.members = new Members();
		
		this.member = new Member();
		
		if(!this.member.has("name")) {
			console.log("get member name");
			
			$(".signin").show();
		}
		
		// Event Listeners
		window.sketchpad.change(function() {
			console.log("window.sketchpad.change");
			
			var wire = JSON.stringify({
					whiteboard: sketchpad.strokes(),
					member: _this.member.toJSON(),
					type: "whiteboard"
			});
			
			_this.sendChannel.send(wire);
		});
    },

    // Map events to handler functions
	events: {
		"click .send-msg"				: "sendMessage",
		"submit .msg-type-box form"		: "sendMessage",
		"click .start-whiteboard"		: "startWhiteboard",
		"click .voiceCall"				: "voiceCall",
		"click .videoCall"				: "videoCall",
		"click .screenShare"			: "screenShare",
		"click .logout"					: "logout",
		"submit .signin form"			: "signin",
		"click .reset"					: "reset",
		"click .toggle"					: "toggle",
		"click .toggleVideoMute"		: "toggleVideoMute",
		"click .toggleVideo"			: "toggleVideo",
		"click .hangupVideo"			: "hangupVideo",
		"mouseenter .video-box"			: "showVideoControls",
		"mouseleave .video-box"			: "hideVideoControls",
		"click .profile-image img"		: "togglePresence"
    },
	
	createPeerConnection: function() {
        this.peerConnection = new RTCPeerConnection(this.pcConfig, this.pcConstraints);
       
        // Add the local video stream to the peerConnection.
		if(this.localStream) {
			console.log("createPeerConnection localStream: ", this.localStream);
			this.peerConnection.addStream(this.localStream);
		}
        
      	// Set up callbacks for the connection generating iceCandidates or
      	// receiving the remote media stream.
        this.peerConnection.onaddstream = this.onAddStream;
		this.peerConnection.onicecandidate = this.onIceCandidate;
		
		
	},
	
	signin: function(e) {
		e.preventDefault();
		
		console.log("signin");
		
		var name = $(".signin-name").val();
		var email = $(".signin-email").val();
		var image = gravatar(email, {size: 110});
		
		
		this.member.set("name", name);
		this.member.set("email", email);
		
		this.member.set("image", image);
		console.log(this.member.get("image"));
		
		this.member.set("endpointId", email);
		
		// Hide the sign in form
		$(".signin").hide();
		
		//$(".user-profiles").append(_.template($("#ProfileTmpl").html())(this.member.toJSON())); //Add the Profile to the View
		

		
	    // Now we're ready to join the chat room.
	    this.socket.emit('join', {
	    	room: this.room,
			member: this.member.toJSON()
	    });
	},
	
	onGroupJoin: function(group) {
		console.log('onGroupJoin: ' + group);
		var _this = window.appView;
		
		$(".user-profiles li").remove();

		var members = JSON.parse(group);
		
		_.each(members, function(member){
			console.log("member: ", member);
			$(".user-profiles").append(_.template($("#ProfileTmpl").html())(member)); //Add the Profile to the View
		});
	},
	
	onInitiator: function(room) {
		console.log('Created room: ' + room);
		var _this = window.appView;
		
		_this.isInitiator = true;
	},
	
	onReady: function(room) {
		console.log('Ready room: ' + room);
		var _this = window.appView;
		
	    if (_this.isInitiator) {
			console.log("I am the initiator...");
			
	        _this.sendChannel = _this.peerConnection.createDataChannel("theDataChannel", {reliable: false});
	        _this.sendChannel.onmessage = _this.handleMessage;
	      	//this.sendChannel.onopen = this.handleSendChannelStateChange;
	      	//this.sendChannel.onclose = this.handleSendChannelStateChange;
			
			//Create offer
			_this.createOffer();
	    } else {
			console.log("I am not the initiator...");
	      	_this.peerConnection.ondatachannel = _this.onReceiveChannel;
	    }
	},
	
    // When the peerConnection generates an ice candidate, send it over the socket
    // to the peer.
    onIceCandidate: function(event){
		console.log("onIceCandidate", this);
		var _this = window.appView;
		
		if(event.candidate){
			_this.socket.emit('candidate', JSON.stringify(event.candidate));
		}
    },
	
	
    // When receiving a candidate over the socket, turn it back into a real
    // RTCIceCandidate and add it to the peerConnection.
    onCandidate: function(candidate){
		console.log("onCandidate", this);
		var _this = window.appView;
		
		var rtcCandidate = new RTCIceCandidate(JSON.parse(candidate));
		_this.peerConnection.addIceCandidate(rtcCandidate);
    },
	
    // When an answer is received, add it to the peerConnection as the remote
    // description.
    onAnswer: function(answer){
		console.log("onAnswer", this);
		var _this = window.appView;
		
		var rtcAnswer = new RTCSessionDescription(JSON.parse(answer));
		_this.peerConnection.setRemoteDescription(rtcAnswer);
    },
	
    // When a browser receives an offer, set up a callback to be run when the
    // ephemeral token is returned from Twilio.
    onOffer: function(offer){
		console.log("onOffer", this);
		var _this = window.appView;
		
      	_this.createAnswer(offer)
    },
	
    // Create an offer that contains the media capabilities of the browser.
    createOffer: function(){
		console.log("createOffer", this);
		var _this = this;
		
		this.peerConnection.createOffer(
			function(offer){
				// If the offer is created successfully, set it as the local description
				// and send it over the socket connection to initiate the peerConnection
				// on the other side.
				console.log("createOffer (inside): ", offer)
				_this.peerConnection.setLocalDescription(offer);
				_this.socket.emit('offer', JSON.stringify(offer));
			},
			function(err){
				// Handle a failed offer creation.
				console.log(err);
			}
		);
    },
	
    // Create an answer with the media capabilities that both browsers share.
    // This function is called with the offer from the originating browser, which
    // needs to be parsed into an RTCSessionDescription and added as the remote
    // description to the peerConnection object. Then the answer is created in the
    // same manner as the offer and sent over the socket.
    createAnswer: function(offer){
		console.log("createAnswer", this);
		var _this = window.appView;
		
        var rtcOffer = new RTCSessionDescription(JSON.parse(offer));
		
        this.peerConnection.setRemoteDescription(rtcOffer);
		
        this.peerConnection.createAnswer(
          function(answer){
			  console.log("createAnswer (inside): ", answer)
            _this.peerConnection.setLocalDescription(answer);
            _this.socket.emit('answer', JSON.stringify(answer));
          },
          function(err){
            // Handle a failed answer creation.
            console.log(err);
          }
        );
    },
	
	sendMessage: function(e) {	
		console.log("sendMessage");
		
		e.preventDefault();	
		
		if(!this.member.has("name")) {
			return;
		}
		
		var msg = $(".send-msg-box").val();
		
		var message = new Message();
		
		message.set({
			email: this.member.get("email"),
			name: this.member.get("name"),
			message: msg,
			id: message.guid(),
			image: this.member.get("image"),
			timestamp: moment().format('h:mm'),
			type: "message"
		});
		
		var wire = JSON.stringify(message.toJSON());
		console.log(wire);
		
		//Display the message locally
		$(".messages").append(_.template($("#MessageTmpl").html())(message.toJSON())); //Add the Message to the View
		
		//Send the message to the group
		this.sendChannel.send(wire);
	},
	
	handleMessage: function(event) {
		console.log("handleMessage", event);
		var _this = window.appView;
		
		var message = JSON.parse(event.data);
		
		var messageTypes = {
			"message": function(message) {
				$(".messages").append(_.template($("#MessageTmpl").html())(message)); //Add the Message to the View
			},

			"whiteboard": function(message) {
				if($(".whiteboard-canvas").is(':hidden')) {
					$(".whiteboard-message").hide();
					$(".whiteboard-canvas").show();
					$(".start-whiteboard").addClass("reset");
					$(".start-whiteboard").text("Reset");
				}
				
				window.sketchpad.strokes(message.whiteboard);
			}
		}[message.type](message);
	},
	
	onReceiveChannel: function(event) {
		console.log("onReceiveChannel", event);
		var _this = window.appView;
		
	    _this.sendChannel = event.channel;
	    _this.sendChannel.onmessage = _this.handleMessage;
	},
	
	
	
	startWhiteboard: function(e) {
		console.log("startWhiteboard");
		
		if(!this.member.has("name")) {
			return;
		}
		
		$(".whiteboard-message").hide();
		$(".whiteboard-canvas").show();
		$(".start-whiteboard").addClass("reset");
		$(".start-whiteboard").text("Reset");
	},
	
	reset: function(e) {
		window.sketchpad.clear();
		$(".start-whiteboard").removeClass("reset");
		$(".whiteboard-canvas").hide();
		$(".whiteboard-message").show();
		$(".start-whiteboard").text("Get Started");
	},
	
	toggle: function(e) {
		console.log("toggle");
		
		if(!this.member.has("name")) {
			return;
		}
		
		$(".fa-toggle-on, .fa-toggle-off").toggle();
		
		$(".front, .back").toggle();
	},
	
	voiceCall: function(e) {
		console.log("voiceCall");
		
		$(".fa-toggle-off").hide();
		$(".fa-toggle-on").show();
		
		$(".front").hide();
		$(".back").show();
		
		var email = $(e.currentTarget).data("email");
		
		console.log(email);
		
  	  	// Call to getUserMedia (provided by adapter.js for cross browser compatibility)
  	  	// asking for access to both the video and audio streams.
		var constraints = {video: false, audio: true};
		this.requestMediaStream(constraints);
	},
	
	videoCall: function(e) {
		console.log("videoCall");
		
		var _this = this;
		
		$(".fa-toggle-off").hide();
		$(".fa-toggle-on").show();
		
		$(".front").hide();
		$(".back").show();
		
		var email = $(e.currentTarget).data("email");
		
		console.log(email);
		
  	  	// Call to getUserMedia (provided by adapter.js for cross browser compatibility)
  	  	// asking for access to both the video and audio streams.
		var constraints = {video: true, audio: true};
		this.requestMediaStream(constraints);
	},
	
    // Call to getUserMedia (provided by adapter.js for cross browser compatibility)
    // asking for access to both the video and audio streams. If the request is
    // accepted callback to the onMediaStream function, otherwise callback to the
    // noMediaStream function.
    requestMediaStream: function(constraints){
		getUserMedia(
			constraints,
			this.onMediaStream,
			this.noMediaStream
		);
    },
	
    // The onMediaStream function receives the media stream as an argument.
    onMediaStream: function(stream){
		var _this = window.appView;

		// Get the video element.
		_this.localVideo = document.getElementById('localVideo');
		// Turn the volume down to 0 to avoid echoes.
		_this.localVideo.volume = 0;
		_this.localStream = stream;


		// Turn the media stream into a URL that can be used by the video and add it
		// as the video's `src`. As the video has the `autoplay` attribute it will
		// start to stream immediately.
		_this.localVideo.src = window.URL.createObjectURL(stream);
		_this.localVideo.play();

		// If the negotiation already happened, a new one will be needed for the remote 
		// peer to be able to use it.
		if(_this.isInitiator) {
			_this.createPeerConnection();
			_this.createOffer();
		}
		
		if(!_this.isInitiator) {
			console.log("onMediaStream localStream: ", _this.localStream);
			_this.peerConnection.addStream(_this.localStream);
			_this.createOffer();
		}
    },

    // There's not much to do in this demo if there is no media stream. So
    // let's just stop.
    noMediaStream: function(){
		console.log("No media stream for us.");
		// Sad trombone.
    },
	
    // When the peerConnection receives the actual media stream from the other
    // browser, add it to the other video element on the page.
    onAddStream: function(event){
		console.log("onAddStream this: ", this);
		console.log("onAddStream event: ", event);
		
		$(".fa-toggle-off").hide();
		$(".fa-toggle-on").show();
		
		$(".front").hide();
		$(".back").show();
		
		var _this = window.appView;
		
		_this.remoteVideo = document.getElementById('remoteVideo');
		_this.remoteVideo.src = window.URL.createObjectURL(event.stream);
		_this.remoteVideo.play();
		
		_this.remoteStream = event.stream;
		
		if(!_this.isInitiator) {
			var constraints = {};
			
			if(event.stream.getVideoTracks().length > 0) {
				 constraints = {video: true, audio: true};
			} else {
				constraints = {video: false, audio: true};
			}
			
			_this.requestMediaStream(constraints);
		}
		
    },
	
	screenShare: function(e) {
		console.log("screenShare");
		console.log("You'll need a more robust communications API. Checkout the folks at Respoke: https://respoke.io/");
	},
	
	toggleVideoMute: function(e) {
		console.log("toggleVideoMute");
		
		console.log(e);
		console.log(this);
		
		$(".fa-microphone, .fa-microphone-slash").toggle();
		
		console.log("You'll need a more robust communications API. Checkout the folks at Respoke: https://respoke.io/");
	},
	
	toggleVideo: function(e) {
		console.log("toggleVideo");
		console.log(this);
		
		console.log("You'll need a more robust communications API. Checkout the folks at Respoke: https://respoke.io/");
	},
	
	hangupVideo: function(e) {
		console.log("hangupVideo");
		console.log(this);
		
		console.log("You'll need a more robust communications API. Checkout the folks at Respoke: https://respoke.io/");
	},
	
	showVideoControls: function(e) {
		console.log("showVideoControls");
		$(".video-controls").fadeIn();
	},
	
	hideVideoControls: function(e) {
		console.log("hideVideoControls");
		$(".video-controls").fadeOut();
	},
	
	logout: function(e) {
		console.log("logout");
		
		if(!this.member.has("name")) {
			return;
		}
		
		this.reset();
		
		this.member.clear();
		
		$(".user-profile li").remove();
		
		$(".message").remove();
		
		$(".signin").show();
		
		
		//Video Reset
		$(".back").hide();
		$(".front").show();
		this.reset();
		
		console.log(this);
		
		
	}
});



window.appView = new AppView();


});//document.ready