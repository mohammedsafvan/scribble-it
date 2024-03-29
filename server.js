var express = require("express");
var app = express();
var http = require("http").createServer(app);
var io = require("socket.io")(http);
var words = require("./words.json");
var fs = require("fs");
var jsonRooms = [];
var rooms = [];
/*
A room looks like this:
var room = {
  name: 'room1',
  htmlName: 'room1',
  players: [player1, player2],
  theDrawer: playerX,
  brushColor:'000',
  brushSize: 10,
  currentWord: 'word',
  history: [],
  timeLeft: 91,
};
*/
updateRooms();

//Magical numbers
var roundTime = 61; //in seconds
var minMessageInterval = 200; //in milliseconds
var newDrawerDelay = 1000; //in milliseconds

app.use(express.static(__dirname + "/public"));

var port = process.env.PORT;
if (port == null || port == "") {
  port = 1234;
}
http.listen(port, function () {
  console.log("listening on port " + port);
});

// lower timer every second and check if time is out in server
setInterval(function () {
  for (let i = 0; i < rooms.length; i++) {
    // Taking one room
    rooms[i].timeLeft -= 1; // Decreasing the time
    if (rooms[i].timeLeft < 0 && rooms[i].players.length > 1) {
      io.to(rooms[i].name).emit("message", {
        text:
          'Time ran out! The word was "' +
          rooms[i].currentWord +
          '". Randomizing new drawer...',
        username: null,
      });
      resetTimer(rooms[i]);
      randomizeDrawer(rooms[i]);
      io.to(rooms[i].name).emit("allowedToDraw", {
        bool: false,
        word: null,
        user: rooms[i].theDrawer,
      });
      resetBrush(rooms[i]);
      randomizeWord(rooms[i]);
      setTimeout(function () {
        io.to(rooms[i].theDrawer.id).emit("allowedToDraw", {
          bool: true,
          word: rooms[i].currentWord,
          user: rooms[i].theDrawer,
        });
        resetCanvas(rooms[i]);
        resetTimer(rooms[i]);
      }, newDrawerDelay);
    }
  }
}, 1000);

//sync time every 10 s
setInterval(function () {
  for (var i = 0; i < rooms.length; i++) {
    io.to(rooms[i].name).emit("timeLeft", { time: rooms[i].timeLeft });
  }
}, 4000);

