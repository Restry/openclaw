import { MarkdownConfigSchema, ToolPolicySchema } from "openclaw/plugin-sdk";
import { z } from "zod";

const allowFromEntry = z.union([z.string(), z.number()]);

/** Configuration for the custom channel DM policy */
const customChannelDmSchema = z
  .object({
    enabled: z.boolean().optional(),
    policy: z.enum(["pairing", "allowlist", "open", "disabled"]).optional(),
    allowFrom: z.array(allowFromEntry).optional(),
  })
  .optional();

/** Configuration for a custom channel group/room */
const customChannelGroupSchema = z
  .object({
    enabled: z.boolean().optional(),
    allow: z.boolean().optional(),
    requireMention: z.boolean().optional(),
    tools: ToolPolicySchema,
    autoReply: z.boolean().optional(),
    users: z.array(allowFromEntry).optional(),
    skills: z.array(z.string()).optional(),
    systemPrompt: z.string().optional(),
  })
  .optional();

/** WebSocket configuration */
const websocketConfigSchema = z
  .object({
    /** Enable WebSocket server */
    enabled: z.boolean().optional(),
    /** WebSocket server port (default: use gateway port) */
    port: z.number().optional(),
    /** WebSocket path (default: /custom-channel/ws) */
    path: z.string().optional(),
    /** Ping interval in milliseconds */
    pingIntervalMs: z.number().optional(),
    /** Authentication token for WebSocket connections */
    authToken: z.string().optional(),
  })
  .optional();

/** Webhook configuration */
const webhookConfigSchema = z
  .object({
    /** Enable webhook endpoint */
    enabled: z.boolean().optional(),
    /** Webhook path (default: /custom-channel/webhook) */
    path: z.string().optional(),
    /** Authentication token for webhook requests */
    authToken: z.string().optional(),
    /** Callback URL for outbound messages */
    callbackUrl: z.string().optional(),
    /** Callback authentication token */
    callbackAuthToken: z.string().optional(),
  })
  .optional();

/** Full custom channel configuration schema */
export const CustomChannelConfigSchema = z.object({
  /** Account name */
  name: z.string().optional(),
  /** Enable/disable the channel */
  enabled: z.boolean().optional(),
  /** Markdown configuration */
  markdown: MarkdownConfigSchema,
  /** Group policy */
  groupPolicy: z.enum(["open", "disabled", "allowlist"]).optional(),
  /** Text chunk limit for long messages */
  textChunkLimit: z.number().optional(),
  /** Chunk mode */
  chunkMode: z.enum(["length", "newline"]).optional(),
  /** Media max size in MB */
  mediaMaxMb: z.number().optional(),
  /** Group allowFrom list */
  groupAllowFrom: z.array(allowFromEntry).optional(),
  /** DM configuration */
  dm: customChannelDmSchema,
  /** Groups configuration */
  groups: z.object({}).catchall(customChannelGroupSchema).optional(),
  /** WebSocket configuration */
  websocket: websocketConfigSchema,
  /** Webhook configuration */
  webhook: webhookConfigSchema,
});

export type CustomChannelConfig = z.infer<typeof CustomChannelConfigSchema>;
export type CustomChannelWebsocketConfig = NonNullable<CustomChannelConfig["websocket"]>;
export type CustomChannelWebhookConfig = NonNullable<CustomChannelConfig["webhook"]>;
export type CustomChannelDmConfig = NonNullable<CustomChannelConfig["dm"]>;
export type CustomChannelGroupConfig = NonNullable<
  NonNullable<CustomChannelConfig["groups"]>[string]
>;
