// Prompt templates for the three Claude steps. Read them: they ARE the method.
// 1. taxonomy   → personas, journey stages, products, hypotheses (the frame for tagging)
// 2. extract    → tagged quotes ("nuggets") from one transcript
// 3. synthesize → persona, journey map, opportunities and RICE-scored features for one persona

export const NUGGET_TYPES = ["pain", "job", "need", "workaround", "tool", "feature_request", "wtp", "praise", "objection"];
export const STRENGTHS = ["said", "does", "pays"];
export const QUOTE_KINDS = ["verbatim", "translated", "paraphrase"];
export const SOURCE_TYPES = ["interview", "walkthrough", "demo", "meeting", "expert_qa", "survey"];
export const KANO = ["must", "performance", "delighter", "indifferent"];

const TYPES_HELP = `pain (problem/frustration) · job (what they try to get done, phrased "When…, I want to…, so I can…") · need (requirement/expectation) · workaround (how they cope today) · tool (a tool, competitor or channel they use; put its name in "tools") · feature_request (something they ask for) · wtp (willingness to pay: price, budget, what they pay today) · praise (positive reaction to the product) · objection (doubt, rejection, reason not to use it)`;
const STRENGTH_HELP = `said (stated opinion or wish) < does (what they actually do today, a workaround they run, a tool they use) < pays (spends money or a budget of time on it now, or names a concrete price they'd pay)`;

export const SYSTEM_RESEARCHER =
  "You are a senior product researcher working for a product team. You are rigorous: you never invent quotes, numbers or people, you keep disagreement visible, and you label thin evidence as thin. You reply with JSON only.";

export function taxonomyPrompt({ product, excerpts }) {
  return `PRODUCT CONTEXT
Name: ${product?.name || "(not given: infer it from the transcripts)"}
Description: ${product?.description || "(not given: infer it from the transcripts)"}

TRANSCRIPT EXCERPTS (${excerpts.length} files, the first part of each)
${excerpts.map((e) => `=== FILE: ${e.name} ===\n${e.text}`).join("\n\n")}

TASK
Design the frame the team will use to tag every quote in these interviews.
1. products: the product, or product areas, the interviews are about (1–4). One product → one entry.
2. personas: 2–5 customer personas that these transcripts actually contain or clearly describe. Split them by the job they are trying to get done, not by demographics. Don't add a persona nobody in the transcripts represents.
3. stages: for each persona, 4–8 journey stages in time order, covering their whole job from first need to repeat use (not just our product's screens).
4. hypotheses: 3–6 testable hypotheses the team could check against these interviews, each tied to one product.

Return ONLY this JSON:
{
  "product": {"name": "Product name", "description": "One paragraph: what it is and who it is for"},
  "products": [{"id": "kebab-case-id", "label": "Label"}],
  "personas": [{"id": "snake_case_id", "name": "Short persona name", "short": "1–2 word label", "description": "One sentence"}],
  "stages": {"<persona id>": [{"id": "<persona id>.<stage_slug>", "title": "Verb phrase, 2–5 words"}]},
  "hypotheses": [{"id": "H1", "product": "<product id>", "name": "H1 Short name", "statement": "A falsifiable statement"}]
}
Ids use lowercase ascii letters, digits, "_" and "-" only. Every stage id starts with its persona id and a dot.`;
}

export function frameText(tax) {
  return `PRODUCTS: ${tax.products.map((p) => `${p.id} (${p.label})`).join(", ")}${tax.products.length > 1 ? ', or "cross" when a quote concerns several' : ""}

PERSONAS (use these ids)
${tax.personas.map((p) => `- ${p.id}: ${p.name}. ${p.description}`).join("\n")}

JOURNEY STAGES (use these ids)
${tax.personas.map((p) => `${p.id}: ${(tax.stages[p.id] || []).map((s) => `${s.id} (${s.title})`).join(" · ")}`).join("\n")}

HYPOTHESES
${(tax.hypotheses || []).map((h) => `- ${h.id} [${h.product}]: ${h.statement}`).join("\n") || "(none)"}`;
}

export function extractPrompt({ tax, file, text }) {
  return `You are tagging one customer interview for the product "${tax.product?.name || ""}".

${frameText(tax)}

QUOTE TYPES: ${TYPES_HELP}
EVIDENCE STRENGTH: ${STRENGTH_HELP}
SEVERITY: 1 minor · 2 notable · 3 critical / deal-breaker

TRANSCRIPT (file: ${file})
<<<
${text}
>>>

RULES
- Evidence comes from the interviewee, not the interviewer. Ignore the interviewer's own opinions and pitches.
- Every quote is copied word for word from the transcript. If the transcript isn't in English, translate the quote faithfully into English and set quote_kind "translated". Use "paraphrase" only when no single passage says it. Never invent a quote, a number or a name.
- Write 12–30 nuggets for a real interview (fewer for a short call). Cover pains, jobs, tools and workarounds, feature requests, willingness to pay AND objections: disagreement is as valuable as support.
- "text" is one specific sentence in English: keep numbers, frequencies, prices and tool names.
- Tag the persona whose need the quote expresses. Usually that's the interviewee's persona; if they describe someone else's pain (a manager describing guests, say), tag that persona and put the speaker's persona in said_by_persona.
- Pick the closest stage of that persona. If none fits, still pick the closest and describe a better stage in stage_suggestion.
- When a nugget supports or contradicts a hypothesis, give its id in "hypothesis" and "for" or "against" in "stance"; otherwise null for both.

Return ONLY this JSON:
{
  "source": {"id_hint": "yymmdd-firstname", "date": "YYYY-MM-DD or null", "interviewee": "Name as written", "role": "Their role", "company": "Company or null",
             "product": "<product id>", "persona": "<persona id>", "source_type": "${SOURCE_TYPES.join("|")}", "language": "en", "summary": "2–3 sentences: who they are and what mattered most"},
  "nuggets": [{"persona": "<persona id>", "said_by_persona": "<persona id>", "product": "<product id>", "stage": "<stage id>", "stage_suggestion": null,
               "type": "${NUGGET_TYPES.join("|")}", "text": "…", "quote": "…", "quote_kind": "${QUOTE_KINDS.join("|")}",
               "strength": "${STRENGTHS.join("|")}", "severity": 1, "tools": [], "hypothesis": null, "stance": null}]
}`;
}

