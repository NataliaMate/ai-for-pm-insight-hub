import fs from "node:fs";
import path from "node:path";
import { completeJson, ClaudeError } from "./claude.js";
import { loadConfig } from "./config.js";
import { listTranscripts, readJson, slug, writeJson } from "./files.js";
import { extractPrompt, KANO, NUGGET_TYPES, QUOTE_KINDS, SOURCE_TYPES, STRENGTHS, synthPrompt, SYSTEM_RESEARCHER, taxonomyPrompt } from "./prompts.js";

// Everything the pipeline writes goes into the output folder you picked in setup:
//   taxonomy.json            personas, stages, products, hypotheses (editable)
//   extracts/<source>.json   tagged quotes from one transcript
//   manifest.json            which transcript file (and which version of it) produced which extract
//   nuggets.json             all quotes merged
//   synth/<persona>.json     persona, journey, opportunities, features
//   kb.json                  everything the app shows
//   state.json               your edits to scores and the backlog (never overwritten by a rebuild)

export const ROWS = ["pains", "jobs", "tools", "our_flow", "features"];
const IMPACTS = [0.25, 0.5, 1, 2, 3];
const CONFS = [0.5, 0.8, 1];
const nearest = (v, opts) => opts.reduce((a, b) => (Math.abs(b - Number(v)) < Math.abs(a - Number(v)) ? b : a));
const clamp = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
const str = (v) => (v == null ? "" : String(v).trim());
const arr = (v) => (Array.isArray(v) ? v : []);

export function outPaths(outputDir) {
  return {
    taxonomy: path.join(outputDir, "taxonomy.json"),
    extracts: path.join(outputDir, "extracts"),
    manifest: path.join(outputDir, "manifest.json"),
    nuggets: path.join(outputDir, "nuggets.json"),
    synth: path.join(outputDir, "synth"),
    synthMeta: path.join(outputDir, "synth", "_meta.json"),
    kb: path.join(outputDir, "kb.json"),
    state: path.join(outputDir, "state.json"),
  };
}

// ---------- job runner: one pipeline run at a time, with a live log ----------
const job = { running: false, mode: null, step: "", log: [], error: null, startedAt: null, finishedAt: null, progress: null, ctl: null, calls: 0 };

export function pipelineStatus() {
  const { ctl, ...rest } = job;
  return rest;
}

function log(msg, level = "info") {
  job.log.push({ t: new Date().toISOString(), level, msg });
  if (job.log.length > 500) job.log.shift();
}

export function cancelPipeline() {
  if (job.running) {
    job.ctl?.abort();
    log("Cancelling…", "warn");
  }
}

export function startPipeline(mode) {
  if (job.running) throw new Error("A run is already in progress.");
  if (!["all", "taxonomy", "extract", "synthesize", "rebuild"].includes(mode)) throw new Error("Unknown step.");
  Object.assign(job, { running: true, mode, step: "Starting", log: [], error: null, startedAt: new Date().toISOString(), finishedAt: null, progress: null, ctl: new AbortController(), calls: 0 });
  run(mode).finally(() => {
    job.running = false;
    job.finishedAt = new Date().toISOString();
    job.step = job.error ? "Failed" : job.ctl.signal.aborted ? "Cancelled" : "Done";
  });
}

async function run(mode) {
  try {
    const cfg = loadConfig();
    if (!cfg.transcriptsDir || !fs.existsSync(cfg.transcriptsDir)) throw new Error("The transcripts folder doesn't exist. Pick it again in Settings.");
    if (!cfg.outputDir) throw new Error("No output folder. Pick one in Settings.");
    fs.mkdirSync(cfg.outputDir, { recursive: true });
    const P = outPaths(cfg.outputDir);
    const files = listTranscripts(cfg.transcriptsDir).filter((f) => !f.tooBig);
    if (!files.length) throw new Error("No transcript files (.md, .txt, .vtt, .srt) in the transcripts folder.");
    log(`${files.length} transcript files in ${cfg.transcriptsDir}. Engine: ${cfg.engine === "cli" ? `Claude Code CLI (${cfg.cliModel})` : `Anthropic API (${cfg.model})`}.`);

    if (mode === "taxonomy" || !fs.existsSync(P.taxonomy)) await stepTaxonomy(cfg, P, files);
    if (mode === "taxonomy") return;
    if (mode === "rebuild") {
      // start over: re-extract every transcript with the current taxonomy, then synthesize from scratch
      fs.rmSync(P.extracts, { recursive: true, force: true });
      fs.rmSync(P.manifest, { force: true });
      fs.rmSync(P.synthMeta, { force: true });
      log("Rebuilding from scratch: every transcript will be read again.", "warn");
    }
    if (["all", "extract", "rebuild"].includes(mode)) await stepExtract(P, files);
    const merged = stepMerge(P, files);
    if (["all", "synthesize", "rebuild"].includes(mode)) await stepSynthesize(P, merged, { force: mode !== "all", fresh: mode === "rebuild" });
    stepAssemble(P, merged);
    log(`Done. ${job.calls} Claude calls in this run.`, "ok");
  } catch (e) {
    if (job.ctl.signal.aborted) {
      log("Cancelled. Finished steps were saved; run again to continue.", "warn");
      return;
    }
    job.error = e instanceof ClaudeError ? e.message : `${e.message}`;
    log(job.error, "error");
  }
}

