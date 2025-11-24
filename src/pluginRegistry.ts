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

export type PluginRegistry = Record<string, PluginDef[]>;

const registry: PluginRegistry = registryData as PluginRegistry;

function buildPluginsByType(source: PluginRegistry): Map<string, PluginDef[]> {
  return new Map<string, PluginDef[]>(Object.entries(source));
}

function buildPluginsByName(source: PluginRegistry): Map<string, PluginDef> {
  const map = new Map<string, PluginDef>();

  for (const pluginList of Object.values(source)) {
    for (const plugin of pluginList) {
      map.set(plugin.name, plugin);
    }
  }

  return map;
}

export const pluginsByType = buildPluginsByType(registry);
export const pluginsByName: Map<string, PluginDef> = buildPluginsByName(registry);
