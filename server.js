// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

const WIDTH = 400;
const HEIGHT = 600;
const LINE_HEIGHT = 10;
const BALL_RADIUS = 10;
const TICK = 1000 / 60;

let game = {
  running: false,
  ball: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, speed: 4 },
  players: { top: null, bottom: null },
  names: { top: "", bottom: "" },
  scores: { top: 0, bottom: 0 },
  lastWinner: null,
};

function resetBall() {
  game.ball = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, speed: 4 };
  game.running = !!(game.players.top && game.players.bottom);
  game.lastWinner = null;
}

io.on("connection", (socket) => {
  console.log("New connection:", socket.id);

  let role = "spectator";
  if (!game.players.top) {
    game.players.top = socket.id;
    role = "top";
  } else if (!game.players.bottom) {
    game.players.bottom = socket.id;
    role = "bottom";
  }

  // Send initial info
  socket.emit("welcome", {
    role,
    width: WIDTH,
    height: HEIGHT,
    lineHeight: LINE_HEIGHT,
    ballRadius: BALL_RADIUS,
    scores: game.scores,
    names: game.names,
  });

  io.emit("players", {
    top: game.players.top !== null,
    bottom: game.players.bottom !== null,
    names: game.names,
    scores: game.scores,
  });

  // Player sets their name
  socket.on("setName", (name) => {
    name = name.trim().substring(0, 15);
    if (socket.id === game.players.top) game.names.top = name || "Top Player";
    else if (socket.id === game.players.bottom) game.names.bottom = name || "Bottom Player";
    io.emit("players", {
      top: game.players.top !== null,
      bottom: game.players.bottom !== null,
      names: game.names,
      scores: game.scores,
    });
  });

  socket.on("tap", () => {
    if (!game.running) return;

    const ball = game.ball;
    let tappingSide = null;
    if (socket.id === game.players.top) tappingSide = "top";
    if (socket.id === game.players.bottom) tappingSide = "bottom";
    if (!tappingSide) return;

    const speedIncrease = 0.75;

    if (ball.vy === 0) {
      ball.vy = tappingSide === "top" ? Math.abs(ball.speed) : -Math.abs(ball.speed);
    } else {
      ball.vy = -ball.vy;
      ball.speed = Math.min(25, ball.speed + speedIncrease);
      const sign = Math.sign(ball.vy) || 1;
      ball.vy = sign * Math.abs(ball.speed);
      ball.vx += (Math.random() - 0.5) * 0.6;
    }

    io.emit("tapAck", { by: tappingSide, ball: { ...game.ball } });
  });

  socket.on("restart", () => {
    resetBall();
    io.emit("stateReset", { state: game });
  });

  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    if (game.players.top === socket.id) {
      game.players.top = null;
      game.names.top = "";
    }
    if (game.players.bottom === socket.id) {
      game.players.bottom = null;
      game.names.bottom = "";
    }
    game.running = false;
    resetBall();
    io.emit("players", {
      top: game.players.top !== null,
      bottom: game.players.bottom !== null,
      names: game.names,
      scores: game.scores,
    });
  });
});

// Game loop
setInterval(() => {
  const b = game.ball;

  if (game.running) {
    b.x += b.vx;
    b.y += b.vy;

    if (b.x - BALL_RADIUS <= 0 || b.x + BALL_RADIUS >= WIDTH)
      b.vx = -b.vx * 0.9;

    // Win logic
    if (b.y - BALL_RADIUS <= LINE_HEIGHT) {
      game.running = false;
      game.lastWinner = "bottom";
      game.scores.bottom++;
      io.emit("gameOver", {
        winner: "bottom",
        scores: game.scores,
        names: game.names,
      });
      setTimeout(resetBall, 2000);
    } else if (b.y + BALL_RADIUS >= HEIGHT - LINE_HEIGHT) {
      game.running = false;
      game.lastWinner = "top";
      game.scores.top++;
      io.emit("gameOver", {
        winner: "top",
        scores: game.scores,
        names: game.names,
      });
      setTimeout(resetBall, 2000);
    }
  }

  io.emit("state", {
    ball: game.ball,
    running: game.running,
    players: game.players,
    names: game.names,
    scores: game.scores,
    lastWinner: game.lastWinner,
  });
}, TICK);

server.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
