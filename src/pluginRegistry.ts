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

function buildPluginMap(): Map<string, PluginDef> {
  const map = new Map<string, PluginDef>();

  for (const pluginList of Object.values(registryData)) {
    for (const plugin of pluginList) {
      map.set(plugin.name, plugin as PluginDef);
    }
  }

  return map;
}

export const pluginsByName: Map<string, PluginDef> = buildPluginMap();
