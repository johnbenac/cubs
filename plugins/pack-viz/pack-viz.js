/**
 * pack-viz (dataset-embedded UI plugin) — Graphdown runtime compatible
 *
 * Graphdown host expectations:
 * - Entry file is an ES module
 * - default export is an object: { [providerId]: rendererFn }
 * - rendererFn signature: ({ container, ctx }) => void | cleanupFn | Promise<cleanupFn>
 *
 * ctx is Graphdown's RecordViewContext:
 * {
 *   typeId, recordId, recordKey,
 *   recordFields, recordBody, typeFields,
 *   outgoingLinks, incomingLinks,
 *   graph
 * }
 */

/* ----------------------------- small DOM helpers ---------------------------- */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") node.className = v;
    else if (k === "style") node.setAttribute("style", v);
    else node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    if (typeof child === "string") node.appendChild(document.createTextNode(child));
    else node.appendChild(child);
  }
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/* ------------------------------- CSS injection ------------------------------ */
/**
 * Graphdown does not load plugin CSS files automatically.
 * If you want styling, you must inline it (recommended) or use inline styles.
 */
const STYLE_ID = "pack-viz-inline-css";
function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;

  const css = `
.pv-error {
  padding: 12px;
  border: 1px solid #d33;
  border-radius: 8px;
  background: rgba(255, 0, 0, 0.05);
  font-family: system-ui, sans-serif;
}

.pv-note {
  margin-top: 12px;
  opacity: 0.8;
  font-size: 0.95em;
  font-family: system-ui, sans-serif;
}

.pv-subtle {
  opacity: 0.7;
  margin-bottom: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
}

.pv-tree {
  list-style: none;
  padding-left: 18px;
  margin: 6px 0;
  font-family: system-ui, sans-serif;
}

.pv-node {
  margin: 6px 0;
}

.pv-node-title {
  font-weight: 600;
}

.pv-node-key {
  opacity: 0.7;
  font-size: 0.9em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.pv-graph {
  width: 100%;
  max-width: 680px;
  height: auto;
  border: 1px solid rgba(0,0,0,0.12);
  border-radius: 10px;
  background: rgba(0,0,0,0.02);
  margin-top: 8px;
  font-family: system-ui, sans-serif;
}

.pv-edge {
  stroke: rgba(0,0,0,0.25);
  stroke-width: 1.5;
}

.pv-node-center {
  fill: rgba(0,0,0,0.75);
}

.pv-node-known {
  fill: rgba(0,0,0,0.55);
}

.pv-node-missing {
  fill: rgba(255, 0, 0, 0.35);
}

.pv-label {
  font-size: 12px;
  fill: rgba(0,0,0,0.75);
}

.pv-label-center {
  font-weight: 600;
}
`;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

/* -------------------------- Graphdown record helpers ------------------------- */

/**
 * Graphdown does not standardize plugin graph APIs, but this host passes `ctx.graph`.
 * We do best-effort extraction of record nodes from common shapes.
 */
function tryGetAllRecords(ctx) {
  const g = ctx && ctx.graph;
  if (!g) return null;

  // If graph.records is already an array
  if (Array.isArray(g.records)) return g.records;

  // If graph.records is a Map
  if (g.records && typeof g.records === "object" && typeof g.records.values === "function") {
    return Array.from(g.records.values());
  }

  // If graph.records is a plain object map
  if (g.records && typeof g.records === "object") {
    return Object.values(g.records);
  }

  // Common alternate names (best-effort)
  const maybe =
    g.recordsByKey ||
    g.recordsById ||
    g.recordIndex ||
    (g.nodes && g.nodes.records);

  if (Array.isArray(maybe)) return maybe;
  if (maybe && typeof maybe === "object" && typeof maybe.values === "function") return Array.from(maybe.values());
  if (maybe && typeof maybe === "object") return Object.values(maybe);

  return null;
}

function keyOf(rec) {
  if (!rec) return null;
  if (typeof rec.recordKey === "string" && rec.recordKey) return rec.recordKey;
  if (typeof rec.typeId === "string" && typeof rec.recordId === "string") return `${rec.typeId}:${rec.recordId}`;
  return null;
}

function parentKeyOf(rec) {
  if (!rec) return null;

  const p =
    rec.parent ??
    rec.parentKey ??
    rec.parentRecordKey;

  return typeof p === "string" && p ? p : null;
}

function fieldsOf(rec) {
  // Graphdown graph nodes typically have `fields`
  if (rec && rec.fields && typeof rec.fields === "object") return rec.fields;
  return {};
}

function displayNameOf(rec) {
  if (!rec) return "(unknown)";
  const f = fieldsOf(rec);
  const k = keyOf(rec) || "(unknown)";
  return f.name || f.title || f.fullName || k;
}

function displayNameFromCtx(ctx) {
  const f = (ctx && ctx.recordFields && typeof ctx.recordFields === "object") ? ctx.recordFields : {};
  const key = (ctx && ctx.recordKey) ? ctx.recordKey : `${ctx.typeId}:${ctx.recordId}`;
  return f.name || f.title || f.fullName || key;
}

