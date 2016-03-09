var http = require("http");
var url = require('url');
var fs = require('fs');
var assert = require('assert');

var io = require('socket.io');
var mongoClient = require('mongodb').MongoClient;
var dboperation = require('./dboperation.js');
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
            dboperation.insertUser(data,socket);
        }
        else {
            dboperation.emit_response_subscribe(socket, { 'error_code' : 2, "msg" : "Field empty !"});
        }
    });

    socket.on('connect_user', function(data){
        dboperation.check_authentification(data,socket);
    });
	
    socket.on('get_list_room', function(data){
        // TODO : a prendre en parametre la pos gps et renvoyer les rooms trié par distances
        emit_list_room(socket);
    });

    socket.on('new_room', function(data){
        dboperation.create_room(data,socket);
    });

    /*** User creates/joins room ***/
    socket.on('join', function(data){
        console.log(data.player_name + " tries to join the room " + data.room_name);
        dboperation.join_room(data,socket);
    });
        
        
    /*** User leaves room ***/
    socket.on('leave',function(data){
        console.log(data.player_name + " left the room " + data.room_name);
        dboperation.leave_room(data,socket);
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
        dboperation.set_room_invisible(data);
        listener.sockets.in(data.room_name).emit('game_start_response', {"error_code": 0 });
    });

    socket.on("character_timeout_ended", function(data){
         console.log("Character timeout ended");
         console.log(data);
         listener.sockets.in(data.room_name).emit('character_timeout_ended_response', {"error_code": 0 });
    });

    /*** User data distribution on the room ***/
    socket.on('character_position', function(data){
        console.log("Player: " + data.player_name + " is at x: " + data.x + " and y: " + data.y);
		console.log(data);
        listener.sockets.in(data.room_name).emit('character_position_response', data);
    });

	// En cas de problème
	socket.on('error', function (err) { 
		console.error(err.stack); 
		//socket.destroy(); // end/disconnect/close/destroy ?
	});
});