'use strict';

// Intial WEBRTC setup
let config = {
  'iceServers': [
    {
      'url': 'stun:stun.l.google.com:19302'
    },
    {
      "urls": "turn:13.27.10.1:3000?transport=tcp",
      "username": "shubham",
      "credential": "thunderBeast"
    }
  ]
};
let socket = io.connect();
let myID;
let myRoom;
let dataChannel;
let opc = {}; 
let apc = {}; 
let offerChannel = {}; 
let sendChannel = {};

let defaultChannel = socket;  
let privateChannel = socket;  

let responseScreen = document.getElementById('responseScreen');
let localScreen = document.getElementById('localScreen');
let requestScreen = document.getElementById('requestScreen');
let globalText = document.getElementById('globalText');
let globalBtn = document.getElementById('globalBtn');
let privateText = document.getElementById('privateText');


globalBtn.addEventListener('click', globalSend, false);


globalBtn.disabled = true;

// Ask room to join
let isInitiator;
let room = window.location.hash.substring(1);
if (!room) {
  // room = window.location.hash = randomToken();
  let temp = ""; 
  while(temp.length == 0) { 
    temp = prompt('Enter Room Name'); 
  } 
  room = window.location.hash = temp; 
}
if (location.hostname.match(/localhost|127\.0\.0/)) {
  socket.emit('ipaddr');
}

// Main Setup
function joinRoom(roomName) {
  myRoom = roomName;
  myID = generateID();
  alert(`Your ID is ${myID}.`)

  console.log('My Id: ' + myID);

  setDefaultChannel();

  if(room != '') {
    socket.emit('create or join', {room: myRoom, id: myID});
  }

  setPrivateChannel();

  window.onbeforeunload = function (_) {
    defaultChannel.emit('message', { type: 'bye', from: myID });
  }
}

joinRoom(room);

function setDefaultChannel() {
  defaultChannel.on('ipaddr', function(ipaddr) {
    console.log('Server IP address is: ' + ipaddr);
  });

  defaultChannel.on('created', function(room) {
    console.log('Created room', room, '- my client ID is', myID);
    isInitiator = true;
    setUpDone();
  });

  defaultChannel.on('joined', function(room) {
    console.log('This peer has joined room', room, 'with client ID', myID);
    isInitiator = false;
    setUpDone();
  });

  defaultChannel.on('full', function(room) {
    alert('Room ' + room + ' is full. We will create a new room for you.');
    window.location.hash = '';
    window.location.reload();
  });

  defaultChannel.on('log', function(array) {
    console.log.apply(console, array);
  });

  defaultChannel.on('ready', function(newParticipantID) {
    console.log('Socket is ready');
    appender(newParticipantID, 'joined the room.', localScreen);
  });

  // For creating offers and receiving answers(of offers sent).
  defaultChannel.on('message', function(message) {
    if(message.type === 'newparticipant') {
      console.log('Client received message for New Participation:', message);
      let partID = message.from;

      offerChannel[partID] = socket; // same communication channel to new participant

      offerChannel[partID].on('message', function(msg) {
        if(msg.dest === myID) {
          if(msg.type  === 'answer') {
            console.log('Got Answer.')
            opc[msg.from].setRemoteDescription(new RTCSessionDescription(msg.snDescription), function() {}, logError);
          } else if(msg.type === 'candidate') {
            console.log('Got ICE Candidate from ' + msg.from);
            opc[msg.from].addIceCandidate(new RTCIceCandidate({ 
              candidate: msg.candidate, 
              sdpMid: msg.id, 
              sdpMLineIndex: msg.label, 
            }));
          }
        }
      });
      createOffer(partID);
    } else if(message.type === 'bye') {
      ParticipationClose(message.from);
    }
  });
}

function setPrivateChannel() {
  // For receiving offers or ice candidates
  privateChannel.on('message', function(message) {
    if(message.dest === myID) {
      console.log('Client received message(Offer or ICE candidate):', message);
      if(message.type === 'offer') {
        createAnswer(message, privateChannel, message.from);
      } else if(message.type === 'candidate') {
        apc[message.from].addIceCandidate(new RTCIceCandidate({ 
          candidate: message.candidate, 
          sdpMid: message.id, 
          sdpMLineIndex: message.label, 
        }));
      }
    }
  })
}

// when someone in room says Bye
function ParticipationClose(from) {
  console.log('Bye Received from client: ' + from);

  if(opc.hasOwnProperty(from)) {
    opc[from].close();
    opc[from] = null;
  }

  if(apc.hasOwnProperty(from)) {
    apc[from].close();
    apc[from] = null;
  }

  if(sendChannel.hasOwnProperty(from)) {
    delete sendChannel[from];
  }

  appender(from, 'left the room', localScreen);
}

