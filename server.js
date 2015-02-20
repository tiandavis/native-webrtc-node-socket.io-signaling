var express		= require('express');
var app			= express();
var bodyParser	= require('body-parser');
var https 		= require('https');
var http 		= require('http');
var fs 			= require('fs');
var _ 			= require('underscore');


app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var port = process.env.PORT || 8080;

var options = {
  key: fs.readFileSync('./key.pem'),
  cert: fs.readFileSync('./cert.pem')
};

// API Routes
var router = express.Router();

// Create a token (accessed at POST /api/tokens)
router.route('/tokens')
	
	.post(function(req, res) {
		
	});

// Register our routes
app.use('/api', router);

app.use(express.static(__dirname + '/app'));
app.use('/bower_components',  express.static(__dirname + '/bower_components'));

// Start the server
var s = http.createServer(app).listen(8080);
var server = https.createServer(options, app).listen(443);

/*app.listen(port, function(err){
	if (err) {
		console.log('Error binding to port %s, listen error: %s', port, err);
		return;
	}
	
	console.log('Listening on port %s', port);
});*/

var io = require('socket.io').listen(server);

var group = [];

// When a socket connects, set up the specific listeners we will use.
io.on('connection', function(socket){
  // When a client tries to join a room, only allow them if they are first or
  // second in the room. Otherwise it is full.
  socket.on('join', function(event){
	  event.member.socketId = socket.id;
	  //console.log("join: ", event);

	  //Add member to the group

	  group.push(event.member);

	  var room = event.room;

	  var clients = io.sockets.adapter.rooms[room];

	  var numClients = (typeof clients !== 'undefined') ? Object.keys(clients).length : 0;

	  if(numClients == 0){
		  socket.join(room);
		  socket.emit('initiator', room);

		  socket.emit('group', JSON.stringify(group));
	  } else if(numClients == 1){
		  socket.join(room);
		  // When the client is second to join the room, both clients are ready.
		  socket.emit('ready', room);
		  socket.broadcast.emit('ready', room);

		  socket.emit('group', JSON.stringify(group));
		  socket.broadcast.emit('group', JSON.stringify(group));
	  } else{
		  socket.emit('full', room);
	  }
  });
  
  // Client disconnected
  socket.on('disconnect',function(event) {
	  console.log('disconnect: ');
	  
	  var index = _.indexOf(_.pluck(group, 'socketId'), socket.id);
	  
	  console.log("disconnect index: ", index);
	  
	  if(index > -1) {
		  group.splice(index, 1);
	  
		  console.log("disconnect group: ", group);
	  
		  socket.broadcast.emit('group', JSON.stringify(group));
	  }
  });

  // Relay candidate messages
  socket.on('candidate', function(candidate){
    socket.broadcast.emit('candidate', candidate);
  });

  // Relay offers
  socket.on('offer', function(offer){
    socket.broadcast.emit('offer', offer);
  });

  // Relay answers
  socket.on('answer', function(answer){
    socket.broadcast.emit('answer', answer);
  });
});