import { basicSetup, EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import { pluginConfigLanguage } from "./pluginConfigLanguage";
import { pluginConfigLinter } from "./linting";

const initialConfig =
  "iipax.service.brokerkernel.plugin.MailPushPlugin SmtpHost=192.168.0.52 SmtpPort=abc Attachment=1 Attachment=2 UnknownArg=42";

const state = EditorState.create({
  doc: initialConfig,
  extensions: [basicSetup, pluginConfigLanguage, pluginConfigLinter]
});

const editorParent = document.querySelector<HTMLElement>("#editor");

if (!editorParent) {
  throw new Error("Editor mount point not found");
}

new EditorView({
  state,
  parent: editorParent
});
