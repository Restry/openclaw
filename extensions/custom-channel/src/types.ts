import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { CustomChannelConfig } from "./config-schema.js";

export type CoreConfig = OpenClawConfig & {
  channels?: {
    ["custom-channel"]?: CustomChannelConfig;
  };
};

export type ResolvedCustomChannelAccount = {
  accountId: string;
  name: string | undefined;
  enabled: boolean;
  configured: boolean;
  config: CustomChannelConfig;
};

const DEFAULT_ACCOUNT_ID = "default";

export function listCustomChannelAccountIds(cfg: CoreConfig): string[] {
  const base = cfg.channels?.["custom-channel"];
  if (!base) {
    return [];
  }
  return [DEFAULT_ACCOUNT_ID];
}

export function resolveDefaultCustomChannelAccountId(_cfg: CoreConfig): string {
  return DEFAULT_ACCOUNT_ID;
}

export function resolveCustomChannelAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedCustomChannelAccount {
  const { cfg } = params;
  const base = cfg.channels?.["custom-channel"] ?? {};

  const enabled = base.enabled !== false;
  const websocketEnabled = base.websocket?.enabled !== false;
  const webhookEnabled = base.webhook?.enabled !== false;
  const configured = websocketEnabled || webhookEnabled;

  return {
    accountId: DEFAULT_ACCOUNT_ID,
    name: base.name,
    enabled,
    configured,
    config: base,
  };
}
