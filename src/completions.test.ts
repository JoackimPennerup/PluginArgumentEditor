import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { pluginConfigCompletionSource } from "./completions";
import { pluginConfigLanguage } from "./pluginConfigLanguage";
import type { PluginDef } from "./pluginRegistry";

const pluginName = "example.plugin.DemoPlugin";
const pluginDef: PluginDef = {
  name: pluginName,
  description: "Demo plugin for completion tests",
  arguments: {
    Alpha: { type: "string" },
    Beta: { type: "int" },
    Gamma: { type: "boolean" }
  }
};

const pluginMap = new Map<string, PluginDef>([[pluginName, pluginDef]]);
const completionSource = pluginConfigCompletionSource(pluginMap);

function buildContext(doc: string, pos?: number) {
  const state = EditorState.create({
    doc,
    extensions: [pluginConfigLanguage]
  });

  return new CompletionContext(state, pos ?? doc.length, true);
}

describe("plugin completions", () => {
  it("suggests arguments after a plugin name and space", () => {
    const context = buildContext(`${pluginName} `);
    const result = completionSource(context);

    expect(result?.options.map((option) => option.label)).toContain("Alpha");
  });

  it("narrows argument suggestions based on partial input", () => {
    const doc = `${pluginName} Ga`;
    const context = buildContext(doc);
    const result = completionSource(context);

    expect(result?.from).toBe(doc.length - 2);
    expect(result?.options.map((option) => option.label)).toContain("Gamma");
  });

  it("inserts an equals sign when an argument completion is picked", () => {
    const context = buildContext(`${pluginName} `);
    const result = completionSource(context);
    const alphaCompletion = result?.options.find((option) => option.label === "Alpha");

    expect(alphaCompletion?.apply).toBe("Alpha=");
  });

  it("keeps showing argument suggestions after selecting an argument name", () => {
    const context = buildContext(`${pluginName} Alpha=`);
    const result = completionSource(context);

    expect(result?.options.map((option) => option.label)).toContain("Beta");
    expect(result?.options.map((option) => option.label)).not.toContain("Alpha");
  });
});