async function claudeJson(prompt, effort) {
  if (job.ctl.signal.aborted) throw new Error("Cancelled");
  job.calls++;
  return completeJson({ system: SYSTEM_RESEARCHER, prompt, effort, signal: job.ctl.signal, log });
}

// ---------- 1. taxonomy ----------
async function stepTaxonomy(cfg, P, files) {
  job.step = "Proposing personas and journey stages";
  log(job.step + "…");
  const sample = files.slice(0, 12);
  const excerpts = sample.map((f) => ({ name: f.name, text: fs.readFileSync(f.file, "utf8").slice(0, 6000) }));
  const raw = await claudeJson(taxonomyPrompt({ product: cfg.product, excerpts }), "medium");
  const tax = normalizeTaxonomy(raw, cfg.product);
  writeJson(P.taxonomy, tax);
  log(`Taxonomy: ${tax.personas.map((p) => p.name).join(", ")}. Review or edit it on the Process tab.`, "ok");
}

export function normalizeTaxonomy(t, productCfg = {}) {
  if (!t || typeof t !== "object") throw new Error("The taxonomy must be a JSON object.");
  const products = arr(t.products)
    .map((p) => ({ id: slug(p.id || p.label) || "product", label: str(p.label || p.id) || "Product" }))
    .filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i);
  if (!products.length) products.push({ id: slug(t.product?.name || productCfg.name) || "product", label: str(t.product?.name || productCfg.name) || "Product" });
  const personas = [];
  const stages = {};
  for (const p of arr(t.personas)) {
    const id = slug(p.id || p.name, "_");
    if (!id || personas.some((x) => x.id === id)) continue;
    personas.push({ id, name: str(p.name) || id, short: str(p.short) || str(p.name).split(/\s+/).slice(0, 2).join(" ") || id, description: str(p.description) });
    const rawStages = arr(t.stages?.[p.id] || t.stages?.[id]);
    const seen = new Set();
    stages[id] = rawStages
      .map((s) => {
        const tail = str(s.id).startsWith(`${p.id}.`) ? str(s.id).slice(String(p.id).length + 1) : str(s.id).includes(".") ? str(s.id).split(".").pop() : str(s.id) || str(s.title);
        return { id: `${id}.${slug(tail, "_") || "stage"}`, title: str(s.title) || tail };
      })
      .filter((s) => !seen.has(s.id) && seen.add(s.id));
    if (!stages[id].length) stages[id] = [{ id: `${id}.general`, title: "General" }];
  }
  if (!personas.length) throw new Error("The taxonomy needs at least one persona.");
  if (personas.length > 6) throw new Error("Keep it to 6 personas or fewer.");
  const hypotheses = arr(t.hypotheses).map((h, i) => ({
    id: slug(h.id, "_").toUpperCase() || `H${i + 1}`,
    product: products.some((p) => p.id === h.product) ? h.product : products[0].id,
    name: str(h.name) || `H${i + 1}`,
    statement: str(h.statement),
  }));
  return {
    product: { name: str(t.product?.name || productCfg.name), description: str(t.product?.description || productCfg.description) },
    products,
    personas,
    stages,
    hypotheses,
  };
}

