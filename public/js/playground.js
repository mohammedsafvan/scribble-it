// ---INITIAL VARIABLES---
var socket = io();

//Canvas stuff
var canvas = document.getElementById("canvas");
canvasResolution = 1000;
canvas.width = canvasResolution * 1.4;
canvas.height = canvasResolution;
var ctx = canvas.getContext("2d");
ctx.lineJoin = "round";
ctx.lineCap = "round";
ctx.lineWidth = 10;
ctx.strokeStyle = "#000";

//Other variables
var chat = document.getElementById("chat_text");
var timer = document.getElementById("timer");
var input = document.getElementById("input_text");
var userlist = document.getElementById("userlist");
var isDrawing = false;
var canDraw = false;
var currentWord = null;
var timeLeft = -10; // setting to -10 for validation purpose
var lastX = 0;
var lastY = 0;
var username;

// ---EVENT LISTENERS---
//Listen to mouse events
canvas.addEventListener("mousedown", (e) => {
  isDrawing = true;
  [lastX, lastY] = [make_relative(e.offsetX), make_relative(e.offsetY)];
  draw(e);
});
canvas.addEventListener("mousemove", draw);
canvas.addEventListener("mouseup", () => (isDrawing = false));
canvas.addEventListener("mouseout", () => (isDrawing = false));

//listen to touch events
canvas.addEventListener("touchstart", (e) => {
  isDrawing = true;
  var offset = canvas.getBoundingClientRect();
  lastX = make_relative(e.touches[0].clientX - offset.left);
  lastY = make_relative(e.touches[0].clientY - offset.top);
  draw(e);
});
canvas.addEventListener("touchmove", draw);
canvas.addEventListener("touchend", () => (isDrawing = false));
canvas.addEventListener("touchcancel", () => (isDrawing = false));
canvas.addEventListener("mouseout", () => (isDrawing = false));

//Send message when enter is pressed
input.addEventListener("keydown", (e) => {
  if (e.code === "Enter") send();
});

// Every second decerese the time in FRONTEND
setInterval(function () {
  timeLeft -= 1;
  if (timeLeft < 0) {
    //Here is the validation
    timer.innerHTML = "&nbsp"; // Blank
  } else {
    // printing the timeleft every second with decreased value
    timer.innerHTML =
      "Time left: 0" +
      Math.floor(timeLeft / 60) +
      ":" +
      ("0" + Math.floor(timeLeft % 60)).slice(-2);
  }
}, 1000);

// ---SOCKET LISTENERS---
//Send initial info when connection
socket.on("init", function () {
  askUsername(); // Checking for username
  socket.emit("connectInfo", {
    // Sending info to server(username, roomname, maxPoints)
    username: username,
    room: sessionStorage.getItem("room"),
    maxPoints: sessionStorage.getItem("maxPoints"),
  });
});

socket.on("gameover", () => {
  var p = document.createElement("p");
  p.innerHTML = "         Game over !, Redirecting to main page &#128512; ";
  p.style.color = "red";
  p.style.size = "30";
  p.style.fontWeight = "bold";
  p.classList.add("hide");
  chat.prepend(p);
  setTimeout(function () {
    p.classList.add("show");
    p.classList.remove("hide");
  }, 10);

  setTimeout(() => {
    window.location.href = window.location.origin;
  }, 10000);
});

socket.on("winmessage", (data) => {
  var p = document.createElement("p");
  p.innerHTML = data.text; // He is guessed so :)
  p.style.color = "green";
  p.style.fontWeight = "bold";
  p.classList.add("hide");
  chat.prepend(p);
  setTimeout(function () {
    p.classList.add("show");
    p.classList.remove("hide");
  }, 10);
});

// Recieving history of canvas so user can see drawing befor the user
socket.on("history", function (conf) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (var i = 0; i < conf.history.length; i++) {
    eve = conf.history[i];
    if (eve.lastX != undefined) {
      ctx.beginPath();
      ctx.moveTo(eve.lastX, eve.lastY);
      ctx.lineTo(eve.offsetX, eve.offsetY);
      ctx.stroke();
    } else {
      ctx.strokeStyle = eve.color;
      ctx.lineWidth = eve.size;
    }
  }
  ctx.lineWidth = conf.brushSize;
  ctx.strokeStyle = conf.brushColor;
});

