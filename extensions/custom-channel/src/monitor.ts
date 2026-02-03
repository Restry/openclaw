import type { RuntimeEnv } from "openclaw/plugin-sdk";
import type { CustomChannelConfig } from "./config-schema.js";
import {
  setWebhookConfig,
  setWebhookMessageHandler,
  type IncomingWebhookMessage,
} from "./webhook-handler.js";
import {
  startWebSocketServer,
  stopWebSocketServer,
  setWebSocketMessageHandler,
  getConnectedClients,
  sendToClient,
  type IncomingWebSocketMessage,
} from "./websocket-server.js";

export type MonitorCustomChannelParams = {
  runtime: RuntimeEnv;
  abortSignal?: AbortSignal;
  config: CustomChannelConfig;
  accountId: string;
  statusSink?: (status: Record<string, unknown>) => void;
};

export type CustomChannelRuntimeStatus = {
  running: boolean;
  connectedClients: number;
  lastStartAt: number | null;
  lastStopAt: number | null;
  lastError: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
};

export async function monitorCustomChannel(params: MonitorCustomChannelParams): Promise<void> {
  const { runtime, abortSignal, config, accountId, statusSink } = params;

  let lastInboundAt: number | null = null;
  let lastOutboundAt: number | null = null;

  const updateStatus = () => {
    const clients = getConnectedClients();
    statusSink?.({
      running: true,
      connectedClients: clients.size,
      lastStartAt: Date.now(),
      lastInboundAt,
      lastOutboundAt,
    });
  };

  // Process inbound message (from WebSocket or Webhook)
  const processInboundMessage = async (params: {
    from: string;
    text: string;
    groupId?: string;
    metadata?: Record<string, unknown>;
    clientId?: string;
    messageId?: string;
  }) => {
    lastInboundAt = Date.now();
    updateStatus();

    const { from, text, groupId, metadata, clientId, messageId } = params;

    // Determine if this is a DM or group message
    const isGroup = Boolean(groupId);
    const to = groupId ?? "custom-channel";

    // Build context for the reply pipeline
    const context = {
      From: from,
      To: to,
      Body: text,
      AccountId: accountId,
      MessageProvider: "custom-channel",
      MessageId: messageId ?? `in-${Date.now()}`,
      SenderName: metadata?.name ?? from,
      ChatType: isGroup ? "group" : "direct",
      GroupId: groupId,
      ClientId: clientId,
    };

    try {
      // Get the auto-reply module
      const autoReply = runtime.autoReply;
      if (!autoReply) {
        console.error("[custom-channel] Auto-reply runtime not available");
        return { ok: false, error: "Auto-reply not available" };
      }

      // Queue the message for processing
      await autoReply.queueInbound({
        context,
        onReply: async (reply) => {
          lastOutboundAt = Date.now();
          updateStatus();

          // Send reply back via WebSocket if we have a client ID
          if (clientId) {
            sendToClient(clientId, {
              type: "message",
              id: `reply-${Date.now()}`,
              to: from,
              text: typeof reply === "string" ? reply : reply.text,
              metadata: typeof reply === "object" ? { ...reply.metadata } : undefined,
            });
          }
        },
      });

      return { ok: true, messageId: context.MessageId };
    } catch (err) {
      console.error("[custom-channel] Error processing inbound message:", err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Processing failed",
      };
    }
  };

  // Setup WebSocket message handler
  setWebSocketMessageHandler(async (clientId: string, message: IncomingWebSocketMessage) => {
    if (message.type !== "message") {
      return;
    }

    const result = await processInboundMessage({
      from: message.from ?? clientId,
      text: message.text ?? "",
      groupId: message.metadata?.groupId as string | undefined,
      metadata: message.metadata,
      clientId,
      messageId: message.id,
    });

    // Send acknowledgement
    sendToClient(clientId, {
      type: "ack",
      id: message.id,
      success: result.ok,
      error: result.error,
    });
  });

  // Setup Webhook message handler
  setWebhookMessageHandler(
    async (
      message: IncomingWebhookMessage,
    ): Promise<{ ok: boolean; messageId?: string; error?: string }> => {
      return processInboundMessage({
        from: message.from,
        text: message.text,
        groupId: message.groupId,
        metadata: message.metadata,
        messageId: message.id,
      });
    },
  );

  // Start WebSocket server if enabled
  if (config.websocket?.enabled !== false) {
    startWebSocketServer(config.websocket ?? {});
    console.log(
      `[custom-channel] WebSocket server started on path ${config.websocket?.path ?? "/custom-channel/ws"}`,
    );
  }

  // Setup webhook config
  if (config.webhook?.enabled !== false) {
    setWebhookConfig(config.webhook ?? {});
    console.log(
      `[custom-channel] Webhook endpoint enabled on path ${config.webhook?.path ?? "/custom-channel/webhook"}`,
    );
  }

  updateStatus();

  // Wait for abort signal
  if (abortSignal) {
    await new Promise<void>((resolve) => {
      if (abortSignal.aborted) {
        resolve();
        return;
      }
      abortSignal.addEventListener("abort", () => resolve(), { once: true });
    });
  }

  // Cleanup
  stopWebSocketServer();
  statusSink?.({
    running: false,
    lastStopAt: Date.now(),
  });
}