function findCurrentRecord(records, ctx) {
  const wantedKey = ctx && typeof ctx.recordKey === "string" ? ctx.recordKey : null;
  if (wantedKey) {
    const hit = records.find((r) => keyOf(r) === wantedKey);
    if (hit) return hit;
  }
  const fallbackKey = ctx ? `${ctx.typeId}:${ctx.recordId}` : null;
  if (fallbackKey) {
    const hit = records.find((r) => keyOf(r) === fallbackKey);
    if (hit) return hit;
  }
  return null;
}

function isPack(rec) { return rec && rec.typeId === "pack"; }
function isDen(rec) { return rec && rec.typeId === "den"; }
function isScout(rec) { return rec && rec.typeId === "scout"; }

function buildChildrenIndex(records) {
  // parent pointer index: parentKey -> [childRecord]
  const idx = new Map();
  for (const r of records) {
    const p = parentKeyOf(r);
    if (!p) continue;
    const arr = idx.get(p) || [];
    arr.push(r);
    idx.set(p, arr);
  }
  // stable sort: by recordKey
  for (const [k, arr] of idx.entries()) {
    arr.sort((a, b) => (keyOf(a) || "").localeCompare(keyOf(b) || ""));
  }
  return idx;
}

function renderTreeNode(rec, childrenIdx) {
  const k = keyOf(rec) || "(unknown)";
  const title = displayNameOf(rec);

  const li = el("li", { class: "pv-node" },
    el("span", { class: "pv-node-title" }, title),
    el("span", { class: "pv-node-key" }, ` (${k})`)
  );

  const kids = childrenIdx.get(k) || [];
  if (kids.length) {
    const ul = el("ul", { class: "pv-tree" });
    for (const child of kids) {
      ul.appendChild(renderTreeNode(child, childrenIdx));
    }
    li.appendChild(ul);
  }
  return li;
}

function extractWikiLinks(text) {
  // UI-only extraction (not core). Used for leader fields which often store '[[type:id]]'.
  if (!text || typeof text !== "string") return [];
  const out = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m;
  while ((m = re.exec(text))) {
    const inner = (m[1] || "").trim();
    out.push(inner);
  }
  return out;
}

const RECORD_REF_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*:[A-Za-z0-9][A-Za-z0-9_-]*$/;

/* ------------------------------- View renderers ------------------------------ */

function renderPackTreeView(container, ctx) {
  ensureStyles();
  clear(container);

  const records = tryGetAllRecords(ctx);
  if (!records) {
    container.appendChild(el("div", { class: "pv-error" },
      "pack-viz: couldn't find records. This host provides ctx.graph; ",
      "ensure ctx.graph contains a records map/array."
    ));
    return;
  }

  const current = findCurrentRecord(records, ctx);
  const pack = (current && isPack(current)) ? current : records.find(isPack);

  if (!pack) {
    container.appendChild(el("div", { class: "pv-error" }, "No pack record found."));
    return;
  }

  const childrenIdx = buildChildrenIndex(records);
  const rootUl = el("ul", { class: "pv-tree pv-root" });
  rootUl.appendChild(renderTreeNode(pack, childrenIdx));

  container.appendChild(el("h2", {}, "Pack org tree"));
  container.appendChild(rootUl);
}

function renderDenRosterView(container, ctx) {
  ensureStyles();
  clear(container);

  const records = tryGetAllRecords(ctx);
  if (!records) {
    container.appendChild(el("div", { class: "pv-error" }, "pack-viz: couldn't find records on ctx.graph."));
    return;
  }

  let den = findCurrentRecord(records, ctx);
  if (!den || !isDen(den)) den = records.find(isDen);

  if (!den) {
    container.appendChild(el("div", { class: "pv-error" }, "No den record found."));
    return;
  }

  const denKey = keyOf(den);
  const kids = denKey ? records.filter((r) => parentKeyOf(r) === denKey) : [];
  const scouts = kids.filter(isScout);

  const denFields = fieldsOf(den);
  const leadersRaw = Array.isArray(denFields.leaders) ? denFields.leaders : [];
  const leaders = leadersRaw
    .filter((x) => typeof x === "string")
    .flatMap(extractWikiLinks)
    .filter((x) => RECORD_REF_RE.test(x));

  container.appendChild(el("h2", {}, denFields.name || "Den roster"));

  container.appendChild(el("h3", {}, "Leaders"));
  const leaderUl = el("ul", {});
  if (leaders.length === 0) leaderUl.appendChild(el("li", {}, "(none listed)"));
  for (const l of leaders) leaderUl.appendChild(el("li", {}, `[[${l}]]`));
  container.appendChild(leaderUl);

  container.appendChild(el("h3", {}, "Scouts (by parent pointers)"));
  const scoutUl = el("ul", {});
  if (!scouts.length) scoutUl.appendChild(el("li", {}, "(none found)"));
  for (const s of scouts) scoutUl.appendChild(el("li", {}, displayNameOf(s)));
  container.appendChild(scoutUl);

  container.appendChild(el("p", { class: "pv-note" },
    "This view uses the den's leaders field and child records (parent pointers) to build the roster."
  ));
}

