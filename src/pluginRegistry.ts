import registryData from "./iipax-product.json";

export type ArgType = "string" | "int" | "boolean";

export interface ArgumentDef {
  type: ArgType;
  description?: string;
  multivalued?: boolean;
}

export interface PluginDef {
  name: string;
  description?: string;
  arguments: Record<string, ArgumentDef>;
}

export type TopLevelKey = keyof typeof registryData;

export const BROKER_PREFIX = "iipax.generic.plugin.broker.";

const pluginMapsByTopLevel = new Map<string, Map<string, PluginDef>>();
const pluginToTopLevel = new Map<string, string>();

(function buildPluginMaps() {
  for (const [topLevel, pluginList] of Object.entries(registryData)) {
    const map = new Map<string, PluginDef>();

    for (const plugin of pluginList) {
      map.set(plugin.name, plugin as PluginDef);
      pluginToTopLevel.set(plugin.name, topLevel);
    }

    pluginMapsByTopLevel.set(topLevel, map);
  }
})();

export function listTopLevelKeys(): string[] {
  return Array.from(pluginMapsByTopLevel.keys());
}

export function formatTopLevelLabel(key: string): string {
  return key.startsWith(BROKER_PREFIX) ? key.slice(BROKER_PREFIX.length) : key;
}

export function getPluginMapForTopLevel(topLevel: string): Map<string, PluginDef> {
  return pluginMapsByTopLevel.get(topLevel) ?? new Map();
}

export function findTopLevelForPlugin(pluginName: string): string | undefined {
  return pluginToTopLevel.get(pluginName);
}
