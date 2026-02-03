import { describe, expect, it } from "vitest";
import type { CoreConfig } from "./types.js";
import {
  listCustomChannelAccountIds,
  resolveCustomChannelAccount,
  resolveDefaultCustomChannelAccountId,
} from "./types.js";

describe("custom-channel/types", () => {
  describe("listCustomChannelAccountIds", () => {
    it("returns empty array when no config", () => {
      const cfg = {} as CoreConfig;
      expect(listCustomChannelAccountIds(cfg)).toEqual([]);
    });

    it("returns default account when config exists", () => {
      const cfg = {
        channels: {
          "custom-channel": {
            enabled: true,
          },
        },
      } as CoreConfig;
      expect(listCustomChannelAccountIds(cfg)).toEqual(["default"]);
    });
  });

  describe("resolveDefaultCustomChannelAccountId", () => {
    it("returns default", () => {
      const cfg = {} as CoreConfig;
      expect(resolveDefaultCustomChannelAccountId(cfg)).toBe("default");
    });
  });

  describe("resolveCustomChannelAccount", () => {
    it("returns default account with defaults when no config", () => {
      const cfg = {} as CoreConfig;
      const account = resolveCustomChannelAccount({ cfg });

      expect(account.accountId).toBe("default");
      // enabled defaults to true, configured defaults to true (ws/webhook enabled by default)
      expect(account.enabled).toBe(true);
      expect(account.configured).toBe(true);
    });

    it("returns configured account with websocket enabled", () => {
      const cfg = {
        channels: {
          "custom-channel": {
            enabled: true,
            name: "Test Channel",
            websocket: {
              enabled: true,
              path: "/ws/test",
            },
          },
        },
      } as CoreConfig;
      const account = resolveCustomChannelAccount({ cfg });

      expect(account.accountId).toBe("default");
      expect(account.name).toBe("Test Channel");
      expect(account.enabled).toBe(true);
      expect(account.configured).toBe(true);
      expect(account.config.websocket?.path).toBe("/ws/test");
    });

    it("returns configured account with webhook enabled", () => {
      const cfg = {
        channels: {
          "custom-channel": {
            enabled: true,
            webhook: {
              enabled: true,
              path: "/webhook/test",
              callbackUrl: "https://example.com/callback",
            },
          },
        },
      } as CoreConfig;
      const account = resolveCustomChannelAccount({ cfg });

      expect(account.enabled).toBe(true);
      expect(account.configured).toBe(true);
      expect(account.config.webhook?.callbackUrl).toBe("https://example.com/callback");
    });

    it("returns disabled when channel is disabled", () => {
      const cfg = {
        channels: {
          "custom-channel": {
            enabled: false,
          },
        },
      } as CoreConfig;
      const account = resolveCustomChannelAccount({ cfg });

      expect(account.enabled).toBe(false);
    });
  });
});