// ---------- 2. extract quotes, one transcript at a time ----------
async function stepExtract(P, files) {
  const tax = readJson(P.taxonomy);
  const manifest = readJson(P.manifest, { files: {} });
  const todo = files.filter((f) => manifest.files[f.name]?.hash !== f.hash);
  if (!todo.length) {
    log("No new or changed transcripts to extract.");
    return;
  }
  job.step = "Extracting tagged quotes";
  job.progress = { done: 0, total: todo.length };
  log(`Extracting quotes from ${todo.length} transcript${todo.length > 1 ? "s" : ""}…`);
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const f = queue.shift();
      log(`Reading ${f.name}…`);
      const raw = await claudeJson(extractPrompt({ tax, file: f.name, text: fs.readFileSync(f.file, "utf8") }), "medium");
      // re-read the manifest so parallel workers don't overwrite each other's ids
      const m = readJson(P.manifest, { files: {} });
      const used = new Set(Object.entries(m.files).filter(([name]) => name !== f.name).map(([, v]) => v.sourceId));
      const old = m.files[f.name]?.sourceId;
      const ex = normalizeExtract(raw, tax, f, used, old);
      if (old && old !== ex.source.id) fs.rmSync(path.join(P.extracts, `${old}.json`), { force: true });
      writeJson(path.join(P.extracts, `${ex.source.id}.json`), ex);
      m.files[f.name] = { hash: f.hash, sourceId: ex.source.id, extractedAt: new Date().toISOString() };
      writeJson(P.manifest, m);
      job.progress.done++;
      log(`${f.name} → ${ex.source.interviewee || ex.source.id}: ${ex.nuggets.length} quotes.`, "ok");
    }
  };
  await Promise.all([worker(), worker()]);
}

export function normalizeExtract(raw, tax, fileInfo, usedIds = new Set(), keepId = null) {
  const s = raw?.source || {};
  const personaIds = tax.personas.map((p) => p.id);
  const productIds = [...tax.products.map((p) => p.id), ...(tax.products.length > 1 ? ["cross"] : [])];
  const date = /^\d{4}-\d{2}-\d{2}$/.test(str(s.date)) ? str(s.date) : null;
  let id = keepId || slug(s.id_hint) || slug(`${date ? date.slice(2).replace(/-/g, "") : "000000"}-${str(s.interviewee).split(/\s+/)[0] || path.parse(fileInfo.name).name}`);
  if (!keepId) {
    const base = id;
    for (let i = 2; usedIds.has(id); i++) id = `${base}-${i}`;
  }
  const source = {
    id,
    files: [fileInfo.name],
    date,
    interviewee: str(s.interviewee) || path.parse(fileInfo.name).name,
    role: str(s.role),
    company: str(s.company) || null,
    product: productIds.includes(s.product) ? s.product : tax.products[0].id,
    persona: personaIds.includes(s.persona) ? s.persona : personaIds[0],
    source_type: SOURCE_TYPES.includes(s.source_type) ? s.source_type : "interview",
    language: str(s.language) || "en",
    summary: str(s.summary),
  };
  const hypIds = new Set((tax.hypotheses || []).map((h) => h.id));
  const nuggets = arr(raw?.nuggets)
    .filter((n) => str(n.text))
    .map((n, i) => {
      const persona = personaIds.includes(n.persona) ? n.persona : source.persona;
      const own = tax.stages[persona] || [];
      const stageOk = own.some((st) => st.id === n.stage);
      return {
        id: `${id}-${String(i + 1).padStart(2, "0")}`,
        source: id,
        persona,
        said_by_persona: str(n.said_by_persona) || source.persona,
        product: productIds.includes(n.product) ? n.product : source.product,
        stage: stageOk ? n.stage : own[0]?.id || null,
        stage_suggestion: stageOk ? (str(n.stage_suggestion) || null) : str(n.stage_suggestion) || str(n.stage) || null,
        type: NUGGET_TYPES.includes(n.type) ? n.type : "need",
        text: str(n.text),
        quote: str(n.quote),
        quote_kind: QUOTE_KINDS.includes(n.quote_kind) ? n.quote_kind : "paraphrase",
        strength: STRENGTHS.includes(n.strength) ? n.strength : "said",
        severity: clamp(n.severity, 1, 3, 1),
        tools: arr(n.tools).map(str).filter(Boolean),
        hypothesis: hypIds.has(n.hypothesis) ? n.hypothesis : null,
        stance: hypIds.has(n.hypothesis) && ["for", "against"].includes(n.stance) ? n.stance : null,
      };
    });
  return { source, nuggets };
}

