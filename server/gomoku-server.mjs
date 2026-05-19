import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { GomokuStore, normalizeCode } from "./gomoku-store.mjs";

const PORT = Number(process.env.PORT ?? 4174);
const HOST = process.env.HOST ?? "127.0.0.1";
const DB_PATH = process.env.GOMOKU_DB_PATH ?? "/var/lib/gomoku/gomoku.sqlite";
const FORFEIT_GRACE_MS = Number(process.env.GOMOKU_FORFEIT_GRACE_MS ?? 15_000);

const store = new GomokuStore(DB_PATH);
const socketsByRoom = new Map();
const socketsByAccount = new Map();
const forfeitTimers = new Map();

const server = createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      sendJson(response, 204, null);
      return;
    }

    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const pathname = normalizePath(url.pathname);

    if (request.method === "GET" && (pathname === "/healthz" || pathname === "/gomoku/healthz")) {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && pathname === "/api/accounts") {
      const body = await readJson(request);
      const account = store.ensureAccount({ token: body.token, nickname: body.nickname });
      sendJson(response, 200, { account });
      return;
    }

    if (request.method === "POST" && pathname === "/api/rooms") {
      const body = await readJson(request);
      const result = store.createRoom({ token: body.token, nickname: body.nickname });
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "GET" && pathname === "/api/ranking") {
      sendJson(response, 200, { profiles: store.getRanking(100) });
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : "Request failed." });
  }
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const pathname = normalizePath(url.pathname);

  if (pathname !== "/ws") {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (ws) => {
  ws.meta = { accountId: null, roomCode: null };

  ws.on("message", (raw) => {
    try {
      const message = JSON.parse(String(raw));
      handleSocketMessage(ws, message);
    } catch (error) {
      sendSocketError(ws, error instanceof Error ? error.message : "Invalid message.");
    }
  });

  ws.on("close", () => {
    unregisterSocket(ws);
  });
});

function handleSocketMessage(ws, message) {
  if (message.type === "room:join") {
    const { account, state } = store.joinRoom({
      code: message.code,
      nickname: message.nickname,
      token: message.token
    });
    registerSocket(ws, account.id, state.room.code);
    send(ws, { type: "account", account });
    send(ws, { type: "room:state", state });
    broadcastRoom(state.room.code, state, ws);
    return;
  }

  if (!ws.meta.accountId || !ws.meta.roomCode) {
    throw new Error("Join a room before sending game actions.");
  }

  if (message.type === "room:chooseSide") {
    const state = store.chooseSide({
      accountId: ws.meta.accountId,
      code: ws.meta.roomCode,
      side: message.side
    });
    broadcastRoom(state.room.code, state);
    return;
  }

  if (message.type === "move:submit") {
    const state = store.submitMove({
      accountId: ws.meta.accountId,
      code: ws.meta.roomCode,
      row: message.row,
      col: message.col
    });
    broadcastRoom(state.room.code, state);
    return;
  }

  if (message.type === "room:restart") {
    const state = store.requestRestart({
      accountId: ws.meta.accountId,
      code: ws.meta.roomCode
    });
    broadcastRoom(state.room.code, state);
    return;
  }

  if (message.type === "ping") {
    send(ws, { type: "pong", now: Date.now() });
    return;
  }

  throw new Error("Unknown message type.");
}

function registerSocket(ws, accountId, roomCode) {
  unregisterSocket(ws);
  ws.meta = { accountId, roomCode: normalizeCode(roomCode) };
  addToSetMap(socketsByAccount, accountId, ws);
  addToSetMap(socketsByRoom, normalizeCode(roomCode), ws);
  cancelForfeit(accountId);
}

function unregisterSocket(ws) {
  const { accountId, roomCode } = ws.meta ?? {};

  if (accountId) {
    removeFromSetMap(socketsByAccount, accountId, ws);
    if (!socketsByAccount.has(accountId)) {
      scheduleForfeit(accountId);
    }
  }

  if (roomCode) {
    removeFromSetMap(socketsByRoom, roomCode, ws);
  }

  ws.meta = { accountId: null, roomCode: null };
}

function scheduleForfeit(accountId) {
  cancelForfeit(accountId);
  const timer = setTimeout(() => {
    forfeitTimers.delete(accountId);

    if (socketsByAccount.has(accountId)) {
      return;
    }

    for (const state of store.forfeitDisconnected(accountId)) {
      broadcastRoom(state.room.code, state);
    }
  }, FORFEIT_GRACE_MS);
  forfeitTimers.set(accountId, timer);
}

function cancelForfeit(accountId) {
  const timer = forfeitTimers.get(accountId);

  if (timer) {
    clearTimeout(timer);
    forfeitTimers.delete(accountId);
  }
}

function broadcastRoom(roomCode, state, except) {
  const sockets = socketsByRoom.get(normalizeCode(roomCode));

  if (!sockets) {
    return;
  }

  for (const socket of sockets) {
    if (socket !== except) {
      send(socket, { type: "room:state", state });
    }
  }
}

function sendSocketError(ws, message) {
  send(ws, { type: "error", message });
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function addToSetMap(map, key, value) {
  const values = map.get(key) ?? new Set();
  values.add(value);
  map.set(key, values);
}

function removeFromSetMap(map, key, value) {
  const values = map.get(key);

  if (!values) {
    return;
  }

  values.delete(value);

  if (values.size === 0) {
    map.delete(key);
  }
}

function normalizePath(pathname) {
  return pathname.startsWith("/gomoku/") ? pathname.slice("/gomoku".length) : pathname;
}

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
    "content-type": "application/json; charset=utf-8"
  });

  if (statusCode === 204) {
    response.end();
    return;
  }

  response.end(JSON.stringify(payload));
}

server.listen(PORT, HOST, () => {
  console.log(`gomoku server listening on http://${HOST}:${PORT}`);
});
