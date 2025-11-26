import { beforeAll, describe, expect, it } from "vitest";
import { minimalSetup } from "codemirror";
import { CompletionContext, autocompletion } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { JSDOM } from "jsdom";

import { pluginConfigCompletionSource } from "./completions";
import { pluginConfigLanguage } from "./pluginConfigLanguage";
import type { PluginDef } from "./pluginRegistry";
import { triggerCompletionIfNeeded } from "./completionTriggers";

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

beforeAll(() => {
  const { window } = new JSDOM("<body></body>");
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 0);
  }

  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = (id: number) => clearTimeout(id);
  }

  if (!window.Range.prototype.getBoundingClientRect) {
    window.Range.prototype.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON: () => ({})
    });
  }

  if (!window.Range.prototype.getClientRects) {
    window.Range.prototype.getClientRects = () => ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* () {}
    } as unknown as DOMRectList);
  }

  // @ts-expect-error jsdom globals for CodeMirror
  global.window = window;
  // @ts-expect-error jsdom globals for CodeMirror
  global.document = window.document;
  // @ts-expect-error jsdom globals for CodeMirror
  global.MutationObserver = window.MutationObserver;
  // @ts-expect-error jsdom globals for CodeMirror
  Object.defineProperty(global, "navigator", {
    value: window.navigator,
    configurable: true
  });
});

function createView(doc = `${pluginName} `) {
  const state = EditorState.create({
    doc,
    extensions: [
      minimalSetup,
      pluginConfigLanguage,
      autocompletion({
        override: [completionSource],
        activateOnTyping: true,
        closeOnPick: false
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && update.view.hasFocus) {
          triggerCompletionIfNeeded(update.view);
        }
      })
    ]
  });

  const parent = document.createElement("div");
  document.body.appendChild(parent);

  return new EditorView({ state, parent });
}

describe("completion retargeting", () => {
  it("keeps the selection collapsed so multiple characters can be typed", () => {
    const view = createView();
    view.focus();

    view.dispatch({
      changes: { from: view.state.doc.length, insert: "A" },
      selection: { anchor: view.state.doc.length + 1 }
    });

    view.dispatch({
      changes: { from: view.state.doc.length, insert: "lpha" },
      selection: { anchor: view.state.doc.length + 4 }
    });

    expect(view.state.doc.toString()).toBe(`${pluginName} Alpha`);
    expect(view.state.selection.main.from).toBe(view.state.doc.length);
    expect(view.state.selection.main.empty).toBe(true);

    view.destroy();
  });

  it("keeps the cursor after applying a completion so additional text appends", () => {
    const view = createView();
    view.focus();

    const context = new CompletionContext(view.state, view.state.doc.length, true);
    const result = completionSource(context);
    const alphaCompletion = result?.options.find((option) => option.label === "Alpha");

    if (!result || !alphaCompletion) {
      throw new Error("Missing completion data for Alpha");
    }

    const insertText = typeof alphaCompletion.apply === "string" ? alphaCompletion.apply : "";

    view.dispatch({
      changes: { from: result.from, to: context.pos, insert: insertText },
      selection: { anchor: result.from + insertText.length }
    });

    view.dispatch({
      changes: { from: view.state.doc.length, insert: "foo" },
      selection: { anchor: view.state.doc.length + 3 }
    });

    expect(view.state.doc.toString()).toBe(`${pluginName} Alpha=foo`);
    expect(view.state.selection.main.from).toBe(view.state.doc.length);
    expect(view.state.selection.main.empty).toBe(true);

    view.destroy();
  });
});