// ---------- merge: all extracts of transcripts still in the folder ----------
export function stepMerge(P, files) {
  const manifest = readJson(P.manifest, { files: {} });
  const present = new Set(files.map((f) => f.name));
  const sources = [];
  const nuggets = [];
  for (const [name, v] of Object.entries(manifest.files)) {
    if (!present.has(name)) continue;
    const ex = readJson(path.join(P.extracts, `${v.sourceId}.json`));
    if (!ex) continue;
    sources.push(ex.source);
    nuggets.push(...ex.nuggets);
  }
  sources.sort((a, b) => str(a.date).localeCompare(str(b.date)));
  const merged = { generated: new Date().toISOString(), sources, nuggets };
  writeJson(P.nuggets, merged);
  return merged;
}

// ---------- 3. synthesize, one persona at a time ----------
async function stepSynthesize(P, merged, { force, fresh }) {
  const tax = readJson(P.taxonomy);
  if (!merged.nuggets.length) throw new Error("No quotes yet: extract the transcripts first.");
  const meta = readJson(P.synthMeta, { sources: [] });
  const newSources = merged.sources.map((s) => s.id).filter((id) => !meta.sources.includes(id));
  const nugIndex = new Map(merged.nuggets.map((n) => [n.id, n]));
  const srcIndex = new Map(merged.sources.map((s) => [s.id, s]));
  const short = (n) => ({ id: n.id, persona: n.persona, type: n.type, strength: n.strength, text: n.text });
  const todo = tax.personas.filter((p) => fresh || force || newSources.length || !fs.existsSync(path.join(P.synth, `${p.id}.json`)));
  if (!todo.length) {
    log("Personas are up to date: no new interviews since the last build.");
    return;
  }
  job.step = "Synthesizing personas, journeys and features";
  job.progress = { done: 0, total: todo.length };
  for (const persona of todo) {
    const file = path.join(P.synth, `${persona.id}.json`);
    const existing = fresh ? null : readJson(file);
    log(`${existing ? "Updating" : "Building"} ${persona.name}…`);
    const own = merged.nuggets.filter((n) => n.persona === persona.id);
    const others = merged.nuggets.filter((n) => n.persona !== persona.id).map(short);
    if (!own.length) log(`No quotes are tagged ${persona.name}; the result will be mostly assumptions.`, "warn");
    const raw = await claudeJson(synthPrompt({ tax, persona, own, others, existing, newSources }), "high");
    const out = normalizeSynth(raw, tax, persona, nugIndex, srcIndex);
    writeJson(file, out);
    job.progress.done++;
    log(`${persona.name}: ${out.persona.jobs.length} jobs, ${out.opportunities.length} opportunities, ${out.solutions.length} features.`, "ok");
  }
  writeJson(P.synthMeta, { sources: merged.sources.map((s) => s.id), at: new Date().toISOString() });
}

