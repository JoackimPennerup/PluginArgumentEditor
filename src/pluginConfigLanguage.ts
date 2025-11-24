import { LRLanguage } from "@codemirror/language";
import { parser } from "./pluginConfigParser";

export const pluginConfigLanguage = LRLanguage.define({
  parser
});
