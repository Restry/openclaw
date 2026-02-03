import type { ChannelOutboundAdapter } from "openclaw/plugin-sdk";
import { missingTargetError } from "openclaw/plugin-sdk";
import { getCustomChannelRuntime } from "./runtime.js";
import { sendMessageCustomChannel } from "./send.js";

export const customChannelOutbound: ChannelOutboundAdapter = {
  deliveryMode: "gateway",
  chunker: (text, limit) => getCustomChannelRuntime().channel.text.chunkText(text, limit),
  chunkerMode: "text",
  textChunkLimit: 4000,
  resolveTarget: ({ to, allowFrom, mode }) => {
    const trimmed = to?.trim() ?? "";
    const allowListRaw = (allowFrom ?? []).map((entry) => String(entry).trim()).filter(Boolean);
    const hasWildcard = allowListRaw.includes("*");
    const allowList = allowListRaw
      .filter((entry) => entry !== "*")
      .map((entry) =>
        entry
          .replace(/^custom-channel:/i, "")
          .replace(/^custom:/i, "")
          .trim(),
      )
      .filter(Boolean);

    if (trimmed) {
      const normalizedTo = trimmed
        .replace(/^custom-channel:/i, "")
        .replace(/^custom:/i, "")
        .trim();

      if (!normalizedTo) {
        if ((mode === "implicit" || mode === "heartbeat") && allowList.length > 0) {
          return { ok: true, to: allowList[0] };
        }
        return {
          ok: false,
          error: missingTargetError(
            "Custom Channel",
            "<user|group|client> or channels.custom-channel.dm.allowFrom[0]",
          ),
        };
      }

      if (mode === "implicit" || mode === "heartbeat") {
        if (hasWildcard || allowList.length === 0) {
          return { ok: true, to: normalizedTo };
        }
        if (allowList.includes(normalizedTo)) {
          return { ok: true, to: normalizedTo };
        }
        return { ok: true, to: allowList[0] };
      }

      return { ok: true, to: normalizedTo };
    }

    if (allowList.length > 0) {
      return { ok: true, to: allowList[0] };
    }

    return {
      ok: false,
      error: missingTargetError(
        "Custom Channel",
        "<user|group|client> or channels.custom-channel.dm.allowFrom[0]",
      ),
    };
  },
  sendText: async ({ to, text, accountId }) => {
    const result = await sendMessageCustomChannel(to, text, {
      accountId: accountId ?? undefined,
    });
    return { channel: "custom-channel", ...result };
  },
  sendMedia: async ({ to, text, mediaUrl, accountId }) => {
    const result = await sendMessageCustomChannel(to, text, {
      mediaUrl,
      accountId: accountId ?? undefined,
    });
    return { channel: "custom-channel", ...result };
  },
};