export function normalizeSynth(raw, tax, persona, nugIndex, srcIndex) {
  const ev = (a) => [...new Set(arr(a).filter((x) => typeof x === "string" && nugIndex.has(x)))];
  const stageIds = new Set(Object.values(tax.stages).flat().map((s) => s.id));
  const productIds = [...tax.products.map((p) => p.id), ...(tax.products.length > 1 ? ["cross"] : [])];
  const personaIds = tax.personas.map((p) => p.id);
  const pre = `${persona.id}.`;
  const used = new Set();
  const uid = (id, fallback) => {
    let x = str(id).startsWith(pre) ? str(id) : `${pre}${slug(id, "_") || fallback}`;
    const base = x;
    for (let i = 2; used.has(x); i++) x = `${base}_${i}`;
    used.add(x);
    return x;
  };
  const rp = raw?.persona || {};
  const p = {
    id: persona.id,
    name: str(rp.name) || persona.name,
    short: persona.short,
    tagline: str(rp.tagline) || persona.description,
    description: str(rp.description),
    goals: arr(rp.goals).map(str).filter(Boolean),
    frustrations: arr(rp.frustrations).map(str).filter(Boolean),
    products: arr(rp.products).filter((x) => productIds.includes(x)),
    sources: [...new Set(arr(rp.sources).filter((x) => srcIndex.has(x)))],
    evidence_level: ["strong", "moderate", "thin"].includes(rp.evidence_level) ? rp.evidence_level : "thin",
    evidence_note: str(rp.evidence_note),
    jobs: arr(rp.jobs)
      .filter((j) => str(j.statement))
      .map((j, i) => ({ id: uid(j.id, `j${i + 1}`), statement: str(j.statement), importance: clamp(j.importance, 1, 3, 2), stage: stageIds.has(j.stage) ? j.stage : null, for: ev(j.for), against: ev(j.against) })),
  };
  if (!p.sources.length) p.sources = [...new Set(p.jobs.flatMap((j) => j.for).map((id) => nugIndex.get(id).source))];
  const solutions = arr(raw?.solutions)
    .filter((s) => str(s.title))
    .map((s, i) => ({
      id: uid(s.id, `s${i + 1}`),
      title: str(s.title),
      description: str(s.description),
      product: productIds.includes(s.product) ? s.product : tax.products[0].id,
      personas: [...new Set([persona.id, ...arr(s.personas).filter((x) => personaIds.includes(x))])],
      stage: stageIds.has(s.stage) ? s.stage : null,
      opportunities: arr(s.opportunities),
      kano: KANO.includes(s.kano) ? s.kano : "performance",
      reach: 0,
      impact: nearest(s.impact ?? 1, IMPACTS),
      confidence: nearest(s.confidence ?? 0.5, CONFS),
      effort: Math.max(0.5, Math.round((Number(s.effort) || 2) * 2) / 2),
      rationale: str(s.rationale),
      for: ev(s.for),
      against: ev(s.against),
    }));
  const solIds = new Set(solutions.map((s) => s.id));
  const opportunities = arr(raw?.opportunities)
    .filter((o) => str(o.title))
    .map((o, i) => ({ id: uid(o.id, `o${i + 1}`), title: str(o.title), stage: stageIds.has(o.stage) ? o.stage : null, product: productIds.includes(o.product) ? o.product : tax.products[0].id, for: ev(o.for), against: ev(o.against) }));
  const oppIds = new Set(opportunities.map((o) => o.id));
  for (const s of solutions) {
    s.opportunities = s.opportunities.filter((o) => oppIds.has(o));
    // Reach = how many different people back the feature. Counted here, not by the model.
    s.reach = new Set(s.for.map((id) => srcIndex.get(nugIndex.get(id).source)?.interviewee?.toLowerCase()).filter(Boolean)).size;
  }
  const byStage = new Map(arr(raw?.journey).map((j) => [j.stage, j]));
  const journey = (tax.stages[persona.id] || []).map((st) => {
    const j = byStage.get(st.id) || {};
    const rows = {};
    for (const rk of ROWS) {
      rows[rk] = arr(j.rows?.[rk])
        .filter((x) => str(x.text))
        .map((x, i) => {
          const o = { id: uid(x.id, `${st.id.split(".").pop()}_${rk}${i + 1}`), text: str(x.text), for: ev(x.for), against: ev(x.against), assumption: Boolean(x.assumption) };
          if (rk === "features" && solIds.has(x.solution)) o.solution = x.solution;
          return o;
        });
    }
    return { stage: st.id, title: st.title, goal: str(j.goal), emotion: clamp(j.emotion, -2, 2, 0), rows };
  });
  return { persona: p, journey, opportunities, solutions };
}

// ---------- assemble kb.json ----------
export function stepAssemble(P, merged) {
  const tax = readJson(P.taxonomy);
  if (!tax) return null;
  const personas = [];
  const journeys = {};
  const opportunities = [];
  const solutions = [];
  for (const t of tax.personas) {
    const s = readJson(path.join(P.synth, `${t.id}.json`));
    if (s) {
      personas.push(s.persona);
      journeys[t.id] = s.journey;
      opportunities.push(...s.opportunities);
      solutions.push(...s.solutions);
    } else {
      personas.push({ id: t.id, name: t.name, short: t.short, tagline: t.description, description: "", goals: [], frustrations: [], products: [], sources: [], evidence_level: "thin", evidence_note: "Not synthesized yet: run Synthesize on the Process tab.", jobs: [] });
      journeys[t.id] = (tax.stages[t.id] || []).map((st) => ({ stage: st.id, title: st.title, goal: "", emotion: 0, rows: Object.fromEntries(ROWS.map((r) => [r, []])) }));
    }
  }
  const hypotheses = (tax.hypotheses || []).map((h) => ({
    ...h,
    evidence: merged.nuggets.filter((n) => n.hypothesis === h.id && n.stance).map((n) => ({ nugget: n.id, stance: n.stance })),
  }));
  const kb = {
    generated: new Date().toISOString().slice(0, 10),
    product: tax.product,
    products: tax.products,
    stages: tax.stages,
    personas,
    journeys,
    opportunities,
    solutions,
    sources: merged.sources,
    nuggets: merged.nuggets,
    hypotheses,
  };
  writeJson(P.kb, kb);
  log(`Built the knowledge base: ${merged.sources.length} interviews, ${merged.nuggets.length} quotes, ${solutions.length} features.`, "ok");
  return kb;
}
