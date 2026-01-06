/**
 * pack-viz (dataset-embedded UI plugin)
 *
 * Lightweight, dependency-free visualizations for this dataset:
 * - Pack org tree (using parent pointers)
 * - Den roster (leaders + scouts)
 * - Outgoing links (list)
 * - Outgoing links (simple graph)
 *
 * NOTE: Graphdown v0.4 intentionally does not define a plugin runtime API.
 * If your host app passes a different ctx shape, tweak `tryGetAllRecords(ctx)`.
 */

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

function tryGetAllRecords(ctx) {
  // Common patterns (adjust to your host app):
  // - ctx.dataset.records (array)
  // - ctx.getAllRecords() (function)
  // - ctx.graph.records (map)
  if (!ctx) return null;

  if (Array.isArray(ctx.records)) return ctx.records;
  if (ctx.dataset && Array.isArray(ctx.dataset.records)) return ctx.dataset.records;
  if (typeof ctx.getAllRecords === "function") return ctx.getAllRecords();

  if (ctx.graph && ctx.graph.records && typeof ctx.graph.records === "object") {
    return Object.values(ctx.graph.records);
  }
  return null;
}

function keyOf(rec) {
  if (!rec) return null;
  if (rec.recordKey) return rec.recordKey;
  if (rec.typeId && rec.recordId) return `${rec.typeId}:${rec.recordId}`;
  return null;
}

function displayNameOf(rec) {
  if (!rec) return "(unknown)";
  const k = keyOf(rec) || "(unknown)";
  return rec.fields?.name || rec.fields?.title || rec.fields?.fullName || k;
}

function isPack(rec) { return rec && rec.typeId === "pack"; }
function isDen(rec) { return rec && rec.typeId === "den"; }
function isScout(rec) { return rec && rec.typeId === "scout"; }