// When disconnects
socket.on("disconnect", (reason) => {
  addToChat("You have disconnected", null);
  userlist.innerHTML = ""; // Making the users table blank
});

socket.on("correctanswer", (data) => {
  if (sessionStorage.getItem("username") === data.user) {
    // if he is the correct guesser then
    var p = document.createElement("p");
    p.innerHTML = " &#8226 " + "You guessed correctly"; // He is guessed so :)
    p.style.color = "green";
    p.style.fontWeight = "bold";
    p.classList.add("hide");
    chat.prepend(p);
    setTimeout(function () {
      p.classList.add("show");
      p.classList.remove("hide");
    }, 10);
  } else {
    // if user is not the guesser then
    var p = document.createElement("p");
    p.innerHTML = "&#8226 " + data.user + " guessed correctly";
    p.style.color = "green";
    p.style.fontWeight = "bold";
    p.classList.add("hide");
    chat.prepend(p);
    setTimeout(function () {
      p.classList.add("show");
      p.classList.remove("hide");
    }, 10);
  }
});

//Display new message in chat
socket.on("message", function (message) {
  addToChat(message.text, message.username);
  // textbox = document.getElementById('textbox');
  // textbox.scrollTop = textbox.scrollHeight;
});

//If you are the drawer show brush tools and your word, otherwise hide them
socket.on("allowedToDraw", function (allowedToDraw) {
  canDraw = allowedToDraw.bool; // Setting true
  textPlace = document.getElementById("wordToDraw");
  var belowCanvas = document.getElementById("belowCanvas");
  var chat_input = document.getElementById("chat_input");
  document.getElementById("input_text").value = ""; // To hide the input
  var modifyers = document.getElementsByClassName("brush_modifyer");
  if (canDraw) {
    input.disabled = true; //Disabled the input
    currentWord = allowedToDraw.word; // setting the currentword the recieved word
    textPlace.textContent = "Your word is: " + currentWord; // Showing that
    addToChat("You are drawing: " + currentWord, null); // showing in chat
    belowCanvas.style.display = "flex";
    chat_input.style.display = "none";
    for (i = 0; i < modifyers.length; i++) {
      modifyers[i].style.display = "inline";
    }
    //Make cursor 'pointer'
  } else if (allowedToDraw.user == null) {
    //if no one assigned to draw :!!there is a case in server :)
    input.disabled = false;
    currentWord = null;
    textPlace.textContent = " ";
    belowCanvas.style.display = "none";
    chat_input.style.display = "inline-block";
    for (i = 0; i < modifyers.length; i++) {
      modifyers[i].style.display = "none";
    }
  } else if (allowedToDraw.user.id != socket.id) {
    console.log("user.id != socket.id aanu word: " + currentWord);
    // If there is problem with socket.id or user.id
    input.disabled = false;
    addToChat(allowedToDraw.user.htmlusername + " is drawing", null);
    currentWord = null;
    textPlace.textContent = " ";
    belowCanvas.style.display = "none";
    chat_input.style.display = "inline-block";
    for (i = 0; i < modifyers.length; i++) {
      modifyers[i].style.display = "none";
    }
    //TODO: Make cursor 'not-allowed'
  }
});

//Display new drawing when someone else draws
socket.on("stroke", function (stroke) {
  ctx.beginPath();
  ctx.moveTo(stroke.lastX, stroke.lastY);
  ctx.lineTo(stroke.offsetX, stroke.offsetY);
  ctx.stroke();
  [lastX, lastY] = [stroke.offsetX, stroke.offsetY];
});