// Create Offer
function createOffer(partID) {
  console.log('Creating an offer for: ' + partID);
  opc[partID] = new RTCPeerConnection(config);
  opc[partID].onicecandidate = function(event) {
    console.log('IceCandidate event:', event);
    if (event.candidate) {
      offerChannel[partID].emit('message', {
        type: 'candidate',
        label: event.candidate.sdpMLineIndex,
        id: event.candidate.sdpMid,
        candidate: event.candidate.candidate,
        from: myID,
        dest: partID
      });
    } else {
      console.log('End of candidates.');
    }
  };

  try {
    console.log('Creating Send Data Channel');
    sendChannel[partID] = opc[partID].createDataChannel('exchange', {reliable: false});
    onDataChannelCreated(sendChannel[partID], 'send');
  
    let LocalSession = function (partID) {
      return function (sessionDescription) {
        let channel = offerChannel[partID];
  
        console.log('Local Session Created: ', sessionDescription);
        opc[partID].setLocalDescription(sessionDescription, function() {}, logError);
        
        console.log('Sending Local Description: ', opc[partID].localDescription);
        channel.emit('message', {snDescription: sessionDescription, from: myID, dest: partID, type: 'offer'});
      }
    }
    opc[partID].createOffer(LocalSession(partID), logError);
  } catch(e) {
    console.log('createDataChannel failed with exception: ' + e);
  }
}


// Create Answer
function createAnswer(msg, channel, to) {
  console.log('Got offer. Sending answer to peer.');
  apc[to] = new RTCPeerConnection(config);
  apc[to].setRemoteDescription(new RTCSessionDescription(msg.snDescription), function() {}, logError);
  
  apc[to].ondatachannel = function(event) {
    console.log('onReceivedatachannel:', event.channel);
    sendChannel[to] = event.channel;
    onDataChannelCreated(sendChannel[to], 'receive');
  };

  let LocalSession = function (channel) {
    return function (sessionDescription) {
      console.log('Local Session Created: ', sessionDescription);
      apc[to].setLocalDescription(sessionDescription, function() {}, logError);
      console.log('Sending answer to ID: ', to);
      channel.emit('message', {snDescription: sessionDescription, from: myID, dest: to, type: 'answer'});
    }
  }
  apc[to].createAnswer(LocalSession(channel), logError);

  appender(to, ' is in the room', localScreen);
}

// Data Channel Setup
function onDataChannelCreated(channel, type) {
  console.log('onDataChannelCreated:' + channel + ' with ' + type + ' state');

  channel.onopen = ChannelStateChangeOpen(channel);
  channel.onclose = ChannelStateChangeClose(channel);

  channel.onmessage = receiveMessage();
}

function ChannelStateChangeClose(channel) {
  return function() {
    console.log('Channel closed: ' + channel);
  }
}

function ChannelStateChangeOpen(channel) {
  return function() {
    console.log('Channel state: ' + channel.readyState);

    let open = checkOpen();
    enableDisable(open);
  }
}

// Check data channel open
function checkOpen() {
  let open = false;
  for(let channel in sendChannel) {
    if(sendChannel.hasOwnProperty(channel)) {
      open = (sendChannel[channel].readyState == 'open');
      if(open == true) {
        break;
      }
    }
  }
  return open;
}

// Enable/ Disable Buttons
function enableDisable(open) {
  if(open) {
    console.log('CHANNEL opened!!!');
    globalBtn.disabled = false;
    isInitiator = true;
  } else {
    console.log('CHANNEL closed!!!');
    globalBtn.disabled = true;
  }
}

// new joinee sends a message to peers for connection
function setUpDone() {
  console.log('Initial Setup Done ...');
  socket.emit('message', { type: 'newparticipant', from: myID }, myRoom);
}



function receiveMessage() {
  let count, currCount, str;
  return function onmessage(event) {
    // console.log(event.data);
    if(isNaN(event.data) == false) {
      count = parseInt(event.data);
      currCount = 0;
      str = "";
      console.log(`Expecting a total of ${count} characters.`);
      return;
    }

    let data = event.data;
    str += data;
    currCount += str.length;
    console.log(`Received ${currCount} characters of data.`);

    if(currCount == count) {
      console.log(`Rendering Data`);
      console.log(str);
      renderMessage(str);
    }
  };
}



