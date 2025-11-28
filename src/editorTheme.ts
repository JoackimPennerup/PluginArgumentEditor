import { EditorView } from "@codemirror/view";

export const tweakTooltipPositionTheme = EditorView.theme({
  ".cm-tooltip.cm-tooltip-above": {
    // when shown above the text
    transform: "translateY(-4px)",
  },
  ".cm-tooltip.cm-tooltip-below": {
    // when shown below the text
    transform: "translateY(4px)",
  },
});

export const singleLineTheme = EditorView.theme({
  "&": {
    border: "1px solid #ccc",
    borderRadius: "4px",
    fontFamily: "inherit",
  },
  ".cm-scroller": {
    overflow: "hidden"
  },
  ".cm-content": {
    whiteSpace: "nowrap"
  }
});