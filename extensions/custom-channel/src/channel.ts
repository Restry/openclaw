import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  normalizeAccountId,
  PAIRING_APPROVED_MESSAGE,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
} from "openclaw/plugin-sdk";
import type { CoreConfig, ResolvedCustomChannelAccount } from "./types.js";
import { CustomChannelConfigSchema } from "./config-schema.js";
import {
  resolveCustomChannelGroupRequireMention,
  resolveCustomChannelGroupToolPolicy,
} from "./group-mentions.js";
import { customChannelOutbound } from "./outbound.js";
import { sendMessageCustomChannel } from "./send.js";
import {
  listCustomChannelAccountIds,
  resolveCustomChannelAccount,
  resolveDefaultCustomChannelAccountId,
} from "./types.js";

const meta = {
  id: "custom-channel",
  label: "Custom Channel",
  selectionLabel: "Custom Channel (WebSocket/Webhook)",
  docsPath: "/channels/custom-channel",
  docsLabel: "custom-channel",
  blurb: "Generic channel for web chat tools, mini-programs via WebSocket or Webhook.",
  order: 90,
  quickstartAllowFrom: true,
};

function normalizeCustomChannelMessagingTarget(raw: string): string | undefined {
  let normalized = raw.trim();
  if (!normalized) {
    return undefined;
  }
  const lowered = normalized.toLowerCase();
  if (lowered.startsWith("custom-channel:")) {
    normalized = normalized.slice("custom-channel:".length).trim();
  }
  if (lowered.startsWith("custom:")) {
    normalized = normalized.slice("custom:".length).trim();
  }
  const stripped = normalized.replace(/^(user|group|client):/i, "").trim();
  return stripped || undefined;
}

function normalizeAllowListLower(list: Array<string | number>): string[] {
  return list
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry) => Boolean(entry) && entry !== "*");
}

