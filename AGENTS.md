# Agent Notes

- Registry data now stays server-side: `src/pluginService.ts` simulates async lookups by plugin class name (validated against the grammar) and caches argument payloads per top-level registry. Update the service if the JSON shape changes or if lookups need to evolve.
- The registry selector still reconfigures linting and completion via CodeMirror compartments in `main.ts`; extend that pattern for any new dynamic editor behavior.
- Autocompletion in `src/completions.ts` only suggests arguments after a valid plugin name has been typed; plugin name completion was removed to mirror server constraints.
- Linting and completion both call `requestPluginByName` to mimic the round-trip and share cached argument metadata.
- Vite's dev server is configured to use polling (`vite.config.ts`) so edits inside containers still trigger reloads; keep that in mind if adjusting the dev setup.
- Linting now also warns when an argument name is present without a value to align with server-side validation behavior.
