var http = require("http");
var url = require('url');
var fs = require('fs');
var assert = require('assert');
var PNG = require('png-coder').PNG;
var Stream = require('stream');
var mapLayout = require('./map.js');
var io = require('socket.io');
var mongoClient = require('mongodb').MongoClient;

// Switch environment variables local/heroku
switch(process.argv[2]){
    case "dev":
        var MONGOLAB_URI = "mongodb://localhost:27017";
        var port = 8001;
        console.log("development config");
        break;

    default:
        var MONGOLAB_URI = process.env.MONGOLAB_URI;
        var port = process.env.PORT;
        console.log("heroku config");
        break;
}

// Serveur -  web
var server = http.createServer(function(request, response){
    var path = url.parse(request.url).pathname;

    switch(path){
        case '/':
            response.writeHead(200, {'Content-Type': 'text/html'});
            response.write('hello world');
            response.end();
            break;
        case '/socket.html':
            fs.readFile(__dirname + path, function(error, data){
                if (error){
                    response.writeHead(404);
                    response.write("opps socket.html doesn't exist - 404");
                    response.end();
                }
                else{
                    response.writeHead(200, {"Content-Type": "text/html"});
                    response.write(data, "utf8");
                    response.end();
                }
            });
            break;
		case '/mongo.html':
            fs.readFile(__dirname + path, function(error, data){
                if (error){
                    response.writeHead(404);
                    response.write("opps mongo.html doesn't exist - 404");
                    response.end();
                }
                else{
                    response.writeHead(200, {"Content-Type": "text/html"});
                    response.write(data, "utf8");
                    response.end();
                }
            });
            break;
        default:
            response.writeHead(404);
            response.write("opps this doesn't exist - 404");
            response.end();
            break;
    }
});

// Serveur - listener
server.listen(port, function() {
	console.log("Listening on " + port);
});

var listener = io.listen(server);
listener.sockets.on('connection', function(socket){

    socket.on('subscribe', function(data){
		console.log("==========");
		console.log("Received subscribe", JSON.stringify(data));
        if(data.pseudo != null && data.password != null && data.pseudo != "" && data.password != ""){
            insertUser(data,socket);   
        }
        else {
            emit(socket, 'response_subscribe', { 'error_code' : 2, "msg" : "Username or password is empty."});
        }
    });

    socket.on('connect_user', function(data){
		console.log("==========");
		console.log("Received connect_user", JSON.stringify(data));
        check_authentification(data,socket);
    });
	
    socket.on('get_list_room', function(data){
        // TODO : a prendre en parametre la pos gps et renvoyer les rooms trié par distances
		console.log("==========");
		console.log("Received get_list_room", JSON.stringify(data));
        emit_list_room(socket);
    });

    socket.on('new_room', function(data){
		  console.log("==========");
		  console.log("Received new_room", JSON.stringify(data));
      console.log("Generating map");
      if (data.longitude!=null && data.latitude!="undefined")
        mapLayout.generateMapLayout(data.longitude,data.latitude,15,function(layout){
          console.log(layout);
          create_room(data,socket,layout);
        });
      else
        create_room(data,socket,"undefined");
    });

    socket.on('create_solo_room', function(data){
		  console.log("==========");
		  console.log("Received create_solo_room", JSON.stringify(data));
      if (data.longitude!=null && data.latitude!="undefined")
        mapLayout.generateMapLayout(data.longitude,data.latitude,15,function(layout){
          console.log(layout);
          create_solo_room(data,socket,layout);
        });
      else
        create_solo_room(data,socket,"undefined");
    });

    /*** User creates/joins room ***/
    socket.on('join', function(data){
		console.log("==========");
		console.log("Received join", JSON.stringify(data));
        join_room(data,socket);
    });
        
        
    /*** User leaves room ***/
    socket.on('leave',function(data){
		console.log("==========");
		console.log("Received leave", JSON.stringify(data));
        leave_room(data,socket);
    });

	/*** Player in a room kicked if host leaves room ***/
    socket.on('kick',function(data){
		console.log("==========");
		console.log("Received kick", JSON.stringify(data));
    });

	/*** Character selection screen ***/
    socket.on('character_choice',function(data){
		console.log("==========");
		console.log("Received character_choice", JSON.stringify(data));
		emit_broadcast(data.room_name, 'character_choice_response', data);		
    });

	/*** Start the game ***/
    socket.on('game_start', function(data){
		console.log("==========");
		console.log("Received game_start", JSON.stringify(data));
        set_room_invisible(data);
		emit_broadcast(data.room_name, 'game_start_response', {"error_code": 0 });	
    });

    socket.on("character_timeout_ended", function(data){
		console.log("==========");
		console.log("Received character_timeout_ended", JSON.stringify(data));
		emit_broadcast(data.room_name, 'character_timeout_ended_response', {"error_code": 0 });	
    });

    /*** User data distribution on the room ***/
    socket.on('character_position', function(data){
		console.log("==========");
		console.log("Received character_position", JSON.stringify(data));
		emit_broadcast(data.room_name, 'character_position_response', data);	
    });

	// En cas de problème
	socket.on('error', function (err) { 
		console.error(err.stack); 
		//socket.destroy(); // end/disconnect/close/destroy ?
	});
});

