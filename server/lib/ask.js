import { askWithTools, complete } from "./claude.js";
import { loadConfig } from "./config.js";
import { NUGGET_TYPES } from "./prompts.js";

// "Ask the knowledge base": Claude answers ONLY from the tagged interview quotes, with citations.
// If the interviews don't answer the question it replies with a fixed marker, and the page shows a
// "the interviews don't answer this" message instead of a guess.

export const NO_ANSWER = "NO_INTERVIEW_ANSWER";

const score = (s) => {
  const e = Number(s.effort) || 0;
  return e > 0 ? ((Number(s.reach) || 0) * (Number(s.impact) || 0) * (Number(s.confidence) || 0)) / e : 0;
};

export function searchQuotes(kb, { query = "", persona, product, stage, type, limit = 20 } = {}) {
  const src = new Map(kb.sources.map((s) => [s.id, s]));
  const words = String(query).toLowerCase().split(/[^\p{L}\p{N}.]+/u).filter((w) => w.length > 2);
  const out = [];
  for (const n of kb.nuggets) {
    if (persona && n.persona !== persona) continue;
    if (product && n.product !== product) continue;
    if (stage && n.stage !== stage) continue;
    if (type && n.type !== type) continue;
    const s = src.get(n.source) || {};
    const hay = `${n.text} ${n.quote} ${(n.tools || []).join(" ")} ${n.hypothesis || ""} ${s.interviewee} ${s.company || ""} ${n.type} ${n.stage}`.toLowerCase();
    const sc = words.length ? words.reduce((a, w) => a + (hay.includes(w) ? 1 : 0), 0) : 1;
    if (sc > 0) out.push([sc + (n.strength === "pays" ? 0.3 : n.strength === "does" ? 0.15 : 0) + (n.severity || 0) * 0.05, n, s]);
  }
  return out
    .sort((a, b) => b[0] - a[0])
    .slice(0, Math.min(60, Number(limit) || 20))
    .map(([, n, s]) => ({
      id: n.id,
      who: `${s.interviewee || ""} (${[s.role, s.company].filter(Boolean).join(", ")}, ${s.date || ""})`,
      persona: n.persona,
      product: n.product,
      stage: n.stage,
      type: n.type,
      strength: n.strength,
      insight: n.text,
      quote: n.quote,
    }));
}

function kbIndexText(kb) {
  const ps = kb.personas.map((p) => `- ${p.id}: ${p.name}: ${p.tagline} (evidence ${p.evidence_level}). Jobs: ${(p.jobs || []).map((j) => j.statement).join(" | ")}`).join("\n");
  const st = Object.entries(kb.stages).map(([pid, a]) => `${pid}: ${a.map((s) => `${s.id} (${s.title})`).join(", ")}`).join("\n");
  const sols = [...kb.solutions]
    .sort((a, b) => score(b) - score(a))
    .map((s) => `- ${s.id} "${s.title}" [${s.product}; ${(s.personas || []).join(",")}] RICE ${score(s).toFixed(1)} (R${s.reach} I${s.impact} C${s.confidence} E${s.effort}) status ${s.status}; evidence for ${(s.for || []).length}, against ${(s.against || []).length}`)
    .join("\n");
  const src = kb.sources.map((s) => `- ${s.id}: ${s.interviewee}, ${[s.role, s.company].filter(Boolean).join(", ")}, ${s.date}, ${s.source_type}, persona ${s.persona}, product ${s.product}`).join("\n");
  const hy = (kb.hypotheses || []).map((h) => `- ${h.product} ${h.name}: ${h.statement} (for ${h.evidence.filter((e) => e.stance === "for").length}, against ${h.evidence.filter((e) => e.stance !== "for").length})`).join("\n");
  return `PERSONAS\n${ps}\n\nJOURNEY STEPS\n${st}\n\nSOURCES\n${src}\n\nHYPOTHESES\n${hy}\n\nFEATURES (RICE)\n${sols}`;
}

function rules(kb) {
  return `You answer questions about the customer-interview knowledge base of "${kb.product?.name || "the product"}". ${kb.product?.description || ""}

SOURCES YOU MAY USE
- By default, use ONLY the knowledge base below and the interview quotes you are given. Do not use your own general knowledge, training data, industry facts, market numbers, or anything from the internet, even to fill a small gap or add context. You have no web access.
- Cite every claim with the quote id in square brackets, e.g. [260903-lucia-04], and name the interviewee. A claim you can't cite with a quote id (or a feature id from the knowledge base) doesn't go in the answer.
- Point out disagreement between interviewees and say when evidence is thin or only one person said it.

WHEN THE INTERVIEWS DON'T ANSWER
- If the interviews and the knowledge base don't contain the answer, reply with exactly ${NO_ANSWER} and nothing else. Don't guess, don't answer from general knowledge, and don't pad with loosely related quotes.
- If they answer only part of the question, answer that part with citations and say in one line which part the interviews don't cover.

GOING BEYOND THE INTERVIEWS (only on explicit request)
- Only when the user's LATEST message explicitly asks for more than the interviews (e.g. "look beyond the interviews", "use general knowledge", "what does the wider market say") may you add outside knowledge.
- Even then, first give what the interviews say, with citations. Then add a separate section headed "Beyond the interviews (general knowledge, not from interviews; may be out of date)". Never present outside knowledge as something an interviewee said.

Keep answers concise: short paragraphs or bullets, plain Markdown.

${kbIndexText(kb)}`;
}

export async function askKb(kb, messages, signal) {
  const chat = messages
    .filter((m) => ["user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.trim())
    .slice(-8)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (!chat.length || chat[chat.length - 1].role !== "user") throw new Error("Ask a question first.");
  const question = chat[chat.length - 1].content;

  if (loadConfig().engine === "api") {
    const personaIds = kb.personas.map((p) => p.id);
    const tools = [
      {
        name: "search_quotes",
        description: "Search the tagged interview quotes. Returns up to `limit` matches with id, interviewee, persona, product, journey stage, type, evidence strength, insight and quote. Search several times with different keywords before answering.",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "keywords" },
            persona: { type: "string", enum: personaIds },
            type: { type: "string", enum: NUGGET_TYPES },
            stage: { type: "string" },
            limit: { type: "number" },
          },
          required: ["query"],
        },
      },
    ];
    return askWithTools({
      system: rules(kb),
      messages: chat,
      tools,
      signal,
      runTool: (name, input) => {
        if (name !== "search_quotes") throw new Error(`Unknown tool ${name}`);
        return searchQuotes(kb, input);
      },
    });
  }
  // Claude Code CLI: no tool loop, so we search first and hand over the best-matching quotes.
  const quotes = searchQuotes(kb, { query: chat.filter((m) => m.role === "user").map((m) => m.content).join(" "), limit: 60 });
  const convo = chat.map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`).join("\n\n");
  const text = await complete({
    system: "You answer questions strictly from a customer-interview knowledge base.",
    prompt: `${rules(kb)}\n\nMATCHING QUOTES\n${JSON.stringify(quotes)}\n\nCONVERSATION\n${convo}\n\nAnswer the USER's latest message: ${question}`,
    effort: "medium",
    signal,
  });
  return { text, truncated: false };
}
