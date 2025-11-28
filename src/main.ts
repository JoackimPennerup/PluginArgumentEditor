import { minimalSetup, EditorView } from "codemirror";
import { EditorState, Compartment } from "@codemirror/state";
import { autocompletion } from "@codemirror/autocomplete";
import { pluginConfigLanguage } from "./pluginConfigLanguage";
import { createPluginConfigLinter } from "./linting";
import { pluginConfigCompletionSource } from "./completions";
import { triggerCompletionIfNeeded } from "./completionTriggers";
import {
  findTopLevelForPlugin,
  formatTopLevelLabel,
  listTopLevelKeys,
  requestPluginByName
} from "./pluginService";
import { tweakTooltipPositionTheme, singleLineTheme } from "./editorTheme";

const initialConfig =
  "iipax.service.brokerkernel.plugin.MailPushPlugin SmtpHost=192.168.0.52 SmtpPort=abc Attachment=1 Attachment=2 UnknownArg=42";

const topLevelSelect = document.querySelector<HTMLSelectElement>("#registry-select");
const editorContainers = Array.from(
  document.querySelectorAll<HTMLElement>(".param-editor")
);

if (!topLevelSelect) {
  // Without the selector we cannot scope plugin lookups to a registry.
  throw new Error("Registry selector not found");
}

if (editorContainers.length === 0) {
  // The editor needs mount points to render CodeMirror instances.
  throw new Error("Editor mount points not found");
}

const topLevelKeys = listTopLevelKeys();

if (topLevelKeys.length === 0) {
  // Avoid bootstrapping when there are no registries to target.
  throw new Error("No plugin registries found");
}

for (const key of topLevelKeys) {
  const option = document.createElement("option");
  option.value = key;
  option.textContent = formatTopLevelLabel(key);
  topLevelSelect.append(option);
}

const firstDoc = resolveInitialDoc(editorContainers[0], 0);
const detectedTopLevel = findTopLevelForPlugin(firstDoc.split(" ")[0]);
const defaultTopLevel = detectedTopLevel ?? topLevelKeys[0];

topLevelSelect.value = defaultTopLevel;

type EditorInstance = {
  view: EditorView;
  linterCompartment: Compartment;
  completionCompartment: Compartment;
};

function pluginResolver(topLevelKey: string) {
  return (pluginName: string) => requestPluginByName(pluginName, topLevelKey);
}

function pluginLinter(topLevelKey: string) {
  return createPluginConfigLinter(pluginResolver(topLevelKey));
}

function pluginCompletion(topLevelKey: string) {
  return autocompletion({
    override: [pluginConfigCompletionSource(topLevelKey)],
    activateOnTyping: true,
    closeOnPick: false
  });
}

function createEditorInstance(
  mount: HTMLElement,
  topLevelKey: string,
  doc: string
): EditorInstance {
  const linterCompartment = new Compartment();
  const completionCompartment = new Compartment();
  const completionRetarget = EditorView.updateListener.of((update) => {
    if (update.docChanged && update.view.hasFocus) {
      // Keep completions aligned with the caret whenever edits happen.
      triggerCompletionIfNeeded(update.view);
    }
  });

  const state = EditorState.create({
    doc,
    extensions: [
      minimalSetup,
      tweakTooltipPositionTheme,
      singleLineTheme,
      pluginConfigLanguage,
      linterCompartment.of(pluginLinter(topLevelKey)),
      completionCompartment.of(pluginCompletion(topLevelKey)),
      completionRetarget
    ]
  });

  mount.innerHTML = "";

  const view = new EditorView({
    state,
    parent: mount
  });

  view.contentDOM.addEventListener("focus", () => {
    triggerCompletionIfNeeded(view);
  });

  return {
    view,
    linterCompartment,
    completionCompartment
  };
}

const editors = editorContainers.map((container, index) =>
  createEditorInstance(
    container,
    defaultTopLevel,
    resolveInitialDoc(container, index)
  )
);

topLevelSelect.addEventListener("change", (event) => {
  const selectedKey = (event.target as HTMLSelectElement).value;

  for (const { view, linterCompartment, completionCompartment } of editors) {
    view.dispatch({
      effects: [
        linterCompartment.reconfigure(pluginLinter(selectedKey)),
        completionCompartment.reconfigure(pluginCompletion(selectedKey))
      ]
    });

    triggerCompletionIfNeeded(view);
  }
});

function resolveInitialDoc(container: HTMLElement, index: number) {
  const dataConfig =
    container.dataset.initialConfig ?? container.dataset.initial ?? "";
  const inlineConfig = container.textContent?.trim() ?? "";
  const fallbackConfig = index === 0 ? initialConfig : "";

  if (dataConfig.trim().length > 0) {
    return dataConfig.trim();
  }

  if (inlineConfig.length > 0) {
    return inlineConfig;
  }

  return fallbackConfig;
}