io.on("connection", function (socket) {
  var userInfo;
  var currentRoom;
  var messageTimestamp = Date.now();
  socket.emit("init");
  socket.on("connectInfo", function (info) {
    if (
      info.room == null ||
      info.room == "" ||
      info.username == null ||
      info.username == ""
    ) {
      socket.disconnect();
    } else {
      userInfo = {
        username: info.username,
        htmlusername: encodeHTML(info.username),
        id: socket.id,
        drawerPoints: 0,
        guesserPoints: 0,
        roomName: info.room,
      };
      socket.join(userInfo.roomName);
      currentRoom = getRoom(userInfo.roomName);
      if (currentRoom != undefined) {
        // pushing userInfo to currentRoom.players
        currentRoom.players.push(userInfo);

        socket.emit("history", {
          brushSize: currentRoom.brushSize,
          brushColor: currentRoom.brushColor,
          history: currentRoom.history,
        });
        socket.emit("allowedToDraw", {
          bool: false,
          word: null,
          user: currentRoom.theDrawer,
        });
      } else {
        currentRoom = {
          name: userInfo.roomName,
          htmlName: encodeHTML(userInfo.roomName),
          players: [userInfo],
          theDrawer: userInfo,
          brushColor: "",
          brushSize: 0,
          currentWord: "",
          history: [],
          timeLeft: roundTime,
          maxPoints: info.maxPoints,
        };
        rooms.push(currentRoom);
        randomizeWord(currentRoom);
        socket.emit("allowedToDraw", {
          bool: true,
          word: currentRoom.currentWord,
          user: userInfo,
        });
        resetTimer(currentRoom);
        resetBrush(currentRoom);
        resetCanvas(currentRoom);
        socket.broadcast.emit("message", {
          text: currentRoom.maxPoints,
          username: null,
        });
      }
      updateRooms();
      console.log(info.username + " connected");
      socket.to(userInfo.room).broadcast.emit("message", {
        text: userInfo.htmlusername + " has connected",
        username: null,
      });
      socket.emit("timeLeft", { time: currentRoom.timeLeft });
      io.to(currentRoom.name).emit("scoreBoard", currentRoom.players);
    }
  });

  

  // To clear the canvas
  socket.on("clearCanvas", (x) => {
    if (userInfo.id == currentRoom.theDrawer.id) {
      resetCanvas(currentRoom);
    }
  });

  // If anyone disconnects
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") {
      socket.connect();
    } else if (
      userInfo != undefined &&
      userInfo.roomName != null &&
      userInfo.roomName != "" &&
      userInfo.username != undefined &&
      userInfo.username != ""
    ) {
      console.log(userInfo.username + " disconnected");
      currentRoom.players = currentRoom.players.filter(
        (user) => user.id != userInfo.id
      );
      io.to(currentRoom.name).emit("scoreBoard", currentRoom.players);
      socket.to(currentRoom.name).broadcast.emit("message", {
        text: userInfo.htmlusername + " has disconnected",
        username: null,
      });
      if (userInfo.id == currentRoom.theDrawer.id) {
        resetCanvas(currentRoom);
        resetBrush(currentRoom);
        resetTimer(currentRoom);
        // If there are people left, randomize a new drawer
        if (currentRoom.players.length > 0) {
          randomizeDrawer(currentRoom);
          socket.to(currentRoom.name).broadcast.emit("allowedToDraw", {
            bool: false,
            word: null,
            user: currentRoom.theDrawer,
          });
          randomizeWord(currentRoom);
          io.to(currentRoom.theDrawer.id).emit("allowedToDraw", {
            bool: true,
            word: currentRoom.currentWord,
            user: currentRoom.theDrawer,
          });
          resetTimer(currentRoom);
        }
        // Remove room if it is empty
        else {
          rooms = rooms.filter((room) => room.name != currentRoom.name);
        }
      } else if (currentRoom.theDrawer.id == null) {
        rooms = rooms.filter((room) => room.name != currentRoom.name);
      }
      updateRooms();
    }
  });

  socket.on("message", function (message) {
    console.log(message.username);
    if (
      userInfo.id != currentRoom.theDrawer.id &&
      Date.now() - messageTimestamp > minMessageInterval
    ) {
      text = encodeHTML(message.text);
      if (message.text.toLowerCase() == currentRoom.currentWord) {
        io.to(currentRoom.name).emit("correctanswer", {
          text: "Correct!",
          user: message.username,
        });
        resetTimer(currentRoom);
        // Give points
        currentRoom.players.find(
          (user) => user.id == currentRoom.theDrawer.id
        ).drawerPoints += 1;
        currentRoom.players.find(
          (user) => user.id == userInfo.id
        ).guesserPoints += 1;
        io.to(currentRoom.name).emit("scoreBoard", currentRoom.players);
        if (checkWin(currentRoom, userInfo)) {
          currentRoom.theDrawer = { id: null };
          io.to(currentRoom.name).emit("allowedToDraw", {
            bool: false,
            word: null,
            user: null,
          });
          currentRoom.currentWord = null;
          setTimeout(function () {
            resetBrush(currentRoom);
            resetCanvas(currentRoom);
            resetTimer(currentRoom);
            currentRoom.timeLeft = "&nbsp";
          }, newDrawerDelay);
          io.to(currentRoom.name).emit("gameover");
        } else {
          // change drawer
          currentRoom.theDrawer = userInfo;
          io.to(currentRoom.name).emit("allowedToDraw", {
            bool: false,
            word: null,
            user: currentRoom.theDrawer,
          });
          randomizeWord(currentRoom);
          setTimeout(function () {
            socket.emit("allowedToDraw", {
              bool: true,
              word: currentRoom.currentWord,
              user: currentRoom.theDrawer,
            });
            resetBrush(currentRoom);
            resetCanvas(currentRoom);
            resetTimer(currentRoom);
          }, newDrawerDelay);
        }
      } else {
        socket.to(currentRoom.name).broadcast.emit("message", {
          text: text,
          username: userInfo.username,
        });
        socket.emit("message", { text: text, username: "You" });
      }
    }
    messageTimestamp = Date.now();
  });

  socket.on("stroke", function (stroke) {
    if (userInfo.id == currentRoom.theDrawer.id) {
      currentRoom.history.push(stroke);
      socket.to(currentRoom.name).broadcast.emit("stroke", stroke);
    }
  });

  socket.on("changeBrush", function (brush) {
    if (userInfo.id == currentRoom.theDrawer.id) {
      currentRoom.history.push(brush);
      currentRoom.brushColor = brush.color;
      currentRoom.brushSize = brush.size;
      io.to(currentRoom.name).emit("changeBrush", {
        color: currentRoom.brushColor,
        size: currentRoom.brushSize,
      });
    }
  });
});

