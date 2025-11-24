import { Diagnostic, linter } from "@codemirror/lint";
import { syntaxTree } from "@codemirror/language";
import { SyntaxNode, TreeCursor } from "@lezer/common";
import { pluginsByName, PluginDef } from "./pluginRegistry";

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

export function createPluginConfigLinter(
  resolvePlugin: PluginResolver = (name) => pluginsByName.get(name) ?? null
) {
  return linter(async (view) => {
    const diagnostics: Diagnostic[] = [];
    const tree = syntaxTree(view.state);
    const doc = view.state.doc.toString();

    let pluginNode: SyntaxNode | null = null;
    const args: { nameNode: SyntaxNode; valueNode: SyntaxNode | null }[] = [];

    walkTree(tree.cursor(), (cursor) => {
      if (cursor.type.name === "PluginClass" && !pluginNode) {
        pluginNode = cursor.node;
      }

      if (cursor.type.name === "Arg") {
        const nameNode = cursor.node.getChild("ArgName");
        const valueNode = findValueNode(cursor.node);

        if (nameNode) {
          args.push({ nameNode, valueNode });
        }
      }
    });

    if (!pluginNode) {
      return diagnostics;
    }

    const pluginName = readNodeText(pluginNode, doc);
    const pluginDef = await resolvePlugin(pluginName);

    if (!pluginDef) {
      diagnostics.push({
        from: pluginNode.from,
        to: pluginNode.to,
        message: `Unknown plugin: ${pluginName} (not found in registry).`,
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
