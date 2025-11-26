import { startCompletion } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";

import { findCompletionRange } from "./completions";

/**
 * Triggers autocompletion when the editor is focused and the cursor is at a
 * position that should receive suggestions. This intentionally avoids
 * adjusting the current selection so continued typing doesn't overwrite text.
 */
export function triggerCompletionIfNeeded(view: EditorView) {
  if (!view.hasFocus) {
    return;
  }

  const match = findCompletionRange(view.state);

  if (!match) {
    return;
  }

  startCompletion(view);
}
