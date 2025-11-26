import { Diagnostic, linter } from "@codemirror/lint";
import { syntaxTree } from "@codemirror/language";
import { SyntaxNode, TreeCursor } from "@lezer/common";
import { PluginDef, requestPluginByName } from "./pluginService";

interface PluginResolver {
  (pluginName: string): PluginDef | null | Promise<PluginDef | null>;
}

function walkTree(cursor: TreeCursor, visit: (cursor: TreeCursor) => void) {
  for (;;) {
    visit(cursor);
    if (cursor.firstChild()) continue;
    while (!cursor.nextSibling()) {
      if (!cursor.parent()) return;
    }
  }
}

function readNodeText(node: SyntaxNode, doc: string): string {
  return doc.slice(node.from, node.to);
}

function findValueNode(node: SyntaxNode): SyntaxNode | null {
  return (
    node.getChild("String") ||
    node.getChild("Int") ||
    node.getChild("Boolean") ||
    node.getChild("BareValue") ||
    node.getChild("Value") ||
    null
  );
}

function validateArgument(
  argName: string,
  valueText: string,
  def: PluginDef["arguments"][string]
): "error" | null {
  if (def.type === "int") {
    return /^-?\d+$/.test(valueText) ? null : "error";
  }

  if (def.type === "boolean") {
    return /^(true|false)$/i.test(valueText) ? null : "error";
  }

  return null;
}

/**
 * Creates a CodeMirror linter that validates plugin arguments using a resolver service.
 */
export function createPluginConfigLinter(resolvePlugin: PluginResolver = requestPluginByName) {
  const resolver: PluginResolver = resolvePlugin;

  return linter(async (view) => {
    const diagnostics: Diagnostic[] = [];
    const tree = syntaxTree(view.state);
    const doc = view.state.doc.toString();

    let pluginNode: SyntaxNode | null = null;
    const args: { nameNode: SyntaxNode; valueNode: SyntaxNode | null }[] = [];

    walkTree(tree.cursor(), (cursor) => {
      if (cursor.type.name === "PluginClass" && !pluginNode) {
        // Track the first plugin declaration to anchor argument lookups.
        pluginNode = cursor.node;
      }

      if (cursor.type.name === "Arg") {
        // Capture each argument node so we can validate naming, multiplicity, and values.
        const nameNode = cursor.node.getChild("ArgName");
        const valueNode = findValueNode(cursor.node);

        if (nameNode) {
          args.push({ nameNode, valueNode });
        }
      }
    });

    if (!pluginNode) {
      // Without a plugin class there is nothing to validate.
      return diagnostics;
    }

    const pluginName = readNodeText(pluginNode, doc);
    const pluginDef = await resolver(pluginName);

    if (!pluginDef) {
      // Surface a warning when the plugin cannot be loaded from the active registry.
      diagnostics.push({
        from: pluginNode.from,
        to: pluginNode.to,
        message: `Unknown plugin: ${pluginName} (not found in classpath).`,
        severity: "warning"
      });
      return diagnostics;
    }

    const argDefs = new Map<string, { canonical: string; def: PluginDef["arguments"][string] }>();
    for (const [key, def] of Object.entries(pluginDef.arguments)) {
      argDefs.set(key.toLowerCase(), { canonical: key, def });
    }

    const seenCounts = new Map<string, number>();

    for (const { nameNode, valueNode } of args) {
      const typedName = readNodeText(nameNode, doc);
      const lookup = argDefs.get(typedName.toLowerCase());

      if (!lookup) {
        // Flag any argument names that the plugin does not define.
        diagnostics.push({
          from: nameNode.from,
          to: nameNode.to,
          message: `Unknown argument '${typedName}' for plugin ${pluginName}.`,
          severity: "warning"
        });
        continue;
      }

      const count = (seenCounts.get(lookup.canonical) ?? 0) + 1;
      seenCounts.set(lookup.canonical, count);

      if (count > 1 && !lookup.def.multivalued) {
        // Warn when non-multivalued arguments are repeated.
        diagnostics.push({
          from: nameNode.from,
          to: nameNode.to,
          message: `Argument '${lookup.canonical}' may only be specified once.`,
          severity: "warning"
        });
      }

      const valueText = valueNode ? readNodeText(valueNode, doc) : "";
      const typeError = validateArgument(lookup.canonical, valueText, lookup.def);

      if (typeError === "error") {
        // Surface type validation failures based on the plugin's argument metadata.
        diagnostics.push({
          from: valueNode ? valueNode.from : nameNode.to,
          to: valueNode ? valueNode.to : nameNode.to,
          message:
            lookup.def.type === "int"
              ? `Argument '${lookup.canonical}' must be an integer.`
              : `Argument '${lookup.canonical}' must be a boolean.`,
          severity: "error"
        });
      }
    }

    return diagnostics;
  });
}

export const pluginConfigLinter = createPluginConfigLinter();
