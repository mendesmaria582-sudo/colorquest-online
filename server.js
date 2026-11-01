const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => res.sendFile(__dirname + "/index.html"));
app.use(express.static("public"));
const rooms = new Map();
const COLORS = ["red", "blue", "green", "yellow"];
const VALUES = ["0","1","2","3","4","5","6","7","8","9","skip","reverse","+2"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ color, value: "0" });
    for (let n = 1; n <= 9; n++) {
      deck.push({ color, value: String(n) }, { color, value: String(n) });
    }
    for (const value of ["skip", "reverse", "+2"]) {
      deck.push({ color, value }, { color, value });
    }
  }
  for (let i = 0; i < 4; i++) deck.push({ color: "wild", value: "wild" }, { color: "wild", value: "+4" });
  return shuffle(deck);
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function newCode() {
  let code;
  do {
    code = Array.from({length: 6}, () => CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}
function publicState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    started: room.started,
    players: room.players.map(p => ({
      id: p.id, name: p.name, count: p.hand.length, isBot: p.isBot,
      connected: p.isBot || p.connected
    })),
    top: room.discard[room.discard.length - 1],
    activeColor: room.activeColor,
    currentPlayerId: room.players[room.turn]?.id || null,
    direction: room.direction,
    message: room.message,
    winner: room.winner || null
  };
}
function emitRoom(room) {
  io.to(room.code).emit("state", publicState(room));
  room.players.forEach(p => {
    if (!p.isBot && p.connected) io.to(p.id).emit("yourHand", p.hand);
  });
}
function drawCards(room, player, count) {
  for (let i = 0; i < count; i++) {
    if (!room.deck.length) {
      if (room.discard.length > 1) {
        const top = room.discard.pop();
        room.deck = shuffle(room.discard);
        room.discard = [top];
      } else break;
    }
    if (room.deck.length) player.hand.push(room.deck.pop());
  }
}
function nextTurn(room, steps = 1) {
  room.turn = (room.turn + room.direction * steps + room.players.length * 10) % room.players.length;
}
function playable(card, room) {
  const top = room.discard[room.discard.length - 1];
  return card.color === "wild" || card.color === room.activeColor || card.value === top.value;
}
function startGame(room) {
  room.deck = makeDeck();
  room.discard = [];
  room.players.forEach(p => { p.hand = []; for (let i=0;i<7;i++) p.hand.push(room.deck.pop()); });
  let first = room.deck.pop();
  while (first.color === "wild") { room.deck.unshift(first); first = room.deck.pop(); }
  room.discard.push(first);
  room.activeColor = first.color;
  room.turn = 0; room.direction = 1; room.started = true; room.winner = null;
  room.message = "Game started. Match the colour or number.";
  if (first.value === "skip") nextTurn(room);
  if (first.value === "+2") { drawCards(room, room.players[room.turn], 2); nextTurn(room); }
  emitRoom(room);
  runBot(room);
}
function applyCard(room, player, index, chosenColor) {
  if (!room.started || room.winner || room.players[room.turn] !== player) return;
  const card = player.hand[index];
  if (!card || !playable(card, room)) return;
  player.hand.splice(index, 1);
  room.discard.push(card);
  if (card.color === "wild") {
    if (!COLORS.includes(chosenColor)) return;
    room.activeColor = chosenColor;
  } else room.activeColor = card.color;

  if (player.hand.length === 0) {
    room.winner = player.name;
    room.message = `${player.name} wins ColorQuest!`;
    emitRoom(room); return;
  }
  let skipNext = false;
  if (card.value === "skip") { skipNext = true; room.message = `${player.name} played Skip.`; }
  else if (card.value === "reverse") {
    room.direction *= -1;
    if (room.players.length === 2) skipNext = true;
    room.message = `${player.name} reversed the direction.`;
  } else if (card.value === "+2") {
    nextTurn(room);
    drawCards(room, room.players[room.turn], 2);
    room.message = `${player.name} played +2.`;
    nextTurn(room);
    emitRoom(room); runBot(room); return;
  } else if (card.value === "+4") {
    nextTurn(room);
    drawCards(room, room.players[room.turn], 4);
    room.message = `${player.name} played Wild +4.`;
    nextTurn(room);
    emitRoom(room); runBot(room); return;
  } else room.message = `${player.name} played ${card.value}.`;
  nextTurn(room, skipNext ? 2 : 1);
  emitRoom(room);
  runBot(room);
}
function runBot(room) {
  if (!room.started || room.winner) return;
  const p = room.players[room.turn];
  if (!p || !p.isBot) return;
  setTimeout(() => {
    if (!room.started || room.winner || room.players[room.turn] !== p) return;
    const idx = p.hand.findIndex(c => playable(c, room));
    if (idx >= 0) {
      const card = p.hand[idx];
      const color = card.color === "wild" ? COLORS[Math.floor(Math.random()*4)] : card.color;
      applyCard(room, p, idx, color);
    } else {
      drawCards(room, p, 1);
      room.message = `${p.name} drew a card.`;
      emitRoom(room);
      nextTurn(room);
      emitRoom(room);
      runBot(room);
    }
  }, 900);
}
io.on("connection", socket => {
  socket.on("createRoom", ({name}) => {
    const code = newCode();
    const player = { id: socket.id, name: String(name || "Host").slice(0,18), hand: [], isBot: false, connected: true };
    const room = { code, hostId: socket.id, players: [player], started: false, deck: [], discard: [], activeColor: null, turn: 0, direction: 1, message: "Waiting for players.", winner: null };
    rooms.set(code, room); socket.join(code); socket.emit("joined", {code, playerId: socket.id}); emitRoom(room);
  });
  socket.on("joinRoom", ({code, name}) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room) return socket.emit("errorMessage", "Room code not found.");
    if (room.started) return socket.emit("errorMessage", "This game has already started.");
    if (room.players.length >= 4) return socket.emit("errorMessage", "This room is full.");
    const player = { id: socket.id, name: String(name || "Player").slice(0,18), hand: [], isBot: false, connected: true };
    room.players.push(player); socket.join(room.code); socket.emit("joined", {code: room.code, playerId: socket.id});
    room.message = `${player.name} joined the room.`; emitRoom(room);
  });
  socket.on("addBot", () => {
    const room = [...rooms.values()].find(r => r.hostId === socket.id);
    if (!room || room.started || room.players.length >= 4) return;
    room.players.push({id: "bot-" + crypto.randomBytes(4).toString("hex"), name: "Computer " + room.players.filter(p=>p.isBot).length+1, hand: [], isBot: true, connected: true});
    room.message = "Computer player added."; emitRoom(room);
  });
  socket.on("startGame", () => {
    const room = [...rooms.values()].find(r => r.hostId === socket.id);
    if (!room || room.started || room.players.length < 2) return;
    startGame(room);
  });
  socket.on("playCard", ({index, color}) => {
    const room = [...rooms.values()].find(r => r.players.some(p => p.id === socket.id));
    if (!room) return;
    const p = room.players.find(p => p.id === socket.id);
    applyCard(room, p, Number(index), color);
  });
  socket.on("drawCard", () => {
    const room = [...rooms.values()].find(r => r.players.some(p => p.id === socket.id));
    if (!room || !room.started || room.winner) return;
    const p = room.players[room.turn];
    if (!p || p.id !== socket.id) return;
    drawCards(room, p, 1);
    room.message = `${p.name} drew a card.`;
    nextTurn(room); emitRoom(room); runBot(room);
  });
  socket.on("closeRoom", () => {
    const room = [...rooms.values()].find(r => r.hostId === socket.id);
    if (!room) return;
    io.to(room.code).emit("roomClosed");
    rooms.delete(room.code);
  });
  socket.on("disconnect", () => {
    for (const [code, room] of rooms) {
      const p = room.players.find(p => p.id === socket.id);
      if (p) {
        if (!room.started) {
          room.players = room.players.filter(x => x.id !== socket.id);
          if (!room.players.length) rooms.delete(code);
          else { if (room.hostId === socket.id) room.hostId = room.players[0].id; emitRoom(room); }
        } else { p.connected = false; emitRoom(room); }
      }
    }
  });
});
server.listen(PORT, () => console.log(`ColorQuest listening on ${PORT}`));
