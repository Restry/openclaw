import { describe, expect, it } from "vitest";
import { CustomChannelConfigSchema } from "./config-schema.js";

describe("custom-channel/config-schema", () => {
  describe("CustomChannelConfigSchema", () => {
    it("parses minimal config", () => {
      const result = CustomChannelConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("parses config with websocket settings", () => {
      const result = CustomChannelConfigSchema.safeParse({
        name: "Test Channel",
        enabled: true,
        websocket: {
          enabled: true,
          port: 8080,
          path: "/ws/custom",
          pingIntervalMs: 30000,
          authToken: "secret-token",
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.websocket?.port).toBe(8080);
        expect(result.data.websocket?.path).toBe("/ws/custom");
        expect(result.data.websocket?.authToken).toBe("secret-token");
      }
    });

    it("parses config with webhook settings", () => {
      const result = CustomChannelConfigSchema.safeParse({
        name: "Test Channel",
        enabled: true,
        webhook: {
          enabled: true,
          path: "/webhook/custom",
          authToken: "secret-token",
          callbackUrl: "https://example.com/callback",
          callbackAuthToken: "callback-token",
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.webhook?.path).toBe("/webhook/custom");
        expect(result.data.webhook?.callbackUrl).toBe("https://example.com/callback");
      }
    });

    it("parses config with dm settings", () => {
      const result = CustomChannelConfigSchema.safeParse({
        dm: {
          enabled: true,
          policy: "allowlist",
          allowFrom: ["user1", "user2", 12345],
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dm?.policy).toBe("allowlist");
        expect(result.data.dm?.allowFrom).toEqual(["user1", "user2", 12345]);
      }
    });

    it("parses config with groups settings", () => {
      const result = CustomChannelConfigSchema.safeParse({
        groups: {
          "group-1": {
            enabled: true,
            requireMention: true,
            users: ["user1", "user2"],
          },
          "group-2": {
            enabled: false,
          },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.groups?.["group-1"]?.requireMention).toBe(true);
        expect(result.data.groups?.["group-2"]?.enabled).toBe(false);
      }
    });

    it("parses full config", () => {
      const result = CustomChannelConfigSchema.safeParse({
        name: "My Custom Channel",
        enabled: true,
        groupPolicy: "allowlist",
        textChunkLimit: 2000,
        chunkMode: "newline",
        mediaMaxMb: 10,
        groupAllowFrom: ["group1", "group2"],
        websocket: {
          enabled: true,
          path: "/ws",
        },
        webhook: {
          enabled: true,
          path: "/hook",
        },
        dm: {
          policy: "pairing",
          allowFrom: ["admin"],
        },
        groups: {
          main: {
            enabled: true,
          },
        },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("My Custom Channel");
        expect(result.data.groupPolicy).toBe("allowlist");
        expect(result.data.textChunkLimit).toBe(2000);
      }
    });
  });
});
