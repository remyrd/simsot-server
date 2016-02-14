var http = require("http");
var url = require('url');
var fs = require('fs');
var connect = require('connect');
var assert = require('assert');

var io = require('socket.io');
var Redis = require('ioredis');
var mongoClient = require('mongodb').MongoClient();

//Redis client
var sub = new Redis(process.env.REDISCLOUD_URL);
var pub = new Redis(process.env.REDISCLOUD_URL);

//Mongo
var MONGOLAB_URI = process.env.MONGOLAB_URI;

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
        default:
            response.writeHead(404);
            response.write("opps this doesn't exist - 404");
            response.end();
            break;
    }
});

// Serveur - listener
var port = process.env.PORT || 3000;

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
    
    socket.on('client_data', function(data){
        console.log(data);
        //Redis publish
        pub.publish('foo',data.nom+":"+data.letter);
    });

    //Redis sub distribution
    sub.on('message', function(channel, message){
        if(channel=='foo'){
            console.log(message);
            socket.emit('player_data',message);    
        }
    });

    socket.on('subscribe', function(data){
		console.log("subscribe called with data", data);
        insertUser(data);
    });

    socket.on('connect_user', function(data){
		console.log("connect called with data", data);
        check_authentification(data);
    });
	
	// En cas de problème
	socket.on('error', function (err) { 
		console.error(err.stack); 
		//socket.destroy(); // end/disconnect/close/destroy ?
	})
});


// MongodB - subscribe

function insertUser(data) {

	console.log("Trying to insert ", data.pseudo, " with password ", data.password);

    var can_insert = check_insert_user(data);
    
    if(can_insert==1){
        mongoClient.connect('MONGOLAB_URI', function(err, db) {
            assert.equal(null, err);
            db.collection('User').insertOne({
                    "pseudo" : data.pseudo,
                    "password" : data.password
                }, 
                function(err, result) {
                    assert.equal(err, null);
                    console.log("Inserted USER ", data.pseudo);
                    db.close();
            });
        });
    }
    else {
        console.log("Check failed");
    }
  
};

// Check before insertion
function check_insert_user(data) {
	console.log("Checkpoint 1");
    
    var can_insert=0;
	
    if(data.pseudo!= null && data.password != null && data.pseudo!= "" && data.password != ""){
		console.log("Checkpoint 2");
        if(findUser(data)==0){
            can_insert=1;
                // !!!!!!!!!!!!!!!!!!!!!!!!!!!! BUG SUR LA DETECTION DE DOUBLONS !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        }
    }
    return can_insert;

};

function findUser(data) {
	console.log("Checkpoint 3");
	
    var found=0;
    
    mongoClient.connect('MONGOLAB_URI', function(err, db) {
    assert.equal(null, err);
    var cursor =db.collection('User').find( { "pseudo": data.pseudo } );
    cursor.each(function(err, doc) {
        assert.equal(err, null);
        if (doc != null) {
            console.log("Trouvé ", data.pseudo);
            found=1;
        }
        if (found ==0) {
            console.log("Pas Trouvé");
        }
        db.close();
    });
    });
    return found;
};

function clearDB() {
    console.log("Clearing");

    mongoClient.connect('MONGOLAB_URI', function(err, db) {
    assert.equal(null, err);
        db.collection('User').remove();
        console.log("Cleared !!!");
        db.close();
    });  
};


// MongodB - connect

function check_authentification(data) {
    var found=0;
    
    mongoClient.connect('MONGOLAB_URI', function(err, db) {
		assert.equal(null, err);
		var cursor =db.collection('User').find( { "pseudo": data.pseudo,"password" : data.password } );
		cursor.each(function(err, doc) {
			assert.equal(err, null);
			if (doc != null) {
				console.log("Trouvé");
				found=1;
			}
			if (found ==0) {
				console.log("Pas Trouvé");
			}
			db.close();
		});
    });
  return found;
};