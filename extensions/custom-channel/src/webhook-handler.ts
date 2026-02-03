import type { IncomingMessage, ServerResponse } from "node:http";
import type { CustomChannelWebhookConfig } from "./config-schema.js";

export type IncomingWebhookMessage = {
  type?: "message";
  id?: string;
  from: string;
  text: string;
  metadata?: Record<string, unknown>;
  replyTo?: string;
  groupId?: string;
};

export type WebhookMessageHandler = (message: IncomingWebhookMessage) => Promise<{
  ok: boolean;
  messageId?: string;
  error?: string;
}>;

let webhookConfig: CustomChannelWebhookConfig | null = null;
let messageHandler: WebhookMessageHandler | null = null;

export function setWebhookConfig(config: CustomChannelWebhookConfig) {
  webhookConfig = config;
}

export function setWebhookMessageHandler(handler: WebhookMessageHandler) {
  messageHandler = handler;
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });

    req.on("error", reject);
  });
}

function verifyAuth(req: IncomingMessage): boolean {
  if (!webhookConfig?.authToken) {
    return true;
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token === webhookConfig.authToken) {
      return true;
    }
  }

  const tokenHeader = req.headers["x-openclaw-token"] || req.headers["x-custom-channel-token"];
  if (typeof tokenHeader === "string" && tokenHeader === webhookConfig.authToken) {
    return true;
  }

  return false;
}

export async function handleWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const path = webhookConfig?.path ?? "/custom-channel/webhook";
  const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);

  if (!url.pathname.startsWith(path)) {
    return false;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return true;
  }

  if (!verifyAuth(req)) {
    sendJson(res, 401, { ok: false, error: "Unauthorized" });
    return true;
  }

  try {
    const bodyStr = await readBody(req, 1024 * 1024);
    const body = JSON.parse(bodyStr) as IncomingWebhookMessage;

    if (!body.from || !body.text) {
      sendJson(res, 400, { ok: false, error: "Missing required fields: from, text" });
      return true;
    }

    if (!messageHandler) {
      sendJson(res, 503, { ok: false, error: "Message handler not configured" });
      return true;
    }

    const result = await messageHandler(body);
    if (result.ok) {
      sendJson(res, 200, { ok: true, messageId: result.messageId });
    } else {
      sendJson(res, 500, { ok: false, error: result.error || "Processing failed" });
    }
    return true;
  } catch (err) {
    console.error("[custom-channel] Webhook error:", err);
    sendJson(res, 400, {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid request",
    });
    return true;
  }
}

export async function sendWebhookCallback(params: {
  to: string;
  text: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  if (!webhookConfig?.callbackUrl) {
    return { ok: false, error: "No callback URL configured" };
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (webhookConfig.callbackAuthToken) {
      headers.Authorization = `Bearer ${webhookConfig.callbackAuthToken}`;
    }

    const response = await fetch(webhookConfig.callbackUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "message",
        to: params.to,
        text: params.text,
        metadata: params.metadata,
        timestamp: Date.now(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        error: `Callback failed: ${response.status} ${errorText}`,
      };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Callback request failed",
    };
  }
}