function buildChildrenIndex(records) {
  // parent pointer index: parentKey -> [childRecord]
  const idx = new Map();
  for (const r of records) {
    const p = r.parent || null;
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
  // Extract [[...]] tokens. Core relationship extraction is stricter; this is UI-only.
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

function outgoingLinks(rec) {
  const links = new Set();

  // body
  if (typeof rec.body === "string") {
    for (const inner of extractWikiLinks(rec.body)) links.add(inner);
  }

  // strings anywhere in fields (deep walk)
  function walk(v) {
    if (typeof v === "string") {
      for (const inner of extractWikiLinks(v)) links.add(inner);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (v && typeof v === "object") {
      for (const x of Object.values(v)) walk(x);
    }
  }
  walk(rec.fields);

  return Array.from(links).sort();
}

const RECORD_REF_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*:[A-Za-z0-9][A-Za-z0-9_-]*$/;

function renderPackTree(container, ctx) {
  clear(container);

  const records = tryGetAllRecords(ctx);
  if (!records) {
    container.appendChild(el("div", { class: "pv-error" },
      "pack-viz: couldn't find records on ctx. ",
      "Provide ctx.dataset.records (array) or ctx.getAllRecords()."
    ));
    return;
  }

  const pack = records.find(isPack);
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

function renderDenRoster(container, ctx, currentRecord) {
  clear(container);

  const records = tryGetAllRecords(ctx);
  if (!records) {
    container.appendChild(el("div", { class: "pv-error" }, "pack-viz: couldn't find records on ctx."));
    return;
  }

  const den = currentRecord && isDen(currentRecord) ? currentRecord : records.find(isDen);

  if (!den) {
    container.appendChild(el("div", { class: "pv-error" }, "No den record found."));
    return;
  }

  const denKey = keyOf(den);
  const kids = records.filter(r => r.parent === denKey);

  const leaders = (den.fields?.leaders || [])
    .filter(x => typeof x === "string")
    .flatMap(extractWikiLinks);

  const scouts = kids.filter(isScout);

  container.appendChild(el("h2", {}, den.fields?.name || "Den roster"));

  container.appendChild(el("h3", {}, "Leaders"));
  const leaderUl = el("ul", {});
  if (leaders.length === 0) leaderUl.appendChild(el("li", {}, "(none listed)"));
  for (const l of leaders) leaderUl.appendChild(el("li", {}, l));
  container.appendChild(leaderUl);

  container.appendChild(el("h3", {}, "Scouts (by parent pointers)"));
  const scoutUl = el("ul", {});
  if (!scouts.length) scoutUl.appendChild(el("li", {}, "(none found)"));
  for (const s of scouts) scoutUl.appendChild(el("li", {}, displayNameOf(s)));
  container.appendChild(scoutUl);

  container.appendChild(el("p", { class: "pv-note" },
    "This view uses both the den’s fields (leaders) and the record hierarchy (scouts as children)."
  ));
}

function renderOutgoingLinksList(container, ctx, currentRecord) {
  clear(container);

  const rec = currentRecord || (tryGetAllRecords(ctx) || [])[0];
  if (!rec) {
    container.appendChild(el("div", { class: "pv-error" }, "No record provided."));
    return;
  }

  const links = outgoingLinks(rec);

  container.appendChild(el("h2", {}, "Outgoing links"));
  container.appendChild(el("div", { class: "pv-subtle" }, keyOf(rec) || ""));

  const ul = el("ul", {});
  if (!links.length) ul.appendChild(el("li", {}, "(none)"));
  for (const l of links) ul.appendChild(el("li", {}, `[[${l}]]`));
  container.appendChild(ul);

  container.appendChild(el("p", { class: "pv-note" },
    "Links are extracted from the record body and any string values inside fields."
  ));
}

function renderOutgoingLinksGraph(container, ctx, currentRecord) {
  clear(container);

  const records = tryGetAllRecords(ctx) || [];
  const rec = currentRecord || records[0];
  if (!rec) {
    container.appendChild(el("div", { class: "pv-error" }, "No record provided."));
    return;
  }

  const recordIndex = new Map();
  for (const r of records) recordIndex.set(keyOf(r), r);

  const centerKey = keyOf(rec) || "(unknown)";
  const centerLabel = displayNameOf(rec);

  const rawLinks = outgoingLinks(rec);
  const recordLinks = rawLinks.filter(x => RECORD_REF_RE.test(x));

  const nodes = [
    { key: centerKey, label: centerLabel, kind: "center" },
    ...recordLinks.map(k => {
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

  // Nodes
  // Center
  svg.appendChild(el("circle", { cx: String(cx), cy: String(cy), r: "18", class: "pv-node-center" }));
  svg.appendChild(el("text", { x: String(cx), y: String(cy - 26), class: "pv-label pv-label-center", "text-anchor": "middle" }, centerLabel));

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
    "This is a simple radial visualization of outgoing wiki-links. Missing targets (unresolved links) are allowed by core, but shown differently here."
  ));
}

// Export a shape that's easy for a host app to consume.
export const graphdownPlugin = {
  id: "pack-viz",
  version: "0.1.0",
  providers: [
    {
      capability: "recordView",
      id: "pack-tree",
      title: "Pack org tree",
      render: (container, ctx, currentRecord) => renderPackTree(container, ctx)
    },
    {
      capability: "recordView",
      id: "den-roster",
      title: "Den roster",
      render: (container, ctx, currentRecord) => renderDenRoster(container, ctx, currentRecord)
    },
    {
      capability: "recordView",
      id: "relationship-mini",
      title: "Relationships (outgoing links)",
      render: (container, ctx, currentRecord) => renderOutgoingLinksList(container, ctx, currentRecord)
    },
    {
      capability: "recordView",
      id: "relationship-graph",
      title: "Relationships (graph)",
      render: (container, ctx, currentRecord) => renderOutgoingLinksGraph(container, ctx, currentRecord)
    }
  ]
};
