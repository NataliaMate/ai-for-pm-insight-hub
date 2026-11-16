import { readJson, writeJson } from "./files.js";

// Your edits to features (scores, status, owner, backlog order) live in state.json next to kb.json.
// A rebuild rewrites kb.json but never touches state.json, so edits survive new interviews.

const EDITABLE = ["title", "description", "product", "personas", "stage", "kano", "reach", "impact", "confidence", "effort", "status", "owner", "release", "link", "notes", "rank"];
export const STATUSES = ["discovered", "validated", "prioritized", "backlog", "in_progress", "shipped", "measured"];

export function loadState(P) {
  return readJson(P.state, { solutions: {} });
}

export function patchSolution(P, id, patch = {}, what = "edited") {
  if (!/^[\w.-]{1,80}$/.test(id)) throw new Error("Bad feature id.");
  const state = loadState(P);
  const cur = state.solutions[id] || {};
  const clean = {};
  for (const k of EDITABLE) if (patch[k] !== undefined) clean[k] = patch[k];
  for (const k of ["reach", "impact", "confidence", "effort", "rank"]) if (k in clean) clean[k] = Number(clean[k]) || 0;
  if (clean.status && !STATUSES.includes(clean.status)) throw new Error("Unknown status.");
  if (clean.personas && !Array.isArray(clean.personas)) throw new Error("personas must be a list.");
  const log = [{ at: new Date().toISOString(), what: String(what).slice(0, 200) }, ...(cur.log || [])].slice(0, 40);
  state.solutions[id] = { ...cur, ...clean, log, created: cur.created || (patch.created ? new Date().toISOString() : undefined) };
  writeJson(P.state, state);
  return state.solutions[id];
}

// kb.json features with your edits laid over them, plus features you added by hand.
export function withState(kb, state) {
  const out = [];
  const seen = new Set();
  for (const s of kb.solutions || []) {
    seen.add(s.id);
    out.push({ status: "discovered", log: [], ...s, ...(state.solutions[s.id] || {}) });
  }
  for (const [id, s] of Object.entries(state.solutions)) {
    if (!seen.has(id) && s.created) out.push({ id, status: "discovered", personas: [], for: [], against: [], reach: 1, impact: 1, confidence: 0.5, effort: 2, kano: "performance", ...s });
  }
  return { ...kb, solutions: out };
}
