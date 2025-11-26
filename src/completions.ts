import { Completion, CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { SyntaxNode, TreeCursor } from "@lezer/common";
import { PluginDef, isValidPluginClassName, requestPluginByName } from "./pluginService";

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

const valueNodeNames = new Set(["Value", "String", "Int", "Boolean", "BareValue"]);

function isValueNode(node: SyntaxNode | null): boolean {
  return !!node && valueNodeNames.has(node.type.name);
}

function findValueChild(node: SyntaxNode | null): SyntaxNode | null {
  if (!node) return null;

  let child: SyntaxNode | null = node.firstChild;

  while (child) {
    if (isValueNode(child)) {
      return child;
    }

    child = child.nextSibling;
  }

  return null;
}

// Blocks completions when the caret sits inside a value token (not at its edges).
function isInValue(tree: ReturnType<typeof syntaxTree>, pos: number): boolean {
  const isInside = (node: SyntaxNode | null) =>
    isValueNode(node) && node.from < pos && pos < node.to;

  const nodeBefore = tree.resolveInner(pos, -1);
  const nodeAfter = tree.resolveInner(pos, 1);

  // Only block when the cursor is strictly inside a value token; allow boundaries
  // right after a value can trigger the next completion.
  return isInside(nodeBefore) || isInside(nodeAfter);
}

// Treats everything after the ArgName inside an Arg as value space (closes completions after "=")
// unless the caret sits in trailing whitespace before a value has been entered.
function inArgValueZone(tree: ReturnType<typeof syntaxTree>, doc: string, pos: number): boolean {
  // If the cursor is inside an Arg node but past the ArgName, treat it as value space
  // so completions close when "=" is typed or while editing a value.
  for (const bias of [-1, 1]) {
    let node: SyntaxNode | null = tree.resolveInner(pos, bias);

    while (node) {
      if (node.type.name === "Arg") {
        const nameNode = node.getChild("ArgName");
        if (!nameNode) {
          return true;
        }

        const valueNode = findValueChild(node);
        const afterNameText = doc.slice(nameNode.to, pos);
        const hasValueCharacters = /[^=\s]/.test(afterNameText);

        // If no value has been entered yet (only whitespace or the equals sign)
        // and the cursor has moved into trailing whitespace, keep completions
        // available so another argument can be picked.
        if (!valueNode && !hasValueCharacters && /\s$/.test(afterNameText)) {
          return false;
        }

        if (valueNode && pos > valueNode.to) {
          const afterValueText = doc.slice(valueNode.to, pos);
          return /\S/.test(afterValueText);
        }

        return pos > nameNode.to;
      }
      node = node.parent;
    }
  }

  return false;
}

// Finds the nearest name-bearing node (plugin class or arg name) around the caret.
function findNameNode(
  tree: ReturnType<typeof syntaxTree>,
  pos: number
): SyntaxNode | null {
  for (const bias of [-1, 1]) {
    let node: SyntaxNode | null = tree.resolveInner(pos, bias);

    while (node) {
      if (node.type.name === "PluginClass" || node.type.name === "ArgName") {
        return node;
      }

      node = node.parent;
    }
  }

  return null;
}

// Returns the first plugin node in the document, if any.
function findPluginNode(tree: SyntaxNode): SyntaxNode | null {
  let pluginNode: SyntaxNode | null = null;

  walkTree(tree.cursor(), (cursor) => {
    if (cursor.type.name === "PluginClass" && !pluginNode) {
      pluginNode = cursor.node;
    }
  });

  return pluginNode;
}

// Collects argument names that already appear, preserving original casing.
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

// Builds completion options for arguments, filtering non-multivalued duplicates.
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
      info: def.description,
      apply: key + "="
    }));
}

function matchBefore(
  doc: string,
  pos: number,
  pattern: RegExp
): { from: number; to: number } | null {
  const textBefore = doc.slice(0, pos);
  const match = textBefore.match(pattern);

  if (!match || match.index === undefined || match[0].length === 0) {
    return null;
  }

  return { from: pos - match[0].length, to: pos };
}

/**
 * Determines the text range that should be selected when triggering completions.
 */
export function findCompletionRange(
  state: EditorState
): { from: number; to: number } | null {
  const tree = syntaxTree(state);
  const pos = state.selection.main.head;
  const doc = state.doc.toString();

  if (isInValue(tree, pos) || inArgValueZone(tree, doc, pos)) {
    // Avoid selecting ranges when the caret is inside an argument value.
    return null;
  }

  const targetNode = findNameNode(tree, pos);

  if (!targetNode) {
    return null;
  }

  if (targetNode.type.name === "PluginClass") {
    // Plugin names are typed manually, so do not try to drive completions for them.
    return null;
  }

  return matchBefore(doc, pos, /[A-Za-z_][A-Za-z0-9_]*$/);
}

/**
 * Builds a completion source that loads argument suggestions from the plugin service.
 */
export function pluginConfigCompletionSource(topLevelKey: string) {
  return async (context: CompletionContext) => {
    const tree = syntaxTree(context.state);
    const doc = context.state.doc.toString();
    const pluginNode = findPluginNode(tree.topNode);

    if (isInValue(tree, context.pos) || inArgValueZone(tree, doc, context.pos)) {
      // Completions should not appear inside argument values.
      return null;
    }

    // Without a plugin class there is no target to resolve argument definitions from.
    if (!pluginNode || context.pos <= pluginNode.to) {
      // Plugin arguments can only be suggested after the plugin has been specified.
      return null;
    }

    const pluginName = readNodeText(pluginNode, doc);

    if (!isValidPluginClassName(pluginName)) {
      // Skip remote lookups until the classpath format is valid.
      return null;
    }

    const pluginDef = await requestPluginByName(pluginName, topLevelKey);

    if (!pluginDef) {
      // Without a resolved plugin there are no argument definitions to suggest.
      return null;
    }

    const argMatch = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
    const from = argMatch?.from ?? context.pos;

    const seenArgs = collectArgs(tree.topNode, doc);
    const argOptions = buildArgOptions(pluginDef, seenArgs);

    return {
      from,
      options: argOptions,
      validFor: /[A-Za-z_][A-Za-z0-9_]*/
    };
  };
}