// ---FUNCTIONS---
function encodeHTML(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function resetBrush(room) {
  room.brushColor = "#000000";
  room.brushSize = 10;
  io.to(room.name).emit("changeBrush", {
    color: room.brushColor,
    size: room.brushSize,
  });
}

function resetCanvas(room) {
  io.to(room.name).emit("clearCanvas");
  room.history = [];
}

function resetTimer(room) {
  room.timeLeft = roundTime;
  io.to(room).emit("timeLeft", { time: room.timeLeft });
}

function randomizeWord(room) {
  room.currentWord = words[Math.floor(Math.random() * words.length)];
}

function randomizeDrawer(room) {
  var theNewDrawer =
    room.players[Math.floor(Math.random() * room.players.length)];
  while (room.theDrawer.id == theNewDrawer.id) {
    theNewDrawer =
      room.players[Math.floor(Math.random() * room.players.length)];
  }
  room.theDrawer = theNewDrawer;
}

function checkWin(room, guesser) {
  var drawer = room.players.find((user) => user.id == room.theDrawer.id);
  var guesser = room.players.find((user) => user.id == guesser.id);
  if (
    drawer.drawerPoints + drawer.guesserPoints >= room.maxPoints &&
    guesser.drawerPoints + guesser.guesserPoints >= room.maxPoints
  ) {
    win(room, drawer, guesser);
    return true;
  } else if (drawer.drawerPoints + drawer.guesserPoints >= room.maxPoints) {
    win(room, drawer);
    return true;
  } else if (guesser.drawerPoints + guesser.guesserPoints >= room.maxPoints) {
    win(room, guesser, null);
    return true;
  }
  return false;
}

function win(room, playerA, playerB) {
  if (playerB == null) {
    io.to(room.name).emit("winmessage", {
      text: playerA.htmlusername + " won!",
    });
  } else {
    io.to(room.name).emit("winmessage", {
      text:
        "It's a tie between " +
        playerA.htmlusername +
        " and " +
        playerB.htmlusername,
    });
  }
}

function getRoom(roomName) {
  return rooms.find((roomToFind) => roomToFind.name == roomName);
}

function getRandomOdd(min, max) {
  //TODO:
  num = Math.random() * (max - min) + min;
  if (Math.floor(num) % 2 === 0) return Math.floor(num) + 1;
  else return Math.floor(num);
}

// Updating rooms data in rooms.json so it will show in frontend
function updateRooms() {
  jsonRooms = [];
  for (var i = 0; i < rooms.length; i++) {
    jsonRooms.push({
      name: rooms[i].name,
      htmlName: rooms[i].htmlName,
      players: rooms[i].players.length,
    });
  }
  var jsonData = JSON.stringify(jsonRooms);
  fs.writeFile("public/rooms.json", jsonData, function (err) {
    if (err) {
      console.log(err);
    }
  });
}
String.prototype.replaceAt = function (index, replacement) {
  return (
    this.substr(0, index) +
    replacement +
    this.substr(index + replacement.length)
  );
};
