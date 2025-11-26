import { describe, expect, it, vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { pluginConfigLanguage } from "./pluginConfigLanguage";
import type { PluginDef } from "./pluginService";

const pluginData = vi.hoisted(() => ({
  pluginName: "example.plugin.DemoPlugin",
  pluginDef: {
    name: "example.plugin.DemoPlugin",
    description: "Demo plugin for completion tests",
    arguments: {
      Alpha: { type: "string" },
      Beta: { type: "int" },
      Gamma: { type: "boolean" }
    }
  } satisfies PluginDef,
  topLevelKey: "test.registry"
}));

vi.mock("./pluginService", () => ({
  __esModule: true,
  isValidPluginClassName: () => true,
  requestPluginByName: vi.fn(async (pluginName: string) =>
    pluginName === pluginData.pluginName ? pluginData.pluginDef : null
  )
}));

const { pluginConfigCompletionSource } = await import("./completions");

function buildContext(doc: string, pos?: number) {
  const state = EditorState.create({
    doc,
    extensions: [pluginConfigLanguage]
  });

  return new CompletionContext(state, pos ?? doc.length, true);
}

describe("plugin completions", () => {
  it("suggests arguments after a plugin name and space", () => {
    const context = buildContext(`${pluginData.pluginName} `);
    const completionSource = pluginConfigCompletionSource(pluginData.topLevelKey);
    const result = completionSource(context);

    return result.then((data) => {
      expect(data?.options.map((option) => option.label)).toContain("Alpha");
    });
  });

  it("narrows argument suggestions based on partial input", async () => {
    const doc = `${pluginData.pluginName} Ga`;
    const context = buildContext(doc);
    const completionSource = pluginConfigCompletionSource(pluginData.topLevelKey);
    const result = await completionSource(context);

    expect(result?.from).toBe(doc.length - 2);
    expect(result?.options.map((option) => option.label)).toContain("Gamma");
  });

  it("inserts an equals sign when an argument completion is picked", async () => {
    const context = buildContext(`${pluginData.pluginName} `);
    const completionSource = pluginConfigCompletionSource(pluginData.topLevelKey);
    const result = await completionSource(context);
    const alphaCompletion = result?.options.find((option) => option.label === "Alpha");

    expect(alphaCompletion?.apply).toBe("Alpha=");
  });

  it("closes suggestions while entering a value and reopens after leaving it", async () => {
    const duringValueContext = buildContext(`${pluginData.pluginName} Alpha=`);
    const completionSource = pluginConfigCompletionSource(pluginData.topLevelKey);
    const duringValueResult = await completionSource(duringValueContext);

    expect(duringValueResult).toBeNull();

    const afterValueContext = buildContext(`${pluginData.pluginName} Alpha=1 `);
    const afterValueResult = await completionSource(afterValueContext);

    expect(afterValueResult?.options.map((option) => option.label)).toContain("Beta");
    expect(afterValueResult?.options.map((option) => option.label)).not.toContain("Alpha");
  });

  it("shows suggestions again after selecting an argument without entering a value", async () => {
    const context = buildContext(`${pluginData.pluginName} Alpha= `);
    const completionSource = pluginConfigCompletionSource(pluginData.topLevelKey);
    const result = await completionSource(context);

    expect(result?.options.map((option) => option.label)).toContain("Beta");
    expect(result?.options.map((option) => option.label)).not.toContain("Alpha");
  });
});
