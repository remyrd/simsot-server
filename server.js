var http = require("http");
var url = require('url');
var fs = require('fs');
var io = require('socket.io');
var Redis = require('ioredis');

//Redis client
var sub = new Redis(process.env.REDISCLOUD_URL);
var pub = new Redis(process.env.REDISCLOUD_URL);


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

server.listen(process.env.PORT);
sub.set('foo', '');
sub.subscribe('foo', function(channels, count){
    //subscribed
});



var listener = io.listen(server);
listener.sockets.on('connection', function(socket){
    //receive data
    socket.emit('prout',{'prout':'hello prout'});
    socket.on('client_data', function(data){
        console.log(data);
        pub.publish('foo',data.nom+":"+data.letter);
    });

    sub.on('message', function(channel, message){
        if(channel=='foo'){
            console.log(message);
            socket.emit('player_data',message);    
        }
    });
});