export function synthPrompt({ tax, persona, own, others, existing, newSources }) {
  const stages = tax.stages[persona.id] || [];
  const productName = tax.product?.name || "our product";
  return `You own ONE persona of "${productName}": ${persona.id} (${persona.name}). ${persona.description}

${frameText(tax)}

QUOTES TAGGED WITH THIS PERSONA (${own.length}; full detail, JSON lines)
${own.map((n) => JSON.stringify(n)).join("\n")}

OTHER QUOTES (${others.length}; short form, scan them for support or contradiction)
${others.map((n) => JSON.stringify(n)).join("\n")}

${
  existing
    ? `EXISTING SYNTHESIS FOR THIS PERSONA (update it IN PLACE; the team has already scored its features)
${JSON.stringify(existing)}

INCREMENTAL UPDATE RULES
- New sources since the last build: ${newSources?.length ? newSources.join(", ") : "none listed: re-check every quote"}.
- Attach new quotes to the "for" or "against" of existing jobs, statements, opportunities and features first. Add a new statement, job, opportunity or feature only for something none of the existing ones covers (new feature id = next free "${persona.id}.sN").
- Never delete or renumber existing ids. Never change an existing feature's title, product, kano, impact or effort.
`
    : ""
}
TASK
Build this persona's profile, journey map, opportunities and RICE-scored features from the quotes above. Every claim cites quote ids that exist above, in "for" (supports it) or "against" (contradicts or limits it). Look hard for "against": disagreement between interviewees matters. A statement with no evidence may stay only if it is a clearly labelled assumption ("assumption": true, empty for/against).

- Journey: exactly these stages, in this order: ${stages.map((s) => s.id).join(", ")}. For each, 2–6 short statements (≤ 25 words, specific: keep tool names and numbers) per row:
  pains · jobs · tools (existing tools and workarounds, name them) · our_flow (how they do this step with ${productName} today, or the gap if it doesn't cover it) · features (what we should build here; each links a feature id in "solution"). Rows may be empty where there's no evidence.
- emotion per stage: -2 (painful) … 2 (delightful), from the evidence.
- 5–10 jobs to be done ("When …, I want to …, so I can …"), importance 1–3.
- 4–12 opportunities (needs framed as opportunities) and 4–12 features. One feature can serve several opportunities; don't clone a feature per stage.
- Feature scores: impact 0.25 minimal · 0.5 low · 1 medium · 2 high · 3 massive. confidence 1.0 = "pays" evidence from ≥2 people · 0.8 = "does" evidence · 0.5 = only "said", or thin. effort = rough person-weeks. Reach is computed for you from the quotes in "for".
- evidence_level: strong (several interviewees, "does"/"pays" evidence) · moderate · thin (one interviewee, or mostly other people talking about them). Explain it in evidence_note.

Return ONLY this JSON:
{
  "persona": {"id": "${persona.id}", "name": "…", "tagline": "One line: who they are", "description": "3–4 sentences grounded in the quotes",
    "goals": ["…"], "frustrations": ["…"], "products": ["<product id>"], "sources": ["<source id>"],
    "evidence_level": "strong|moderate|thin", "evidence_note": "…",
    "jobs": [{"id": "${persona.id}.j1", "statement": "When …, I want to …, so I can …", "importance": 3, "stage": "<stage id>", "for": ["<quote id>"], "against": []}]},
  "journey": [{"stage": "<stage id>", "title": "…", "goal": "What they want from this step", "emotion": 0,
    "rows": {"pains": [STMT], "jobs": [STMT], "tools": [STMT], "our_flow": [STMT], "features": [STMT with "solution": "<feature id>"]}}],
  "opportunities": [{"id": "${persona.id}.o1", "title": "…", "stage": "<stage id>", "product": "<product id>", "for": [], "against": []}],
  "solutions": [{"id": "${persona.id}.s1", "title": "Short imperative feature name", "description": "2–3 sentences: what it is and the outcome",
    "product": "<product id>", "personas": ["${persona.id}"], "stage": "<stage id>", "opportunities": ["${persona.id}.o1"], "kano": "${KANO.join("|")}",
    "impact": 1, "confidence": 0.8, "effort": 2, "rationale": "One sentence: why these scores", "for": [], "against": []}]
}
STMT = {"id": "${persona.id}.<stage slug>.p1", "text": "…", "for": ["<quote id>"], "against": [], "assumption": false}`;
}