function renderRelationshipsListView(container, ctx) {
  ensureStyles();
  clear(container);

  const key = ctx && ctx.recordKey ? ctx.recordKey : `${ctx.typeId}:${ctx.recordId}`;
  const outgoing = Array.isArray(ctx.outgoingLinks) ? ctx.outgoingLinks : [];
  const incoming = Array.isArray(ctx.incomingLinks) ? ctx.incomingLinks : [];

  container.appendChild(el("h2", {}, "Relationships"));
  container.appendChild(el("div", { class: "pv-subtle" }, key));

  // Outgoing
  container.appendChild(el("h3", {}, "Outgoing"));
  const outUl = el("ul", {});
  if (!outgoing.length) outUl.appendChild(el("li", {}, "(none)"));
  for (const l of outgoing) outUl.appendChild(el("li", {}, `[[${l}]]`));
  container.appendChild(outUl);

  // Incoming
  container.appendChild(el("h3", {}, "Incoming"));
  const inUl = el("ul", {});
  if (!incoming.length) inUl.appendChild(el("li", {}, "(none)"));
  for (const l of incoming) inUl.appendChild(el("li", {}, `[[${l}]]`));
  container.appendChild(inUl);

  container.appendChild(el("p", { class: "pv-note" },
    "These links come from Graphdown's core extraction (bodies + string field values)."
  ));
}

function renderOutgoingLinksGraphView(container, ctx) {
  ensureStyles();
  clear(container);

  const records = tryGetAllRecords(ctx) || [];
  const recordIndex = new Map();
  for (const r of records) {
    const k = keyOf(r);
    if (k) recordIndex.set(k, r);
  }

  const centerKey = ctx && ctx.recordKey ? ctx.recordKey : `${ctx.typeId}:${ctx.recordId}`;
  const centerLabel = displayNameFromCtx(ctx);

  const rawLinks = Array.isArray(ctx.outgoingLinks) ? ctx.outgoingLinks : [];
  const recordLinks = rawLinks.filter((x) => RECORD_REF_RE.test(x));

  const nodes = [
    { key: centerKey, label: centerLabel, kind: "center" },
    ...recordLinks.map((k) => {
      const target = recordIndex.get(k);
      return {
        key: k,
        label: target ? displayNameOf(target) : k,
        kind: target ? "known" : "missing"
      };
    })
  ];

  const w = 680, h = 420;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) * 0.33;

  const svg = el("svg", { width: String(w), height: String(h), class: "pv-graph" });

  // Edges
  const n = Math.max(1, nodes.length - 1);
  for (let i = 1; i < nodes.length; i++) {
    const theta = (2 * Math.PI * (i - 1)) / n;
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);

    svg.appendChild(el("line", {
      x1: String(cx), y1: String(cy), x2: String(x), y2: String(y),
      class: "pv-edge"
    }));
  }

  // Center
  svg.appendChild(el("circle", { cx: String(cx), cy: String(cy), r: "18", class: "pv-node-center" }));
  svg.appendChild(el("text", {
    x: String(cx),
    y: String(cy - 26),
    class: "pv-label pv-label-center",
    "text-anchor": "middle"
  }, centerLabel));

  // Others
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    const theta = (2 * Math.PI * (i - 1)) / n;
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);

    svg.appendChild(el("circle", {
      cx: String(x),
      cy: String(y),
      r: "14",
      class: node.kind === "missing" ? "pv-node-missing" : "pv-node-known"
    }));

    const label = node.label.length > 28 ? node.label.slice(0, 27) + "…" : node.label;
    svg.appendChild(el("text", {
      x: String(x),
      y: String(y - 20),
      class: "pv-label",
      "text-anchor": "middle"
    }, label));
  }

  container.appendChild(el("h2", {}, "Outgoing links graph"));
  container.appendChild(el("div", { class: "pv-subtle" }, centerKey));

  if (!recordLinks.length) {
    container.appendChild(el("p", { class: "pv-note" }, "No outgoing record links found to visualize."));
  }

  container.appendChild(svg);

  container.appendChild(el("p", { class: "pv-note" },
    "Missing targets (unresolved links) are allowed by core, but shown differently here."
  ));
}

/* -------------------------- REQUIRED Graphdown export ------------------------ */

export default {
  "pack-tree": ({ container, ctx }) => renderPackTreeView(container, ctx),
  "den-roster": ({ container, ctx }) => renderDenRosterView(container, ctx),
  "relationship-mini": ({ container, ctx }) => renderRelationshipsListView(container, ctx),
  "relationship-graph": ({ container, ctx }) => renderOutgoingLinksGraphView(container, ctx)
};
