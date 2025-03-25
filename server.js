const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let players = {};
let chaserId = null;
let powerUps = [];
let gameMode = 'classic';
let gameEndTime = null;
let teams = { red: [], blue: [] };
let teamScores = { red: 0, blue: 0 };
let nicknames = new Set();

app.get('/', (req, res) => {
  res.send('Multiplayer Dot Chase Server');
});

wss.on('connection', (ws) => {
  const id = Date.now().toString();
  ws.id = id;

  ws.send(JSON.stringify({ type: 'requestNickname', id }));

  ws.on('message', (message) => {
    const data = JSON.parse(message.toString());

    if (data.type === 'submitNickname') {
      const nickname = data.nickname;
      if (nicknames.has(nickname)) {
        ws.send(JSON.stringify({ type: 'nicknameError', message: 'Nickname already taken' }));
        return;
      }
      nicknames.add(nickname);
      players[id] = { x: 200, y: 200, color: [Math.random() * 255, Math.random() * 255, Math.random() * 255], score: 0, nickname };
      if (!chaserId) chaserId = id;

      if (gameMode === 'team') {
        const team = teams.red.length <= teams.blue.length ? 'red' : 'blue';
        teams[team].push(id);
        players[id].team = team;
      }

      ws.send(JSON.stringify({
        type: 'joined',
        id,
        chaserId,
        gameMode,
        gameEndTime,
        teams,
        teamScores
      }));

      broadcastGameState();
    } else if (data.type === 'chatMessage') {
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'chatMessage', sender: players[ws.id]?.nickname, message: data.message }));
        }
      });
    } else if (data.type === 'selectGameMode') {
      gameMode = data.mode;
      if (gameMode === 'timeLimit') {
        gameEndTime = Date.now() + 3 * 60 * 1000;
      } else {
        gameEndTime = null;
      }
      teams = { red: [], blue: [] };
      teamScores = { red: 0, blue: 0 };
      for (let id in players) {
        players[id].team = null;
        players[id].score = 0;
      }
      if (gameMode === 'team') {
        for (let id in players) {
          const team = teams.red.length <= teams.blue.length ? 'red' : 'blue';
          teams[team].push(id);
          players[id].team = team;
        }
      }
      broadcastGameState();
    } else {
      players[id] = { ...players[id], x: data.x, y: data.y };
      broadcastGameState();
    }
  });

  ws.on('close', () => {
    nicknames.delete(players[id]?.nickname);
    delete players[id];
    if (chaserId === id) chaserId = Object.keys(players)[0] || null;
    teams.red = teams.red.filter(pid => pid !== id);
    teams.blue = teams.blue.filter(pid => pid !== id);
    broadcastGameState();
  });
});

function broadcastGameState() {
  const state = { players, chaserId, powerUps, gameMode, gameEndTime, teams, teamScores };
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(state));
    }
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});