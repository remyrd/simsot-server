var http = require("http");
var url = require('url');
var fs = require('fs');
var assert = require('assert');

var io = require('socket.io');
var Redis = require('ioredis');
var mongoClient = require('mongodb').MongoClient;

// Switch environment variables local/heroku
switch(process.argv[2]){
    case "dev":
        var sub = new Redis('192.168.99.100',6379);
        var pub = new Redis('192.168.99.100',6379);
        var MONGOLAB_URI = "mongodb://localhost:27017";
        var port=8001;
        console.log("development config");
        break;

    default:
        var sub = new Redis(process.env.REDISCLOUD_URL);
        var pub = new Redis(process.env.REDISCLOUD_URL);
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
sub.set('foo', '');
sub.subscribe('foo', function(channels, count){
    //subscribed
});

var listener = io.listen(server);
listener.sockets.on('connection', function(socket){
    
    socket.emit('prout',{'prout':'hello prout'});
    
    socket.on('join', function(room_name){
      socket.join(room_name);
      console.log("joined ",room_name);
      socket.emit('add_room',room_name);
    });
    
    socket.on('leave',function(room_name){
      socket.leave(room_name);
      console.log("left ",room_name);
    });

    socket.on('client_data', function(data){
        console.log(data);
        listener.sockets.in(data.room).emit('player_data',JSON.stringify(data));
    });

    //Redis sub distribution
    /*sub.on('message', function(channel, message){
        if(channel=='foo'){
            console.log(message);
            socket.emit('player_data',message);    
        }
    });*/

    socket.on('subscribe', function(data){
        if(data.pseudo!= null && data.password != null && data.pseudo!= "" && data.password != ""){
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
        create_room(data);
    });
	
	// En cas de problème
	socket.on('error', function (err) { 
		console.error(err.stack); 
		//socket.destroy(); // end/disconnect/close/destroy ?
	})
});

function emit_response_subscribe(socket,message){
	socket.emit('response_subscribe',message);    
	console.log("Message de type 'response_subscribe' envoyé : " + message);
};

function emit_response_connect(socket,message){
	socket.emit('response_connect',message);   
	console.log("Message de type 'response_connect' envoyé : " + message); 
};

// MongodB - subscribe

function insertUser(data,socket) {
    console.log("Trying to insert ", data.pseudo, " with password ", data.password);
    mongoClient.connect(MONGOLAB_URI, function(err, db) {
        assert.equal(null, err);
        db.collection('User').insertOne({
                "pseudo" : data.pseudo,
                "password" : data.password
            }, 
            function(err, result) {
                try {
                    assert.equal(err, null);
                    console.log("Inserted USER !!!");
                    emit_response_subscribe(socket,"Registered");
                }
                catch (e) { // non-standard
                    console.log("Doublon found !!!");
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
	
    var found=0;
    
	mongoClient.connect(MONGOLAB_URI, function(err, db) {
		assert.equal(null, err);
		var cursor =db.collection('User').find( { "pseudo": data.pseudo,"password" : data.password } );
		cursor.each(function(err, doc) {
			assert.equal(err, null);
			if (doc != null) {
				console.log("Found : " + data.pseudo);
				found=1;
				emit_response_connect(socket,"Connected");
			}
			if (found ==0) {
				console.log("Not found");
				emit_response_connect(socket,"Authentification failed !");
			}
			db.close();
		});
	});
	return found;
};

function create_room(data){

  console.log("Trying to insert ", data.room_name, " with host : ", data.host);

      mongoClient.connect(MONGOLAB_URI, function(err, db) {
          assert.equal(null, err);
              db.collection('Room').insertOne({
                  "room_name" : data.room_name,
                  "room_password" : data.room_password,
                  "host" : data.host,
                  "list_players" : data.list_players,
                  "list_ennemies" : data.list_ennemies,
                  "number_players_max" : data.number_players_max,
                  "number_ennemies_max" : data.number_ennemies_max,
                  "GPS" : data.GPS,
                  "distance_min" : data.distance_min
              }, 
              function(err, result) {
                  try {
                      assert.equal(err, null);
                      console.log("Inserted Room !!!");
                  }
                  catch (e) { // non-standard
                      console.log("Doublon présent !!!");
                      console.log(e.name + ': ' + e.message);
                  }
              db.close();
          });
      });
      sub.set(data.room_name, '');
      sub.subscribe(data.room_name, function(channels, count){
        //subscribed to new room
      });

}

function connect_room(data){

}