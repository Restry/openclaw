import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setCustomChannelRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getCustomChannelRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Custom channel runtime not initialized");
  }
  return runtime;
}
