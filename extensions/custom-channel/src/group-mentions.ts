import { resolveToolsBySender, type GroupToolPolicyConfig } from "openclaw/plugin-sdk";
import type { CoreConfig } from "./types.js";

export function resolveCustomChannelGroupRequireMention(params: {
  cfg: CoreConfig;
  groupId: string;
}): boolean | undefined {
  const { cfg, groupId } = params;
  const groups = cfg.channels?.["custom-channel"]?.groups ?? {};
  const groupConfig = groups[groupId];
  return groupConfig?.requireMention;
}

export function resolveCustomChannelGroupToolPolicy(params: {
  cfg: CoreConfig;
  groupId: string;
  senderId?: string;
}): GroupToolPolicyConfig | undefined {
  const { cfg, groupId, senderId } = params;
  const groups = cfg.channels?.["custom-channel"]?.groups ?? {};
  const groupConfig = groups[groupId];
  if (!groupConfig?.tools) {
    return undefined;
  }
  return resolveToolsBySender(groupConfig.tools, senderId);
}
