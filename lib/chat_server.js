var socketio = require('socket.io');
var io;
var guestNumber = 1;
var nickNames = {};
var namesUsed = [];
var currentRoom = {};

function assignGuestName(socket, guestNumber, nickNames, namesUsed){
    var name = 'Guest' + guestNumber;

    // Associate guest name with client connection ID
    nickNames[socket.id] = name;

    // Let user know their guest name
    socket.emit('nameResult', {
        success: true,
        name: name
    });
    namesUsed.push(name);

    // Increment counter used to generate guest names
    return guestNumber + 1;
}


function joinRoom(socket, room){
    // Make user join room
    socket.join(room);

    // Note that user is now in this room
    currentRoom[socket.id] = room;

    // Let user know they're now in the new room
    socket.emit('joinResult', {
        room: room
    });

    // Let other users in the room know that the user has joined
    socket.broadcast.to(room).emit('message', {
        text: nickNames[socket.id] + ' has joined ' + room + '.'
    });

    // Determine what other users are in the same room as the user
    var usersInRoom = io.sockets.clients(room);

    // If other users exist, summarize who they are
    if(usersInRoom.length > 1){
        var usersInRoomSummary = 'Users currently in ' + room + ': ';
        for(var index in usersInRoom){
            var userSocketId = usersInRoom[index].id;
            if(userSocketId != socket.id){
                if(index > 0)
                    usersInRoom += ', ';
                usersInRoomSummary += nickNames[userSocketId];
            }
        }
        usersInRoomSummary += '.';
        socket.emit('message', {
            text: usersInRoomSummary
        });
    }
}

function handleNameChangeAttempts(socket, nickNames, namesUsed){
    // Add listener for nameAttempt events
    socket.on('nameAttempt', function(name){
        // Don't allow nicknames to begin with Guest
        if(name.indexOf('Guest') == 0){
            socket.emit('nameResult', {
                success: false,
                message: 'Names cannot begin with "Guest".'
            });
        } else {
            // If name isn't already registered, register it
            if(namesUsed.indexOf(name) == -1){
                var previousName = nickNames[socket.id];
                var previousNameIndex = namesUsed.indexOf(previousName);
                namesUsed.push(name);
                nickNames[socket.id] = name;

                // Remove previous name to make available to other clients
                delete namesUsed[previousNameIndex];

                socket.emit('nameResult', {
                    success: true,
                    name: name
                });

                socket.broadcast.to(currentRoom[socket.id]).emit('message',{
                    text: previousName + ' is now known as ' + name + '.'
                });
            } else {
                // Send error to client if name is already registered
                socket.emit('nameResult', {
                    success: false,
                    message: 'That name is already in use.'
                });
            }
        }
    });
}

function handleMessageBroadcasting(socket){
    socket.on('message', function(message){
        console.log('Message received: ' + message);
        socket.broadcast.to(message.room).emit('message', {
            text: nickNames[socket.id] + ': ' + message.text
        });
    });
}

function handleRoomJoining(socket){
    socket.on('join', function(room){
        socket.leave(currentRoom[socket.id]);
        joinRoom(socket, room.newRoom);
    });
}

function handleClientDisconnection(socket){
    socket.on('disconnect', function(){
        var nameIndex = namesUsed.indexOf(nickNames[socket.id]);
        delete namesUsed[nameIndex];
        delete nickNames[socket.id];
    });
}


exports.listen = function(server){

    io = socketio.listen(server);
    io.set('log level', 1);

    // Defines how each user connection will be handled
    io.sockets.on('connection', function(socket){
        // Assign user guest name when they connect
        guestNumber = assignGuestName(socket, guestNumber, nickNames, namesUsed);
        joinRoom(socket, 'Lobby');

        // Handle user messages, name-change attempts and room
        handleMessageBroadcasting(socket, nickNames);
        handleNameChangeAttempts(socket, nickNames, namesUsed);
        handleRoomJoining(socket);

        // Provides user with list of occupied rooms on request
        socket.on('rooms', function(){
            socket.emit('rooms', socket.manager.rooms);
        });

        // Define cleanup logic for when the user disconnects
        handleClientDisconnection(socket, nickNames, namesUsed);
    });
};