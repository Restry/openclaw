import { sendWebhookCallback } from "./webhook-handler.js";
import {
  sendToClient,
  getConnectedClients,
  broadcastMessage,
  type OutgoingWebSocketMessage,
} from "./websocket-server.js";

export type SendMessageOptions = {
  accountId?: string;
  mediaUrl?: string;
  clientId?: string;
};

export async function sendMessageCustomChannel(
  to: string,
  text: string,
  opts?: SendMessageOptions,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  const message: OutgoingWebSocketMessage = {
    type: "message",
    id: messageId,
    to,
    text,
    metadata: opts?.mediaUrl ? { mediaUrl: opts.mediaUrl } : undefined,
  };

  // If a specific client is targeted
  if (opts?.clientId) {
    const sent = sendToClient(opts.clientId, message);
    if (sent) {
      return { ok: true, messageId };
    }
    return { ok: false, error: `Client ${opts.clientId} not found or disconnected` };
  }

  // Try to find a matching client by target ID
  const clients = getConnectedClients();
  let sent = false;

  // First try exact match (if target looks like a client ID)
  if (to.startsWith("ws-") || to.startsWith("client:")) {
    const clientId = to.replace(/^client:/, "");
    sent = sendToClient(clientId, message);
    if (sent) {
      return { ok: true, messageId };
    }
  }

  // Try to find client by user ID in metadata
  for (const [clientId, client] of clients) {
    const userId = client.metadata?.userId || client.metadata?.user_id;
    const userIdStr =
      typeof userId === "string" || typeof userId === "number" ? String(userId) : null;
    if (userIdStr && userIdStr === to.replace(/^user:/, "")) {
      sent = sendToClient(clientId, message);
      if (sent) {
        return { ok: true, messageId };
      }
    }
  }

  // If target is a group, broadcast to all authenticated clients
  if (to.startsWith("group:") || to.startsWith("channel:")) {
    const count = broadcastMessage(message);
    if (count > 0) {
      return { ok: true, messageId };
    }
  }

  // Fallback: try webhook callback
  const webhookResult = await sendWebhookCallback({
    to,
    text,
    metadata: opts?.mediaUrl ? { mediaUrl: opts.mediaUrl } : undefined,
  });

  if (webhookResult.ok) {
    return { ok: true, messageId };
  }

  // No delivery method succeeded
  if (clients.size === 0) {
    return {
      ok: false,
      error: "No WebSocket clients connected and webhook callback not configured",
    };
  }

  return { ok: false, error: `Unable to deliver message to ${to}` };
}
