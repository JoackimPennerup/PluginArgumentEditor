import { minimalSetup, EditorView } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { autocompletion, startCompletion } from "@codemirror/autocomplete";
import { pluginConfigLanguage } from "./pluginConfigLanguage";
import { createPluginConfigLinter } from "./linting";
import { findCompletionRange, pluginConfigCompletionSource } from "./completions";
import {
  findTopLevelForPlugin,
  formatTopLevelLabel,
  listTopLevelKeys,
  requestPluginByName
} from "./pluginService";

const initialConfig =
  "iipax.service.brokerkernel.plugin.MailPushPlugin SmtpHost=192.168.0.52 SmtpPort=abc Attachment=1 Attachment=2 UnknownArg=42";

const topLevelSelect = document.querySelector<HTMLSelectElement>("#registry-select");
const editorParent = document.querySelector<HTMLElement>("#editor");

if (!topLevelSelect) {
  // Without the selector we cannot scope plugin lookups to a registry.
  throw new Error("Registry selector not found");
}

if (!editorParent) {
  // The editor needs a mount point to render the CodeMirror instance.
  throw new Error("Editor mount point not found");
}

const topLevelKeys = listTopLevelKeys();

for (const key of topLevelKeys) {
  const option = document.createElement("option");
  option.value = key;
  option.textContent = formatTopLevelLabel(key);
  topLevelSelect.append(option);
}

const detectedTopLevel = findTopLevelForPlugin(initialConfig.split(" ")[0]);
const defaultTopLevel = detectedTopLevel ?? topLevelKeys[0];

if (!defaultTopLevel) {
  // Avoid bootstrapping when there are no registries to target.
  throw new Error("No plugin registries found");
}

topLevelSelect.value = defaultTopLevel;

const linterCompartment = new Compartment();
const completionCompartment = new Compartment();
const completionRetarget = EditorView.updateListener.of((update) => {
  if (update.docChanged && update.view.hasFocus) {
    // Keep completions aligned with the caret whenever edits happen.
    triggerCompletionIfFocused();
  }
});

function pluginResolver(topLevelKey: string) {
  return (pluginName: string) => requestPluginByName(pluginName, topLevelKey);
}

function pluginLinter(topLevelKey: string) {
  return createPluginConfigLinter(pluginResolver(topLevelKey));
}

function pluginCompletion(topLevelKey: string) {
  return autocompletion({
    override: [pluginConfigCompletionSource(topLevelKey)],
    activateOnTyping: true
  });
}

function triggerCompletionIfFocused() {
  if (!view.hasFocus) {
    // Do not change selections while the editor is blurred.
    return;
  }

  const match = findCompletionRange(view.state);

  if (match && match.from < match.to) {
    // Preselect the active token so the completion popup targets the right span.
    view.dispatch({ selection: { anchor: match.from, head: match.to } });
  }

  startCompletion(view);
}

const state = EditorState.create({
  doc: initialConfig,
  extensions: [
    minimalSetup,
    pluginConfigLanguage,
    linterCompartment.of(pluginLinter(defaultTopLevel)),
    completionCompartment.of(pluginCompletion(defaultTopLevel)),
    completionRetarget
  ]
});

const view = new EditorView({
  state,
  parent: editorParent
});

view.contentDOM.addEventListener("focus", () => {
  triggerCompletionIfFocused();
});

topLevelSelect.addEventListener("change", (event) => {
  const selectedKey = (event.target as HTMLSelectElement).value;

  view.dispatch({
    effects: [
      linterCompartment.reconfigure(pluginLinter(selectedKey)),
      completionCompartment.reconfigure(pluginCompletion(selectedKey))
    ]
  });

  triggerCompletionIfFocused();
});
