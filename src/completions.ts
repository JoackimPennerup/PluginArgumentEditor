import { Completion, CompletionContext } from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { SyntaxNode, TreeCursor } from "@lezer/common";
import { PluginDef } from "./pluginRegistry";

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

function findPluginNode(tree: SyntaxNode): SyntaxNode | null {
  let pluginNode: SyntaxNode | null = null;

  walkTree(tree.cursor(), (cursor) => {
    if (cursor.type.name === "PluginClass" && !pluginNode) {
      pluginNode = cursor.node;
    }
  });

  return pluginNode;
}

function collectArgs(tree: SyntaxNode, doc: string): string[] {
  const args: string[] = [];

  walkTree(tree.cursor(), (cursor) => {
    if (cursor.type.name === "Arg") {
      const nameNode = cursor.node.getChild("ArgName");

      if (nameNode) {
        args.push(readNodeText(nameNode, doc));
      }
    }
  });

  return args;
}

function buildPluginOptions(pluginMap: Map<string, PluginDef>): Completion[] {
  return Array.from(pluginMap.values()).map((plugin) => ({
    label: plugin.name,
    type: "class",
    detail: "Plugin",
    info: plugin.description
  }));
}

function buildArgOptions(plugin: PluginDef, seenArgs: string[]): Completion[] {
  const seen = new Map<string, number>();

  for (const arg of seenArgs) {
    const count = (seen.get(arg.toLowerCase()) ?? 0) + 1;
    seen.set(arg.toLowerCase(), count);
  }

  return Object.entries(plugin.arguments)
    .filter(([key, def]) => def.multivalued || (seen.get(key.toLowerCase()) ?? 0) === 0)
    .map(([key, def]) => ({
      label: key,
      type: "property",
      detail: def.type,
      info: def.description
    }));
}

export function pluginConfigCompletionSource(pluginMap: Map<string, PluginDef>) {
  const pluginOptions = buildPluginOptions(pluginMap);

  return (context: CompletionContext) => {
    const tree = syntaxTree(context.state);
    const doc = context.state.doc.toString();
    const pluginNode = findPluginNode(tree.topNode);
    const nodeBefore = tree.resolveInner(context.pos, -1);

    const inValue = /^(Value|String|Int|Boolean|BareValue)$/.test(nodeBefore.type.name);
    if (inValue) {
      return null;
    }

    const pluginMatch = context.matchBefore(/[A-Za-z0-9_.]*/);

    if (!pluginNode || nodeBefore.type.name === "PluginClass" || context.pos <= pluginNode.to) {
      if (!pluginMatch || (pluginMatch.from === pluginMatch.to && !context.explicit)) {
        return null;
      }

      return {
        from: pluginMatch.from,
        options: pluginOptions,
        validFor: /[A-Za-z0-9_.]*/
      };
    }

    const pluginName = readNodeText(pluginNode, doc);
    const pluginDef = pluginMap.get(pluginName);

    if (!pluginDef) {
      return null;
    }

    const argMatch = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);

    if (!argMatch || (argMatch.from === argMatch.to && !context.explicit)) {
      return null;
    }

    const seenArgs = collectArgs(tree.topNode, doc);
    const argOptions = buildArgOptions(pluginDef, seenArgs);

    return {
      from: argMatch.from,
      options: argOptions,
      validFor: /[A-Za-z_][A-Za-z0-9_]*/
    };
  };
}
