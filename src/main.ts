import { minimalSetup, EditorView } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { autocompletion } from "@codemirror/autocomplete";
import { pluginConfigLanguage } from "./pluginConfigLanguage";
import { createPluginConfigLinter } from "./linting";
import {
  findTopLevelForPlugin,
  formatTopLevelLabel,
  getPluginMapForTopLevel,
  listTopLevelKeys
} from "./pluginRegistry";
import { pluginConfigCompletionSource } from "./completions";
import { triggerCompletionIfNeeded } from "./completionTriggers";

const initialConfig =
  "iipax.service.brokerkernel.plugin.MailPushPlugin SmtpHost=192.168.0.52 SmtpPort=abc Attachment=1 Attachment=2 UnknownArg=42";

const topLevelSelect = document.querySelector<HTMLSelectElement>("#registry-select");
const editorParent = document.querySelector<HTMLElement>("#editor");

if (!topLevelSelect) {
  throw new Error("Registry selector not found");
}

if (!editorParent) {
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
  throw new Error("No plugin registries found");
}

topLevelSelect.value = defaultTopLevel;

const linterCompartment = new Compartment();
const completionCompartment = new Compartment();
const completionRetarget = EditorView.updateListener.of((update) => {
  if (update.docChanged && update.view.hasFocus) {
    triggerCompletionIfFocused();
  }
});

function pluginLinter(topLevelKey: string) {
  const pluginMap = getPluginMapForTopLevel(topLevelKey);
  return createPluginConfigLinter(pluginMap);
}
function pluginCompletion(topLevelKey: string) {
  const pluginMap = getPluginMapForTopLevel(topLevelKey);
  return autocompletion({
    override: [pluginConfigCompletionSource(pluginMap)],
    activateOnTyping: true,
    closeOnPick: false
  });
}

function triggerCompletionIfFocused() {
  triggerCompletionIfNeeded(view);
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
