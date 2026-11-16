import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "./config.js";
import { parseJsonLoose } from "./files.js";

// Two ways to reach Claude, picked in setup:
//  - "api": the Anthropic API with your own key (or ANTHROPIC_API_KEY from the environment)
//  - "cli": the Claude Code CLI installed and logged in on this computer (`claude -p`)

export class ClaudeError extends Error {
  name = "ClaudeError";
}

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

function apiClient(cfg) {
  if (!cfg.apiKey && !process.env.ANTHROPIC_API_KEY) {
    throw new ClaudeError("No Anthropic API key. Add one in Settings, or switch the engine to Claude Code.");
  }
  // timeout is in milliseconds in the TypeScript/JavaScript SDK
  return new Anthropic({ apiKey: cfg.apiKey || undefined, timeout: 15 * 60 * 1000 });
}

function textOf(message) {
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function checkStop(message) {
  if (message.stop_reason === "refusal") {
    throw new ClaudeError(`Claude declined this request${message.stop_details?.category ? ` (${message.stop_details.category})` : ""}.`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new ClaudeError("Claude's answer hit the length limit before it finished. Try fewer or shorter transcripts.");
  }
}

function explainApiError(e) {
  if (e instanceof Anthropic.AuthenticationError) return "The API key was rejected. Check it in Settings.";
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key isn't allowed to use that model.";
  if (e instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API. Wait a minute and run again.";
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach the Anthropic API. Check your internet connection.";
  if (e instanceof Anthropic.APIError) return `Anthropic API error ${e.status ?? ""}: ${e.message}`;
  return e?.message || String(e);
}

// One streamed request. Streaming avoids HTTP timeouts on long answers.
// Refusal fallbacks are on (the API retries on another model if a safety classifier declines);
// if the API rejects that parameter, we retry once without it.
async function apiComplete({ system, prompt, effort = "medium", signal }) {
  const cfg = loadConfig();
  const client = apiClient(cfg);
  const base = {
    model: cfg.model,
    max_tokens: 64000,
    system,
    messages: [{ role: "user", content: prompt }],
    output_config: { effort },
  };
  try {
    let message;
    try {
      message = await client.beta.messages
        .stream({ ...base, betas: [FALLBACK_BETA], fallbacks: "default" }, { signal })
        .finalMessage();
    } catch (e) {
      if (e instanceof Anthropic.BadRequestError && /fallback/i.test(e.message)) {
        message = await client.messages.stream(base, { signal }).finalMessage();
      } else throw e;
    }
    checkStop(message);
    return textOf(message);
  } catch (e) {
    if (e instanceof ClaudeError || signal?.aborted) throw e;
    throw new ClaudeError(explainApiError(e));
  }
}

// The Claude Code CLI in print mode, with every tool switched off, so it can only read and answer.
// It runs in an empty temp folder so it can't pick up any project instructions.
function cliComplete({ system, prompt, signal }) {
  const cfg = loadConfig();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "insight-hub-"));
  const args = ["-p", "--output-format", "json", "--tools", "", "--no-session-persistence", "--strict-mcp-config", "--model", cfg.cliModel];
  if (system) args.push("--system-prompt", system);
  return new Promise((resolve, reject) => {
    let out = "";
    let err = "";
    let child;
    try {
      child = spawn("claude", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    } catch (e) {
      reject(new ClaudeError(`Couldn't start Claude Code: ${e.message}`));
      return;
    }
    const kill = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", kill, { once: true });
    child.on("error", (e) =>
      reject(new ClaudeError(e.code === "ENOENT" ? "Claude Code isn't installed or isn't on your PATH. Install it, run `claude` once to log in, then test again." : e.message)),
    );
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      signal?.removeEventListener("abort", kill);
      fs.rm(cwd, { recursive: true, force: true }, () => {});
      if (signal?.aborted) return reject(new ClaudeError("Cancelled"));
      let res;
      try {
        res = JSON.parse(out);
      } catch {
        return reject(new ClaudeError(`Claude Code exited with code ${code}. ${err.trim().slice(0, 400)}`));
      }
      if (res.is_error) return reject(new ClaudeError(`Claude Code: ${res.result || "error"}. If you aren't logged in, run \`claude\` in a terminal and log in.`));
      resolve(String(res.result ?? ""));
    });
    child.stdin.end(prompt);
  });
}

export async function complete(opts) {
  return loadConfig().engine === "cli" ? cliComplete(opts) : apiComplete(opts);
}

// Ask for JSON. If the reply doesn't parse, ask once more and say what was wrong.
export async function completeJson(opts) {
  const first = await complete(opts);
  try {
    return parseJsonLoose(first);
  } catch (e) {
    opts.log?.(`Reply wasn't valid JSON (${e.message}), asking again…`, "warn");
    const again = await complete({ ...opts, prompt: `${opts.prompt}\n\nIMPORTANT: your previous reply could not be parsed as JSON (${e.message}). Reply with the JSON only: no prose, no code fence.` });
    return parseJsonLoose(again);
  }
}

export async function testEngine() {
  const text = await complete({ system: "You are a connectivity check.", prompt: 'Reply with exactly: {"ok": true}', effort: "low" });
  const json = parseJsonLoose(text);
  if (json?.ok !== true) throw new ClaudeError(`Unexpected reply: ${text.slice(0, 200)}`);
  const cfg = loadConfig();
  return cfg.engine === "cli" ? `Claude Code answered (model: ${cfg.cliModel}).` : `The Anthropic API answered (model: ${cfg.model}).`;
}

// Ask with a quote-search tool (API engine): Claude decides what to search for, we run the search.
export async function askWithTools({ system, messages, tools, runTool, signal }) {
  const cfg = loadConfig();
  const client = apiClient(cfg);
  const convo = [...messages];
  try {
    for (let round = 0; round < 8; round++) {
      const res = await client.messages.create(
        { model: cfg.model, max_tokens: 16000, system, messages: convo, tools, output_config: { effort: "medium" } },
        { signal },
      );
      if (res.stop_reason === "refusal") throw new ClaudeError("Claude declined to answer that.");
      const uses = res.content.filter((b) => b.type === "tool_use");
      if (res.stop_reason !== "tool_use" || !uses.length) return { text: textOf(res), truncated: res.stop_reason === "max_tokens" };
      convo.push({ role: "assistant", content: res.content });
      convo.push({
        role: "user",
        content: uses.map((u) => {
          try {
            return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(runTool(u.name, u.input)) };
          } catch (e) {
            return { type: "tool_result", tool_use_id: u.id, content: String(e.message || e), is_error: true };
          }
        }),
      });
    }
    return { text: "I searched several times without settling on an answer. Ask a narrower question.", truncated: true };
  } catch (e) {
    if (e instanceof ClaudeError || signal?.aborted) throw e;
    throw new ClaudeError(explainApiError(e));
  }
}
