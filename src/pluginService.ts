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

export const BROKER_PREFIX = "iipax.generic.plugin.broker.";

const registry: PluginRegistry = registryData as PluginRegistry;
const pluginMapsByTopLevel = new Map<string, Map<string, PluginDef>>();
const pluginToTopLevel = new Map<string, string>();
const pluginCache = new Map<string, PluginDef>();
const validPluginClassPattern = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*$/;
const REQUEST_LATENCY_MS = 50;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(function buildPluginMaps() {
  for (const [topLevel, pluginList] of Object.entries(registry)) {
    const map = new Map<string, PluginDef>();

    for (const plugin of pluginList) {
      map.set(plugin.name, plugin as PluginDef);
      pluginToTopLevel.set(plugin.name, topLevel);
    }

    pluginMapsByTopLevel.set(topLevel, map);
  }
})();

function makeCacheKey(pluginName: string, topLevel?: string): string {
  return `${topLevel ?? ""}::${pluginName}`;
}

/**
 * Formats a registry key into a user-facing label by trimming the broker prefix.
 */
export function formatTopLevelLabel(key: string): string {
  return key.startsWith(BROKER_PREFIX) ? key.slice(BROKER_PREFIX.length) : key;
}

/**
 * Lists all available top-level registry keys in their original order.
 */
export function listTopLevelKeys(): string[] {
  return Array.from(pluginMapsByTopLevel.keys());
}

/**
 * Returns the registry key that holds the requested plugin, if one is known.
 */
export function findTopLevelForPlugin(pluginName: string): string | undefined {
  return pluginToTopLevel.get(pluginName);
}

/**
 * Checks whether the provided plugin class name matches the supported grammar.
 */
export function isValidPluginClassName(pluginName: string): boolean {
  return validPluginClassPattern.test(pluginName);
}

/**
 * Simulates a remote lookup for a plugin definition scoped to an optional registry key.
 * When the plugin is found, the arguments are cached for the rest of the session.
 */
export async function requestPluginByName(
  pluginName: string,
  topLevel?: string
): Promise<PluginDef | null> {
  if (!isValidPluginClassName(pluginName)) {
    // Skip the round-trip for malformed class names to mirror server-side validation.
    return null;
  }

  const resolvedTopLevel = topLevel ?? findTopLevelForPlugin(pluginName);
  const cacheKey = makeCacheKey(pluginName, resolvedTopLevel);
  const cached = pluginCache.get(cacheKey);

  if (cached) {
    // Reuse the previously fetched arguments when they were already requested.
    return cached;
  }

  const pluginDef = resolvedTopLevel
    ? pluginMapsByTopLevel.get(resolvedTopLevel)?.get(pluginName) ?? null
    : null;

  // Simulate server latency before delivering the response.
  await delay(REQUEST_LATENCY_MS);

  if (pluginDef) {
    // Cache successful lookups so subsequent requests avoid the delay.
    pluginCache.set(cacheKey, pluginDef);
    return pluginDef;
  }

  return null;
}
