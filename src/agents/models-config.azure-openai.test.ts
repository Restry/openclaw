import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(fn, { prefix: "openclaw-azure-" });
}

describe("models-config azure-openai", () => {
  let previousHome: string | undefined;
  let prevApiKey: string | undefined;
  let prevEndpoint: string | undefined;

  beforeEach(() => {
    previousHome = process.env.HOME;
    prevApiKey = process.env.AZURE_OPENAI_API_KEY;
    prevEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  });

  afterEach(() => {
    process.env.HOME = previousHome;
    if (prevApiKey === undefined) {
      delete process.env.AZURE_OPENAI_API_KEY;
    } else {
      process.env.AZURE_OPENAI_API_KEY = prevApiKey;
    }
    if (prevEndpoint === undefined) {
      delete process.env.AZURE_OPENAI_ENDPOINT;
    } else {
      process.env.AZURE_OPENAI_ENDPOINT = prevEndpoint;
    }
  });

  it("adds azure-openai provider when both env vars are set", async () => {
    await withTempHome(async () => {
      vi.resetModules();
      process.env.AZURE_OPENAI_API_KEY = "sk-azure-test-key";
      process.env.AZURE_OPENAI_ENDPOINT = "https://myresource.openai.azure.com";

      const { ensureOpenClawModelsJson } = await import("./models-config.js");
      const { resolveOpenClawAgentDir } = await import("./agent-paths.js");

      await ensureOpenClawModelsJson();

      const modelPath = path.join(resolveOpenClawAgentDir(), "models.json");
      const raw = await fs.readFile(modelPath, "utf8");
      const parsed = JSON.parse(raw) as {
        providers: Record<
          string,
          { apiKey?: string; baseUrl?: string; models?: Array<{ id: string }> }
        >;
      };

      expect(parsed.providers["azure-openai"]).toBeDefined();
      expect(parsed.providers["azure-openai"]?.apiKey).toBe("AZURE_OPENAI_API_KEY");
      expect(parsed.providers["azure-openai"]?.baseUrl).toBe(
        "https://myresource.openai.azure.com",
      );

      const ids = parsed.providers["azure-openai"]?.models?.map((model) => model.id);
      expect(ids).toContain("gpt-4o");
      expect(ids).toContain("gpt-4o-mini");
    });
  });

  it("does not add azure-openai provider when endpoint is missing", async () => {
    await withTempHome(async () => {
      vi.resetModules();
      process.env.AZURE_OPENAI_API_KEY = "sk-azure-test-key";
      delete process.env.AZURE_OPENAI_ENDPOINT;

      const { ensureOpenClawModelsJson } = await import("./models-config.js");
      const { resolveOpenClawAgentDir } = await import("./agent-paths.js");

      const result = await ensureOpenClawModelsJson();

      if (result.wrote) {
        const modelPath = path.join(resolveOpenClawAgentDir(), "models.json");
        const raw = await fs.readFile(modelPath, "utf8");
        const parsed = JSON.parse(raw) as {
          providers: Record<string, unknown>;
        };
        expect(parsed.providers["azure-openai"]).toBeUndefined();
      }
    });
  });

  it("does not add azure-openai provider when api key is missing", async () => {
    await withTempHome(async () => {
      vi.resetModules();
      delete process.env.AZURE_OPENAI_API_KEY;
      process.env.AZURE_OPENAI_ENDPOINT = "https://myresource.openai.azure.com";

      const { ensureOpenClawModelsJson } = await import("./models-config.js");
      const { resolveOpenClawAgentDir } = await import("./agent-paths.js");

      const result = await ensureOpenClawModelsJson();

      if (result.wrote) {
        const modelPath = path.join(resolveOpenClawAgentDir(), "models.json");
        const raw = await fs.readFile(modelPath, "utf8");
        const parsed = JSON.parse(raw) as {
          providers: Record<string, unknown>;
        };
        expect(parsed.providers["azure-openai"]).toBeUndefined();
      }
    });
  });
});
