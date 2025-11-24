# Agent Notes

- The registry-aware behavior (combobox, linting, and autocompletion) now depends on the selected top-level plugin key. Update `pluginRegistry.ts` if the registry shape changes, because both linting and completions pull their data from `getPluginMapForTopLevel`.
- `main.ts` uses CodeMirror compartments to reconfigure linting and completion when the registry selection changes; prefer extending that pattern for future dynamic editor settings.
- Autocompletion logic lives in `src/completions.ts` and is designed around the current grammar tokens (`PluginClass` and `ArgName`). If the grammar shifts, revisit the node-name checks there.
