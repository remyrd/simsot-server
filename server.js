var http = require("http");
var url = require('url');
var fs = require('fs');
var assert = require('assert');

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
		console.log("Recieved subscribe" + data);
        if(data.pseudo != null && data.password != null && data.pseudo != "" && data.password != ""){
            insertUser(data,socket);   
        }
        else {
            emit(socket, 'response_subscribe', { 'error_code' : 2, "msg" : "Field empty !"});
        }
    });

    socket.on('connect_user', function(data){
		console.log("Recieved connect_user" + data);
        check_authentification(data,socket);
    });
	
    socket.on('get_list_room', function(data){
        // TODO : a prendre en parametre la pos gps et renvoyer les rooms trié par distances
		console.log("Recieved get_list_room" + data);
        emit_list_room(socket);
    });

    socket.on('new_room', function(data){
		console.log("Recieved new_room" + data);
        create_room(data,socket);
    });

    socket.on('create_solo_room', function(data){
		console.log("Recieved create_solo_room" + data);
        create_solo_room(data,socket);
    });

    /*** User creates/joins room ***/
    socket.on('join', function(data){
		console.log("Recieved join" + data);
        join_room(data,socket);
    });
        
        
    /*** User leaves room ***/
    socket.on('leave',function(data){
		console.log("Recieved leave" + data);
        leave_room(data,socket);
    });

	/*** Player in a room kicked if host leaves room ***/
    socket.on('kick',function(data){
		console.log("Recieved kick" + data);
        console.log("kicking player");
    });

	/*** Character selection screen ***/
    socket.on('character_choice',function(data){
		console.log("Recieved character_choice" + data);
		listener.sockets.in(data.room_name).emit('character_choice_response', data);		
    });

	/*** Start the game ***/
    socket.on('game_start', function(data){
		console.log("Recieved game_start" + data);
        set_room_invisible(data);
        listener.sockets.in(data.room_name).emit('game_start_response', {"error_code": 0 });
    });

    socket.on("character_timeout_ended", function(data){
		console.log("Recieved character_timeout_ended" + data);
         listener.sockets.in(data.room_name).emit('character_timeout_ended_response', {"error_code": 0 });
    });

    /*** User data distribution on the room ***/
    socket.on('character_position', function(data){
		console.log("Recieved character_position" + data);
        listener.sockets.in(data.room_name).emit('character_position_response', data);
    });

	// En cas de problème
	socket.on('error', function (err) { 
		console.error(err.stack); 
		//socket.destroy(); // end/disconnect/close/destroy ?
	});
});

function emit(socket, title, message) {
	console.log("=====");
	console.log("Sending " + title);
	console.log(message);
	console.log("=====");
	socket.emit(title, message);    
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
                data.push({
                    "host" : doc.host,
                    "room_name" : doc.room_name,
                    "slot_empty" : doc.slot_empty,
                    "GPS" : doc.GPS
                });
            }
            emit(socket, 'list_room', {'error_code' : 2, "rooms" : data});
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
					emit(socket, 'response_subscribe', { 'error_code' : 1, "msg" : "Already used login !"});
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
				emit(socket, 'response_connect', { 'error_code' : 1, "msg" : "Authentification failed !"});
			}
			db.close();
		});
	});
};

function create_room(data, socket){
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
				"GPS" : data.GPS,
				"distance_min" : data.distance_min,
				"slot_empty" : data.number_players_max -1,
                "visibility" : true
			},
			function(err, result) {
				try {
					assert.equal(err, null);
                    socket.join(data.room_name);
					emit(socket, 'response_create', { 'error_code' : 0, "msg" : "Create successful", "room_name" : data.room_name, "host" : data.host});	
                    emit(socket, 'list_player', tab_player);
				}
				catch (e) { // non-standard
					console.log(e.name + ': ' + e.message);
					emit(socket, 'response_create', { 'error_code' : 1, "msg" : "Creation fail"});
				}
			db.close();
		});
	});
}

function create_solo_room(data, socket){
	var room_name = data.player_name + "_room";
    console.log("Trying to insert solo room ", room_name, " with player ", data.player_name);
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
				"GPS" : data.GPS,
				"distance_min" : data.distance_min,
				"slot_empty" : data.number_players_max -1,
                "visibility" : false
			},
			function(err, result) {
				try {
					assert.equal(err, null);
                    socket.join(room_name);
					console.log("Inserted Room !!!");
					emit(socket, 'create_solo_room_response', { 'error_code' : 0, "msg" : "Create successful", "room_name" : room_name});	
				}
				catch (e) { // non-standard
					console.log(e.name + ': ' + e.message);
					emit(socket, 'create_solo_room_response', { 'error_code' : 1, "msg" : "Creation fail"});
				}
			db.close();
		});
	});
}


function join_room(data, socket){
    mongoClient.connect(MONGOLAB_URI, function(err, db) {
        assert.equal(null, err);
		var found = false;
        var cursor = db.collection('Room').find( { "room_name": data.room_name } );
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
						setTimeout(function() { listener.sockets.in(data.room_name).emit('list_player',doc.list_players); }, 100);                        
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
                    console.log("Host left the game");
                    console.log("Kicking players off the room");
                    listener.sockets.in(data.room_name).emit('kick', data);
                }
                doc.slot_empty++;
                if(doc.slot_empty==doc.number_players_max){
                    //last player left the room delete the room directly
                    console.log('No more player in the room');
                    console.log('Deleting the room');
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
                    listener.sockets.in(data.room_name).emit('list_player',doc.list_players);
                }
                emit(socket, 'response_quit', "Successfully left the room");
                socket.leave(data.room_name);
            }
            if (!found) {
                emit(socket, 'response_quit', "Room not found");
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