function emit(socket, title, message) {
	socket.emit(title, message);    
	console.log("==========");
	console.log("Sending " + title);
	console.log(JSON.stringify(message));
}

function emit_broadcast(channel, title, message) {
	listener.sockets.in(channel).emit(title, message);
	console.log("==========");
	console.log("Broadcasting on channel " + channel);
	console.log(title + " : " + JSON.stringify(message));  
}

function emit_list_room(socket){
    mongoClient.connect(MONGOLAB_URI, function(err, db) {
        assert.equal(null, err);
        var data = [];       
        var cursor = db.collection('Room').find({ "visibility": true });
        cursor.toArray(function(err, docs) {
            assert.equal(err, null);
            for(i=0; i<docs.length; i++){
                var doc = docs[i];
                if(doc.room_password!=null) {
                    data.push({
                    "host" : doc.host,
                    "room_name" : doc.room_name,
                    "slot_empty" : doc.slot_empty,
                    "map" : doc.GPS,
                    "is_password" : true });
                }
                else {
                    data.push({
                    "host" : doc.host,
                    "room_name" : doc.room_name,
                    "slot_empty" : doc.slot_empty,
                    "map" : doc.GPS,
                    "is_password" : false });
                }
            }
            emit(socket, 'list_room', {'error_code' : 0, "rooms" : data});
            db.close();
        });    
    });
}

// MongodB - subscribe

function insertUser(data,socket) {	
	mongoClient.connect(MONGOLAB_URI, function(err, db) {
		assert.equal(null, err);
		db.collection('User').insertOne({
				"pseudo" : data.pseudo,
				"password" : data.password
			}, 
			function(err, result) {
				try {
					assert.equal(err, null);
					emit(socket, 'response_subscribe', { 'error_code' : 0, "msg" : "Registered"});
				}
				catch (e) { // non-standard
					emit(socket, 'response_subscribe', { 'error_code' : 1, "msg" : "Username taken."});
				}
			db.close();
		});
	});
};

function clearDB() {
    console.log("Clearing");

	mongoClient.connect(MONGOLAB_URI, function(err, db) {
		assert.equal(null, err);
		db.collection('User').remove();
		console.log("Cleared !!!");
		db.close();
	});  
};

// MongodB - connect

function check_authentification(data,socket) {
	mongoClient.connect(MONGOLAB_URI, function(err, db) {
		assert.equal(null, err);
		var found = false;
		var cursor = db.collection('User').find( { "pseudo": data.pseudo,"password" : data.password } );
		cursor.each(function(err, doc) {
			assert.equal(err, null);
			if (doc != null) {
				found = true;
				emit(socket, 'response_connect', { 'error_code' : 0, "msg" : "Connected", "player_name" : data.pseudo} );
			}
			if (!found) {
				emit(socket, 'response_connect', { 'error_code' : 1, "msg" : "Username or password is incorrect."});
			}
			db.close();
		});
	});
};

function create_room(data, socket, layout){
	var tab_player = [];
	tab_player.push(data.host);
	mongoClient.connect(MONGOLAB_URI, function(err, db) {
		assert.equal(null, err);
			db.collection('Room').insertOne({
				"room_name" : data.room_name,
				"room_password" : data.room_password,
				"host" : data.host,
				"list_players" : tab_player,
				"number_players_max" : 5,
				"GPS" : layout,
				"distance_min" : data.distance_min,
				"slot_empty" : 4,
                "visibility" : true,
                "is_password" : data.is_password
			},
			function(err, result) {
				try {
					assert.equal(err, null);
          socket.join(data.room_name);
					emit(socket, 'response_create', { 'error_code' : 0, "msg" : "Create successful", "room_name" : data.room_name, "host" : data.host, "map": layout});
          emit(socket, 'list_player', tab_player);
				}
				catch (e) { // non-standard
					console.log(e.name + ': ' + e.message);
					emit(socket, 'response_create', { 'error_code' : 1, "msg" : "Room name already used."});
				}
			db.close();
		});
	});
}

