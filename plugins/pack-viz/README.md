# pack-viz (dataset-embedded UI plugin)

This folder is a **dataset-embedded UI plugin** intended to ship *with* the dataset.

It provides a couple of lightweight visualizations for this Cub Scout pack dataset:

- **Pack org tree**: builds a tree using `parent` pointers (HIER-001).
- **Den roster**: shows den leaders + scouts (leaders from den fields, scouts from children in the hierarchy).
- **Outgoing links (list)**: lists extracted wiki-links from the record body + string values inside `fields`.

## Files

- `manifest.json` — plugin metadata + providers
- `pack-viz.js` — plugin implementation (vanilla JS, no dependencies)
- `pack-viz.css` — optional styling for the plugin views

## Adapting to your Graphdown runtime

The Graphdown spec (v0.4) intentionally does *not* define a plugin runtime API.
If your Graphdown app passes a different shape than `ctx.dataset.records` / `ctx.getAllRecords()`,
tweak `tryGetAllRecords(ctx)` in `pack-viz.js`.

## Important spec note

Per UI-PLUGIN-002, core validation + hashing ignore plugins and `graphdown.ui.json`.
They are safe to include and won’t make a dataset invalid.

- **Outgoing links (graph)**: a simple radial graph of a record's outgoing links.
