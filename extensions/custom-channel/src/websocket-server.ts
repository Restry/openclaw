import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import type { CustomChannelWebsocketConfig } from "./config-schema.js";

export type WebSocketClient = {
  id: string;
  ws: WebSocket;
  authenticated: boolean;
  metadata?: Record<string, unknown>;
  lastPingAt: number;
  lastPongAt: number;
};

export type IncomingWebSocketMessage = {
  type: "message" | "auth" | "ping" | "pong" | "ack";
  id?: string;
  from?: string;
  text?: string;
  token?: string;
  metadata?: Record<string, unknown>;
  replyTo?: string;
};

export type OutgoingWebSocketMessage = {
  type: "message" | "auth_result" | "ping" | "pong" | "error" | "ack";
  id?: string;
  to?: string;
  text?: string;
  success?: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
};

export type WebSocketMessageHandler = (
  clientId: string,
  message: IncomingWebSocketMessage,
) => Promise<void>;

let wss: WebSocketServer | null = null;
const clients = new Map<string, WebSocketClient>();
let messageHandler: WebSocketMessageHandler | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;

function generateClientId(): string {
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function setWebSocketMessageHandler(handler: WebSocketMessageHandler) {
  messageHandler = handler;
}

export function startWebSocketServer(config: CustomChannelWebsocketConfig): WebSocketServer {
  if (wss) {
    return wss;
  }

  const path = config.path ?? "/custom-channel/ws";

  wss = new WebSocketServer({
    noServer: true,
    path,
  });

  wss.on("connection", (ws, _req) => {
    const clientId = generateClientId();
    const client: WebSocketClient = {
      id: clientId,
      ws,
      authenticated: !config.authToken,
      lastPingAt: Date.now(),
      lastPongAt: Date.now(),
    };
    clients.set(clientId, client);

    console.log(`[custom-channel] WebSocket client connected: ${clientId}`);

    ws.on("message", async (data: Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const rawMessage =
          data instanceof Buffer
            ? data.toString("utf-8")
            : Array.isArray(data)
              ? Buffer.concat(data).toString("utf-8")
              : Buffer.from(data).toString("utf-8");
        const message: IncomingWebSocketMessage = JSON.parse(rawMessage);

        if (message.type === "auth") {
          handleAuth(client, message, config);
          return;
        }

        if (message.type === "pong") {
          client.lastPongAt = Date.now();
          return;
        }

        if (!client.authenticated) {
          sendMessage(client, {
            type: "error",
            error: "Not authenticated",
          });
          return;
        }

        if (message.type === "message" && messageHandler) {
          await messageHandler(clientId, message);
        }
      } catch (err) {
        console.error(`[custom-channel] WebSocket message error:`, err);
        sendMessage(client, {
          type: "error",
          error: err instanceof Error ? err.message : "Invalid message format",
        });
      }
    });

    ws.on("close", () => {
      console.log(`[custom-channel] WebSocket client disconnected: ${clientId}`);
      clients.delete(clientId);
    });

    ws.on("error", (err) => {
      console.error(`[custom-channel] WebSocket client error (${clientId}):`, err);
      clients.delete(clientId);
    });
  });

  const pingIntervalMs = config.pingIntervalMs ?? 30000;
  pingInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, client] of clients) {
      if (now - client.lastPongAt > pingIntervalMs * 2) {
        console.log(`[custom-channel] Closing stale WebSocket connection: ${id}`);
        client.ws.close();
        clients.delete(id);
        continue;
      }
      if (client.ws.readyState === 1) {
        sendMessage(client, { type: "ping" });
        client.lastPingAt = now;
      }
    }
  }, pingIntervalMs);

  return wss;
}

export function stopWebSocketServer(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }

  for (const client of clients.values()) {
    try {
      client.ws.close();
    } catch {
      // Ignore close errors
    }
  }
  clients.clear();

  if (wss) {
    wss.close();
    wss = null;
  }
}

export function getWebSocketServer(): WebSocketServer | null {
  return wss;
}

export function getConnectedClients(): Map<string, WebSocketClient> {
  return clients;
}

export function getClient(clientId: string): WebSocketClient | undefined {
  return clients.get(clientId);
}

function handleAuth(
  client: WebSocketClient,
  message: IncomingWebSocketMessage,
  config: CustomChannelWebsocketConfig,
): void {
  if (!config.authToken) {
    client.authenticated = true;
    sendMessage(client, { type: "auth_result", success: true });
    return;
  }

  if (message.token === config.authToken) {
    client.authenticated = true;
    client.metadata = message.metadata;
    sendMessage(client, { type: "auth_result", success: true });
  } else {
    sendMessage(client, {
      type: "auth_result",
      success: false,
      error: "Invalid token",
    });
  }
}

export function sendMessage(client: WebSocketClient, message: OutgoingWebSocketMessage): boolean {
  try {
    if (client.ws.readyState === 1) {
      client.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[custom-channel] Failed to send WebSocket message:`, err);
    return false;
  }
}

export function sendToClient(clientId: string, message: OutgoingWebSocketMessage): boolean {
  const client = clients.get(clientId);
  if (!client) {
    console.warn(`[custom-channel] Client not found: ${clientId}`);
    return false;
  }
  return sendMessage(client, message);
}

export function broadcastMessage(
  message: OutgoingWebSocketMessage,
  filter?: (client: WebSocketClient) => boolean,
): number {
  let sent = 0;
  for (const client of clients.values()) {
    if (!client.authenticated) {
      continue;
    }
    if (filter && !filter(client)) {
      continue;
    }
    if (sendMessage(client, message)) {
      sent++;
    }
  }
  return sent;
}
