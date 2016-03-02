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
    
    var players = {[]};

    socket.on('subscribe', function(data){
        if(data.pseudo != null && data.password != null && data.pseudo != "" && data.password != ""){
            insertUser(data,socket);   
        }
        else {
            emit_response_subscribe(socket,"Champ vide !");
        }
    });

    socket.on('connect_user', function(data){
        check_authentification(data,socket);
    });

    socket.on('new_room', function(data){
        create_room(data,socket);
    });
	
    socket.on('get_list_room', function(data){
        // TODO : a prendre en parametre la pos gps et renvoyer les rooms trié par distances
        emit_list_room(socket);
    });

	// En cas de problème
	socket.on('error', function (err) { 
		console.error(err.stack); 
		//socket.destroy(); // end/disconnect/close/destroy ?
	});

    /*** User creates/joins room ***/
    socket.on('join', function(data){
        socket.join(data.room_name); //subscribe to the pub sub
        console.log(data.player_name + " tries to join the room " + data.room_name);
        join_room(data,socket);
    });
        
    /*** User leaves room ***/
    socket.on('leave',function(data){
        socket.leave(data.room_name);
        console.log(data.player_name + " left the room " + data.room_name);
    });

    /*** User data distribution on the room ***/
    socket.on('client_data', function(data){
        console.log(data);
        players.[data.pseudo] = {
            "x": data.x,
            "y": data.y
        }
        listener.sockets.in(data.room).emit('player_data',players);
    });
});

function emit_response_subscribe(socket,message){
	socket.emit('response_subscribe',message);    
	console.log("Message de type 'response_subscribe' envoyé : " + message);
};

function emit_response_connect(socket,message){
	socket.emit('response_connect',message);   
	console.log("Message de type 'response_connect' envoyé : " + message); 
};

function emit_list_room(socket){
    console.log("Trying to get the rooms");
    mongoClient.connect(MONGOLAB_URI, function(err, db) {
        assert.equal(null, err);
        var data = [];
        var i = 0;
		db.collection('Room').count(function(err, count) {
			var cursor = db.collection('Room').find();
			cursor.each( function(err, doc) {
				assert.equal(err, null);
				i++;
				if (doc != null) {
					data.push({
						"host" : doc.host,
						"room_name" : doc.room_name,
						"slot_empty" : doc.slot_empty,
						"GPS" : doc.GPS
					});
					console.log("Room found " + doc.room_name);					
				}
				if (i==count){
					socket.emit('list_room',data);
					console.log("Rooms sent");
					console.log(data);
				}
				db.close();
			});   
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
					emit_response_subscribe(socket,"Registered");
				}
				catch (e) { // non-standard
					console.log("Already existing user " + data.pseudo);
					console.log(e.name + ': ' + e.message);
					emit_response_subscribe(socket,"Already used login !");
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
		var cursor =db.collection('User').find( { "pseudo": data.pseudo,"password" : data.password } );
		cursor.each(function(err, doc) {
			assert.equal(err, null);
			if (doc != null) {
				console.log("Found : " + data.pseudo);
				emit_response_connect(socket,"Connected");
			}
			else {
				console.log("Not found");
				emit_response_connect(socket,"Authentification failed !");
			}
			db.close();
		});
	});
};

function create_room(data, socket){
    console.log("Trying to insert ", data.room_name, " with host ", data.host);

	mongoClient.connect(MONGOLAB_URI, function(err, db) {
		assert.equal(null, err);
			db.collection('Room').insertOne({
				"room_name" : data.room_name,
				"room_password" : data.room_password,
				"host" : data.host,
				"list_players" : data.list_players,
				"list_enemies" : data.list_enemies,
				"number_players_max" : data.number_players_max,
				"number_enemies_max" : data.number_enemies_max,
				"GPS" : data.GPS,
				"distance_min" : data.distance_min,
				"slot_empty" : data.number_players_max -1
			}, 
			function(err, result) {
				try {
					console.log("room_name : " + data.room_name + ", host : " + data.host);
					assert.equal(err, null);
					console.log("Inserted Room !!!");
					socket.emit('response_create', "Create successful");
				}
				catch (e) { // non-standard
					console.log("Doublon présent !!!");
					console.log(e.name + ': ' + e.message);
				}
			db.close();
		});
	});

}

function join_room(data, socket){
    mongoClient.connect(MONGOLAB_URI, function(err, db) {
        assert.equal(null, err);
        var cursor = db.collection('Room').find( { "room_name": data.room_name } );
        cursor.each(function(err, doc) {
            assert.equal(err, null);
            if (doc != null) {
                console.log("Trouvé ", data.room_name);
                if(doc.slot_empty > 0){
                    console.log('Nombre de slot vide :', doc.slot_empty);
                    
                    doc.list_players.push(data.player_name);
                    doc.slot_empty--;
                    db.collection('Room').update(
                        { "room_name": data.room_name },
                        {
							$set: {
								"list_players": doc.list_players,
								"slot_empty": doc.slot_empty
							}                        
						});
                    console.log(data.player_name + " joined the room " + data.room_name + " successfully");
                    socket.emit('response_join', "Join successful");				
                    console.log("Player list : " + doc.list_players);
                    socket.emit('list_player', doc.list_players);
                }

                else{
                    console.log("Room full.");
                }
            }
            else {
                console.log("Room not found.");
            }
            db.close();
        });
    });
}