export const customChannelPlugin: ChannelPlugin<ResolvedCustomChannelAccount> = {
  id: "custom-channel",
  meta,
  pairing: {
    idLabel: "customChannelUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^custom-channel:/i, "").replace(/^custom:/i, ""),
    notifyApproval: async ({ id }) => {
      await sendMessageCustomChannel(`user:${id}`, PAIRING_APPROVED_MESSAGE);
    },
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    polls: false,
    reactions: false,
    threads: false,
    media: true,
  },
  reload: { configPrefixes: ["channels.custom-channel"] },
  configSchema: buildChannelConfigSchema(CustomChannelConfigSchema),
  config: {
    listAccountIds: (cfg) => listCustomChannelAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) =>
      resolveCustomChannelAccount({ cfg: cfg as CoreConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultCustomChannelAccountId(cfg as CoreConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "custom-channel",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as CoreConfig,
        sectionKey: "custom-channel",
        accountId,
        clearBaseFields: ["name"],
      }),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      websocketEnabled: account.config.websocket?.enabled !== false,
      webhookEnabled: account.config.webhook?.enabled !== false,
    }),
    resolveAllowFrom: ({ cfg }) =>
      ((cfg as CoreConfig).channels?.["custom-channel"]?.dm?.allowFrom ?? []).map((entry) =>
        String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) => normalizeAllowListLower(allowFrom),
  },
  security: {
    resolveDmPolicy: ({ account }) => ({
      policy: account.config.dm?.policy ?? "pairing",
      allowFrom: account.config.dm?.allowFrom ?? [],
      policyPath: "channels.custom-channel.dm.policy",
      allowFromPath: "channels.custom-channel.dm.allowFrom",
      approveHint: formatPairingApproveHint("custom-channel"),
      normalizeEntry: (raw) =>
        raw
          .replace(/^custom-channel:/i, "")
          .replace(/^custom:/i, "")
          .trim()
          .toLowerCase(),
    }),
    collectWarnings: ({ account, cfg }) => {
      const defaultGroupPolicy = (cfg as CoreConfig).channels?.defaults?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy !== "open") {
        return [];
      }
      return [
        '- Custom Channel: groupPolicy="open" allows any group to trigger. Set channels.custom-channel.groupPolicy="allowlist" + channels.custom-channel.groups to restrict.',
      ];
    },
  },
  groups: {
    resolveRequireMention: resolveCustomChannelGroupRequireMention,
    resolveToolPolicy: resolveCustomChannelGroupToolPolicy,
  },
  messaging: {
    normalizeTarget: normalizeCustomChannelMessagingTarget,
    targetResolver: {
      looksLikeId: (raw) => {
        const trimmed = raw.trim();
        if (!trimmed) {
          return false;
        }
        if (/^(custom-channel:|custom:|user:|group:|client:)/i.test(trimmed)) {
          return true;
        }
        return Boolean(trimmed);
      },
      hint: "<user|group|client>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async ({ cfg, accountId, query, limit }) => {
      const account = resolveCustomChannelAccount({ cfg: cfg as CoreConfig, accountId });
      const q = query?.trim().toLowerCase() || "";
      const ids = new Set<string>();

      for (const entry of account.config.dm?.allowFrom ?? []) {
        const raw = String(entry).trim();
        if (!raw || raw === "*") {
          continue;
        }
        ids.add(raw.replace(/^custom-channel:/i, "").replace(/^custom:/i, ""));
      }

      for (const entry of account.config.groupAllowFrom ?? []) {
        const raw = String(entry).trim();
        if (!raw || raw === "*") {
          continue;
        }
        ids.add(raw.replace(/^custom-channel:/i, "").replace(/^custom:/i, ""));
      }

      const groups = account.config.groups ?? {};
      for (const room of Object.values(groups)) {
        for (const entry of room?.users ?? []) {
          const raw = String(entry).trim();
          if (!raw || raw === "*") {
            continue;
          }
          ids.add(raw.replace(/^custom-channel:/i, "").replace(/^custom:/i, ""));
        }
      }

      return Array.from(ids)
        .map((raw) => raw.trim())
        .filter(Boolean)
        .filter((id) => (q ? id.toLowerCase().includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({
          kind: "user" as const,
          id: id.startsWith("user:") ? id : `user:${id}`,
        }));
    },
    listGroups: async ({ cfg, accountId, query, limit }) => {
      const account = resolveCustomChannelAccount({ cfg: cfg as CoreConfig, accountId });
      const q = query?.trim().toLowerCase() || "";
      const groups = account.config.groups ?? {};
      const ids = Object.keys(groups)
        .map((raw) => raw.trim())
        .filter((raw) => Boolean(raw) && raw !== "*")
        .map((raw) => raw.replace(/^custom-channel:/i, "").replace(/^custom:/i, ""))
        .filter((id) => (q ? id.toLowerCase().includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({
          kind: "group" as const,
          id: id.startsWith("group:") ? id : `group:${id}`,
        }));
      return ids;
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg: cfg as CoreConfig,
        channelKey: "custom-channel",
        accountId,
        name,
      }),
    applyAccountConfig: ({ cfg, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg: cfg as CoreConfig,
        channelKey: "custom-channel",
        accountId: DEFAULT_ACCOUNT_ID,
        name: input.name,
      });
      return {
        ...namedConfig,
        channels: {
          ...namedConfig.channels,
          "custom-channel": {
            ...namedConfig.channels?.["custom-channel"],
            enabled: true,
          },
        },
      } as CoreConfig;
    },
  },
  outbound: customChannelOutbound,
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (!lastError) {
          return [];
        }
        return [
          {
            channel: "custom-channel",
            accountId: account.accountId,
            kind: "runtime",
            message: `Channel error: ${lastError}`,
          },
        ];
      }),
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      websocketEnabled: snapshot.websocketEnabled ?? false,
      webhookEnabled: snapshot.webhookEnabled ?? false,
      connectedClients: snapshot.connectedClients ?? 0,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      websocketEnabled: account.config.websocket?.enabled !== false,
      webhookEnabled: account.config.webhook?.enabled !== false,
      running: runtime?.running ?? false,
      connectedClients: runtime?.connectedClients ?? 0,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.setStatus({
        accountId: account.accountId,
        websocketEnabled: account.config.websocket?.enabled !== false,
        webhookEnabled: account.config.webhook?.enabled !== false,
      });
      ctx.log?.info(`[${account.accountId}] starting custom channel provider`);
      const { monitorCustomChannel } = await import("./monitor.js");
      return monitorCustomChannel({
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        config: account.config,
        accountId: account.accountId,
        statusSink: (status) => ctx.setStatus({ accountId: account.accountId, ...status }),
      });
    },
  },
};