function create_solo_room(data, socket, layout){
	var room_name = data.player_name + "_" + Date.now();
	var tab_player = [];
	tab_player.push(data.player_name);
	mongoClient.connect(MONGOLAB_URI, function(err, db) {
		assert.equal(null, err);
			db.collection('Room').insertOne({
				"room_name" : room_name,
				"room_password" : data.room_password,
				"host" : data.player_name,
				"list_players" : tab_player,
				"number_players_max" : 5,
				"GPS" : layout,
				"distance_min" : data.distance_min,
				"slot_empty" : 4,
                "visibility" : false,
                "is_password" : data.is_password
			},
			function(err, result) {
				try {
					assert.equal(err, null);
          socket.join(room_name);
					emit(socket, 'create_solo_room_response', { 'error_code' : 0, "msg" : "Create successful", "room_name" : room_name, "map": layout});
				}
				catch (e) { // non-standard
					console.log(e.name + ': ' + e.message);
					emit(socket, 'create_solo_room_response', { 'error_code' : 1, "msg" : "Room name already used."});
				}
			db.close();
		});
	});
}


function join_room(data, socket){
    mongoClient.connect(MONGOLAB_URI, function(err, db) {
        assert.equal(null, err);
		var found = false;
        var cursor = db.collection('Room').find( { "room_name": data.room_name,"password" : data.password } );
        cursor.each(function(err, doc) {
            assert.equal(err, null);
            if (doc != null) {
                if(doc.list_players.indexOf(data.player_name)== -1){
    				found = true;
                    if(doc.slot_empty > 0){
                        doc.list_players.push(data.player_name);
                        doc.slot_empty--;
                        console.log('Nombre de slot vide restant :', doc.slot_empty);
                        db.collection('Room').update(
                            { "room_name": data.room_name },
                            {
    							$set: {
    								"list_players": doc.list_players,
    								"slot_empty": doc.slot_empty
    							}                        
    						});
                        socket.join(data.room_name); //subscribe to the pub sub
                        emit(socket, 'response_join', { 'error_code' : 0, "msg" : "Join successful"});
						setTimeout(function() { emit_broadcast(data.room_name, 'list_player', doc.list_players); }, 100);                        
                    }
                    else {
    					emit(socket, 'response_join', { 'error_code' : 2, "msg" : "Room full"});
                    }
                }
                else{
                   emit(socket, 'response_join', { 'error_code' : 3, "msg" : "Player already in the room"}); 
                }
            }
            if (!found) {
				emit(socket, 'response_join', { 'error_code' : 1, "msg" : "Room not found"});
            }
            db.close();
        });
    });
}

function leave_room(data, socket){
    // emit list player
    mongoClient.connect(MONGOLAB_URI, function(err, db) {
        assert.equal(null, err);
		var found = false;
        var cursor = db.collection('Room').find( { "room_name": data.room_name } );
        cursor.each(function(err, doc) {
            assert.equal(err, null);
            if (doc != null) {
				found = true;
                if(doc.host==data.player_name){
                    console.log("Host left the game, kicking players off the room");
					emit_broadcast(data.room_name, 'kick', data);
                }
                doc.slot_empty++;
                if(doc.slot_empty==doc.number_players_max){
                    //last player left the room delete the room directly
                    console.log('No more player in the room, deleting the room');
                    db.collection('Room').remove( { "room_name": data.room_name } );
                    console.log('Room deleted');
                }
                else{
                    // Remove player from the list player
                    var index = doc.list_players.indexOf(data.player_name);
                    if (index > -1) {
                        doc.list_players.splice(index, 1);
                    }
                    // update the database
                    console.log('Nombre de slot vide restant :', doc.slot_empty);
                    db.collection('Room').update(
                        { "room_name": data.room_name },
                        {
                            $set: {
                                "list_players": doc.list_players,
                                "slot_empty": doc.slot_empty
                            }                        
                        });
                    console.log("Player list : " + doc.list_players);
					emit_broadcast(data.room_name, 'list_player', doc.list_players);
                }
                emit(socket, 'response_quit', { 'error_code' : 0, "msg" : "Successfully left the room"});
                socket.leave(data.room_name);
            }
            if (!found) {
                emit(socket, 'response_quit', { 'error_code' : 1, "msg" : "Room not found"});
            }
            db.close();
        });
    });
}

function set_room_invisible(data){
    mongoClient.connect(MONGOLAB_URI, function(err, db) {
        assert.equal(null, err);
        var cursor = db.collection('Room').find( { "room_name": data.room_name } );
        cursor.each(function(err, doc) {
            assert.equal(err, null);
            if (doc != null) {
                db.collection('Room').update(
                    { "room_name": data.room_name },
                    {
                        $set: {
                            "visibility": false,
                        }                    
                });
                console.log('Set invisible succeed with room', data.room_name);
            }
            db.close();
        });
    });
}