function globalSend() {
  // Split message.
  let CHUNK_LEN = 4000; // 64000

  let resObj = {};
  resObj['sender'] = myID;
  resObj['type'] = 'request';
  if(globalText.value === "") {
    alert("Nothing to send");
    return;
  }
  resObj['response'] = globalText.value;

  let data = JSON.stringify(resObj);

  let len = data.length;
  let n = len / CHUNK_LEN | 0;

  if (!sendChannel) {
    alert('Connection has not been initiated. Get two peers in the same room first');
    logError('Connection has not been initiated. ' + 'Get two peers in the same room first');
    return;
  } 

  // length of data
  for(let key in sendChannel) {
    if(sendChannel.hasOwnProperty(key) && sendChannel[key].readyState === 'open') {
      console.log("Global: Sending a data of length: " + len);
      sendChannel[key].send(len);
    }
  }

  // split the text and send in chunks of about 64KB
  for(let key in sendChannel) {
    if(sendChannel.hasOwnProperty(key) && sendChannel[key].readyState === 'open') {
      for (let i = 0; i < n; i++) {
        let start = i * CHUNK_LEN,
        end = (i + 1) * CHUNK_LEN;
        console.log(start + ' - ' + (end - 1));
        sendChannel[key].send(data.substr(start, end));
      }
    }
  }

  // send the remainder
  for(let key in sendChannel) {
    if(sendChannel.hasOwnProperty(key) && sendChannel[key].readyState === 'open') {
    if (len % CHUNK_LEN) {
      console.log(n * CHUNK_LEN + ' - ' + len);
      sendChannel[key].send(data.substr(n * CHUNK_LEN));
    }}
  }

  console.log('Sent all Data!');
  responseScreen.appendChild(document.createElement('hr'));
  globalText.value = "";
  renderMessage(data);
}

function privateSend(target, query) {
  // Split message.
  let CHUNK_LEN = 4000; // 64000

  let resObj = {};
  resObj['sender'] = myID;
  resObj['type'] = 'response';
  resObj['response'] = randomx();

  let data = JSON.stringify(resObj);

  let len = data.length;
  let n = len / CHUNK_LEN | 0;

  if (!sendChannel[target]) {
    alert('Connection has not been initiated, or target is not in room.');
    logError('Connection has not been initiated, ' + 'or target is not in room.');
    return;
  } 

  // length of data
  if(sendChannel[target].readyState === 'open') {
    console.log("Private: Sending a data of length: " + len);
    sendChannel[target].send(len);
  }

  // split the text and send in chunks of about 64KB
  if(sendChannel[target].readyState === 'open') {
    for (let i = 0; i < n; i++) {
      let start = i * CHUNK_LEN,
      end = (i + 1) * CHUNK_LEN;
      console.log(start + ' - ' + (end - 1));
      sendChannel[target].send(data.substr(start, end));
    }
  }

  // send the remainder
  if(sendChannel[target].readyState === 'open') {
    if (len % CHUNK_LEN) {
      console.log(n * CHUNK_LEN + ' - ' + len);
      sendChannel[target].send(data.substr(n * CHUNK_LEN));
    }
  }

  console.log('Sent all Data!');
  appender(target, query, requestScreen);
}

function renderMessage(data) {
  let obj = JSON.parse(data);
  let type = obj.type;
  let sender = obj.sender;
  let text = obj.response;
  
  if(type === 'request') {
    (sender === myID) && appenderResponse(sender, text, responseScreen);
    (sender !== myID) && privateSend(sender, text) && appender(sender, text, requestScreen);
  } else if(type === 'response' && sender !== myID) {
    appenderResponse(sender, text, responseScreen);
  } else {
    appender(sender, text, localScreen);
  }
}

function appender(id, msg, Chat) {
  let li = document.createElement('li');
  let strong = document.createElement('strong');
  let span = document.createElement('span');

  strong.appendChild(document.createTextNode(`${id}: `));
  span.appendChild(document.createTextNode(msg));
  li.appendChild(strong);
  li.appendChild(span);
  
  Chat.appendChild(li);
  Chat.scrollTop = Chat.scrollHeight;
}

function appenderResponse(id, msg, Chat) {
  let li = document.createElement('li');

  if(id === myID && Chat === responseScreen) {
    let strong = document.createElement('strong');
    strong.appendChild(document.createTextNode(`${msg.toUpperCase()}`));
    li.appendChild(strong);
  } else {
    let strong = document.createElement('strong');
    strong.appendChild(document.createTextNode(`${id}: `));
    let anchor = document.createElement('a');
    anchor.appendChild(document.createTextNode(msg));
    anchor.href = msg;
    anchor.target = "_blank";
    li.appendChild(strong);
    li.appendChild(anchor);
  }

  Chat.appendChild(li);
  Chat.scrollTop = Chat.scrollHeight;
}

// Generator for Room ID
function randomToken() {
  return Math.floor((1 + Math.random()) * 1e16).toString(16).substring(1);
}

// Generator for USER ID
function generateID() {
  let s4 = function () {
    return Math.floor(Math.random() * 0x10000).toString(16);
  };
  return s4() + '-' +  s4(); 
}

function logError(err) {
  if (!err) return;
  if (typeof err === 'string') {
    console.warn(err);
  } else {
    console.warn(err.toString(), err);
  }
}

var urls = ["https://google.com", "https://ebay.com",
            "https://amazon.com", "https://msn.com",
            "https://yahoo.com",  "https://wikipedia.org"];

function randomx() {
  let idx = Math.floor(Math.random() * urls.length);
  return urls[idx];
}