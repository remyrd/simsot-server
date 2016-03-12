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
        if(data.pseudo != null && data.password != null && data.pseudo != "" && data.password != ""){
            insertUser(data,socket);   
        }
        else {
            emit_response_subscribe(socket, { 'error_code' : 2, "msg" : "Field empty !"});
        }
    });

    socket.on('connect_user', function(data){
        check_authentification(data,socket);
    });
	
    socket.on('get_list_room', function(data){
        // TODO : a prendre en parametre la pos gps et renvoyer les rooms trié par distances
        emit_list_room(socket);
    });

    socket.on('new_room', function(data){
        create_room(data,socket);
    });

    /*** User creates/joins room ***/
    socket.on('join', function(data){
        console.log(data.player_name + " tries to join the room " + data.room_name);
        join_room(data,socket);
    });
        
        
    /*** User leaves room ***/
    socket.on('leave',function(data){
        console.log(data.player_name + " left the room " + data.room_name);
        leave_room(data,socket);
    });

	/*** Player in a room kicked if host leaves room ***/
    socket.on('kick',function(data){
        console.log("kicking player");
    });

	/*** Character selection screen ***/
    socket.on('character_choice',function(data){
		console.log("Player " + data.player_name + " chose " + data.character);
		console.log(data);
		listener.sockets.in(data.room_name).emit('character_choice_response', data);		
    });

	/*** Start the game ***/
    socket.on('game_start', function(data){
        console.log("Game start");
		console.log(data);
        set_room_invisible(data);
        listener.sockets.in(data.room_name).emit('game_start_response', {"error_code": 0 });
    });

    socket.on("character_timeout_ended", function(data){
         console.log("Character timeout ended");
         console.log(data);
         listener.sockets.in(data.room_name).emit('character_timeout_ended_response', {"error_code": 0 });
    });

    /*** User data distribution on the room ***/
    socket.on('character_position', function(data){
        listener.sockets.in(data.room_name).emit('character_position_response', data);
    });

	// En cas de problème
	socket.on('error', function (err) { 
		console.error(err.stack); 
		//socket.destroy(); // end/disconnect/close/destroy ?
	});
});

function emit_response_subscribe(socket,message){
	socket.emit('response_subscribe',message);    
	console.log("Message de type 'response_subscribe' envoyé : " + JSON.stringify(message));
};

function emit_response_connect(socket,message){
	socket.emit('response_connect',message);   
	console.log("Message de type 'response_connect' envoyé : " + JSON.stringify(message)); 
};

function emit_list_room(socket){
    console.log("Trying to get the rooms");
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
            console.log({'error_code' : 2, "rooms" : data});
            socket.emit('list_room', {'error_code' : 2, "rooms" : data});
            db.close();
        });    
    });
}

// MongodB - subscribe

function insertUser(data,socket) {
    console.log("Trying to insert", data.pseudo, " with password ", data.password);
	
	mongoClient.connect(MONGOLAB_URI, function(err, db) {
		assert.equal(null, err);
		db.collection('User').insertOne({
				"pseudo" : data.pseudo,
				"password" : data.password
			}, 
			function(err, result) {
				try {
					assert.equal(err, null);
					console.log("Inserted user " + data.pseudo);
					emit_response_subscribe(socket, { 'error_code' : 0, "msg" : "Registered"});
				}
				catch (e) { // non-standard
					console.log("Already existing user " + data.pseudo);
					console.log(e.name + ': ' + e.message);
					emit_response_subscribe(socket, { 'error_code' : 1, "msg" : "Already used login !"});
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
	console.log("Trying to connect ", data.pseudo, " with password ", data.password);
    
	mongoClient.connect(MONGOLAB_URI, function(err, db) {
		assert.equal(null, err);
		var found = false;
		var cursor = db.collection('User').find( { "pseudo": data.pseudo,"password" : data.password } );
		cursor.each(function(err, doc) {
			assert.equal(err, null);
			if (doc != null) {
				console.log("Found : " + data.pseudo);
				found = true;
				emit_response_connect(socket, { 'error_code' : 0, "msg" : "Connected"} );
			}
			if (!found) {
				console.log("Not found");
				emit_response_connect(socket, { 'error_code' : 1, "msg" : "Authentification failed !"});
			}
			db.close();
		});
	});
};

function create_room(data, socket){
    console.log("Trying to insert ", data.room_name, " with host ", data.host);
	var tab_player = [];
	tab_player.push(data.host);
	mongoClient.connect(MONGOLAB_URI, function(err, db) {
		assert.equal(null, err);
			db.collection('Room').insertOne({
				"room_name" : data.room_name,
				"room_password" : data.room_password,
				"host" : data.host,
				"list_players" : tab_player,
				"number_players_max" : data.number_players_max,
				"GPS" : data.GPS,
				"distance_min" : data.distance_min,
				"slot_empty" : data.number_players_max -1,
                "visibility" : true
			},
			function(err, result) {
				try {
					console.log("room_name : " + data.room_name + ", host : " + data.host);
					assert.equal(err, null);
                    socket.join(data.room_name);
					console.log("Inserted Room !!!");
					socket.emit('response_create', { 'error_code' : 0, "msg" : "Create successful"});		
                    console.log("Player list : ", tab_player);
                    socket.emit('list_player', tab_player);
				}
				catch (e) { // non-standard
					console.log(e.name + ': ' + e.message);
					socket.emit('response_create', { 'error_code' : 1, "msg" : "Creation fail"});
                    console.log("Doublon présent !!!");
				}
			db.close();
		});
	});

}

function join_room(data, socket){
    console.log('Player :', data.player_name);
    console.log('Trying to join the room :', data.room_name);
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
                        console.log(data.player_name + " joined the room " + data.room_name + " successfully");
                        socket.emit('response_join', { 'error_code' : 0, "msg" : "Join successful"});
						setTimeout(function() { listener.sockets.in(data.room_name).emit('list_player',doc.list_players); }, 100);                        
                    }
                    else {
                        console.log("Room full");
    					socket.emit('response_join', { 'error_code' : 2, "msg" : "Room full"});
                    }
                }
                else{
                   console.log("Player already in the room !!!");
                   socket.emit('response_join', { 'error_code' : 3, "msg" : "Player already in the room"}); 
                }
            }
            if (!found) {
                console.log("Room not found");
				socket.emit('response_join', { 'error_code' : 1, "msg" : "Room not found"});
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
				console.log(data.player_name + " left the room " + data.room_name);
                socket.emit('response_quit', "Successfully left the room");
                socket.leave(data.room_name);
            }
            if (!found) {
                console.log("Room not found: " + data.room_name);
                socket.emit('response_quit', "Room not found");
            }
            db.close();
        });
    });
}

function set_room_invisible(data){
    console.log('Setting invisible :', data.room_name);
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
                console.log('Set invisible :', data.room_name);
            }
            db.close();
        });
    });
}