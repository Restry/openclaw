import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { customChannelPlugin } from "./src/channel.js";
import { setCustomChannelRuntime } from "./src/runtime.js";

const plugin = {
  id: "custom-channel",
  name: "Custom Channel",
  description:
    "Custom channel plugin supporting WebSocket and Webhook for web chat tools and mini-programs",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setCustomChannelRuntime(api.runtime);
    api.registerChannel({ plugin: customChannelPlugin });
  },
};

export default plugin;