//Clear canvas after correct guess
socket.on("clearCanvas", function (clear) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// changing drawing color or size in all clients
socket.on("changeBrush", function (brush) {
  ctx.strokeStyle = brush.color;
  ctx.lineWidth = brush.size;
  modifyers = document.getElementsByClassName("brush_modifyer");
  for (var i = 0; i < modifyers.length; i++) {
    modifyers[i].style.border = "2px solid #000";
  }
  document.getElementById(brush.color).style.border = "2px solid #FFF";
  document.getElementById("px" + brush.size.toString()).style.border =
    "2px solid #FFF";
});

//
socket.on("timeLeft", function (time) {
  timeLeft = time.time;
  if (timeLeft > -1) {
    timer.style.display = "block"; //style
  }
});

//Score board
socket.on("scoreBoard", function (scoreBoard) {
  userlist.innerHTML =
    '<tr>\n<th>Name</th>\n<th style="width:4em">Points</th></tr>';
  for (var i = 0; i < scoreBoard.length; i++) {
    var row = document.createElement("tr");
    var name = document.createElement("td");
    name.innerHTML = scoreBoard[i].htmlusername;
    var points = document.createElement("td");
    points.innerHTML = scoreBoard[i].drawerPoints + scoreBoard[i].guesserPoints;
    row.appendChild(name);
    row.appendChild(points);
    userlist.appendChild(row);
  }
});
// --------------FUNCTIONS---
//Send message
function send() {
  if (input.value != "") {
    socket.emit("message", { text: input.value, username: username });
    input.value = "";
  }
}

// To change color
function changeColor(newColor) {
  socket.emit("changeBrush", { color: newColor, size: ctx.lineWidth });
}

// To change brush sizes
function changeBrushSize(newSize) {
  socket.emit("changeBrush", {
    color: ctx.strokeStyle.toUpperCase(),
    size: newSize,
  });
}

function clearCanvas() {
  socket.emit("clearCanvas");
}

// To draw
function draw(e) {
  // stop the function if they are not mouse down or if not allowed to draw
  if (!isDrawing || !canDraw) return;
  //listen for mouse move event
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  if (e.touches != undefined) {
    var offset = canvas.getBoundingClientRect();
    newX = make_relative(e.touches[0].clientX - offset.left);
    newY = make_relative(e.touches[0].clientY - offset.top);
  } else {
    var newX = make_relative(e.offsetX);
    var newY = make_relative(e.offsetY);
  }
  ctx.lineTo(newX, newY);
  socket.emit("stroke", {
    lastX: lastX,
    lastY: lastY,
    offsetX: newX,
    offsetY: newY,
  });
  ctx.stroke();
  [lastX, lastY] = [newX, newY];
}

//adapt strokes for current canvas size
function make_relative(a) {
  return (a * canvasResolution) / canvas.clientHeight;
}

// add the recieved message to chat
function addToChat(text, user) {
  var p = document.createElement("p");
  if (user == null) {
    // if user not mentioned
    p.innerHTML = " &#8226 " + text; // just the text
  } else {
    p.innerHTML = " &#8226 " + user + ": " + text; // else // user : message
  }
  p.classList.add("hide");
  chat.prepend(p);
  setTimeout(function () {
    p.classList.add("show");
    p.classList.remove("hide");
  }, 10);
}

// TODO: make popup with modifyers
function show_colors() {
  window.scrollBy({
    top: document.body.scrollHeight,
    behavior: "smooth",
  });
  setTimeout(function () {
    window.scrollTo(0, document.body.scrollHeight);
  }, 500);
  // color_modifyers = document.getElementById('colors').style;
  // color_modifyers.display = 'inline-block';
  // color_modifyers.position = 'fixed';
  // color_modifyers.left = '50%';
  // color_modifyers.top = '50%';
  // color_modifyers.transform = 'translate(-50%, -50%)';
}
function show_sizes() {
  window.scrollBy({
    top: document.body.scrollHeight,
    behavior: "smooth",
  });
  setTimeout(function () {
    window.scrollTo(0, document.body.scrollHeight);
  }, 500);
}

function askUsername() {
  username = sessionStorage.getItem("username");
  var backupUsername = socket.id.substring(0, 5);
  if (username == undefined || username == "" || username == null) {
    username = window.prompt("What is your username?", backupUsername);
    if (username == undefined || username == "" || username == null) {
      username = backupUsername;
    } else {
      sessionStorage.setItem("username", username);
    }
  }
}
user = sessionStorage.getItem("username");
if (user ==null){
  document.getElementById("users").innerHTML = "Users";
}else{
  document.getElementById("users").innerHTML = user;
}

