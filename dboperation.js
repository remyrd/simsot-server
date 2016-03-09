/**
 * Created by Remy on 09/03/2016.
 */
module.exports = {
    emit_response_subscribe: function(socket,message){
        socket.emit('response_subscribe',message);
        console.log("Message de type 'response_subscribe' envoyé : " + JSON.stringify(message));
    },

    emit_response_connect: function(socket,message){
        socket.emit('response_connect',message);
        console.log("Message de type 'response_connect' envoyé : " + JSON.stringify(message));
    },

    emit_list_room: function(socket){
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
                console.log(data);
                socket.emit('list_room',data);
                db.close();
            });
        });
    },

    // MongodB - subscribe

    insertUser: function(data,socket) {
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
                        this.emit_response_subscribe(socket, { 'error_code' : 0, "msg" : "Registered"});
                    }
                    catch (e) { // non-standard
                        console.log("Already existing user " + data.pseudo);
                        console.log(e.name + ': ' + e.message);
                        this.emit_response_subscribe(socket, { 'error_code' : 1, "msg" : "Already used login !"});
                    }
                    db.close();
                });
        });
    },

    clearDB: function() {
        console.log("Clearing");

        mongoClient.connect(MONGOLAB_URI, function(err, db) {
            assert.equal(null, err);
            db.collection('User').remove();
            console.log("Cleared !!!");
            db.close();
        });
    },

    // MongodB - connect

    check_authentification: function(data,socket) {
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
                    this.emit_response_connect(socket, { 'error_code' : 0, "msg" : "Connected"} );
                }
                if (!found) {
                    console.log("Not found");
                    this.emit_response_connect(socket, { 'error_code' : 1, "msg" : "Authentification failed !"});
                }
                db.close();
            });
        });
    },

    create_room: function(data, socket){
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

    },

    join_room: function(data, socket){
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
                            listener.sockets.in(data.room_name).emit('list_player',doc.list_players);
                            socket.emit('list_player',doc.list_players);
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
    },

    leave_room: function(data, socket){
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
    },

    set_room_invisible: function(data){
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
};