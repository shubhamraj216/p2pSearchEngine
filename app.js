'use strict';

let os = require('os'),
    express = require('express'),
    bodyParser = require('body-parser'),
    morgan = require('morgan'),
    http = require('http'),
    socketIO = require('socket.io'),
    rooms = [];

const app = express();

app.use(bodyParser.json());
app.use(morgan("dev"));
app.set("view engine", "ejs");
app.use(express.static(__dirname + '/public'));
app.get('/', function(req, res) {
  res.render('client');
})

let server = http.createServer(app);

let port = 3000, hostname = 'localhost';
server.listen(port, hostname, () => {
  console.log(`Server is listening on port http://${hostname}:${port}`);
});

let io = socketIO(server);

io.sockets.on('connection', function(socket) {
  function log() {
    let array = ['Message from server:'];
    array.push.apply(array, arguments);
    socket.emit('log', array);
  }

  socket.on('message', function(message) {
    log('Client said this: ', message);
    log('Room: ', socket.room);
    socket.broadcast.to(socket.room).emit('message', message);
  });

  socket.on('create or join', function(message) {
    let room = message.room;
    socket.room = room;
    let clientID = message.id;

    log('Received request to create or join room ' + room);

    let clientsInRoom = io.sockets.adapter.rooms[room];
    let numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
    log('Room ' + room + ' now has ' + numClients + ' client(s)');
    log(rooms);
    
    if (numClients === 0) {
      rooms.push(room);
      socket.join(room);
      log('Client ID ' + clientID + ' created room ' + room);
      socket.emit('created', room);
    } else {
      log('Client ID ' + clientID + ' joined room ' + room);
      socket.join(room);
      socket.emit('joined', room);
    } 
    io.sockets.in(room).emit('ready', clientID);
  });

  socket.on('ipaddr', function() {
    log("IPADDR:");
    let ifaces = os.networkInterfaces();
    for (let dev in ifaces) {
      ifaces[dev].forEach(function(details) {
        if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
          socket.emit('ipaddr', details.address);
        }
      });
    }
  });
});
