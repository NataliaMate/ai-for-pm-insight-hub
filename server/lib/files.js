import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expandHome } from "./config.js";

export const TRANSCRIPT_EXT = new Set([".md", ".markdown", ".txt", ".vtt", ".srt"]);
const MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024;

// Folder picker: list the sub-folders of one folder and count the transcript files in it.
export function listDir(p) {
  const abs = path.resolve(expandHome(p || os.homedir()));
  const entries = fs.readdirSync(abs, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => ({ name: e.name, path: path.join(abs, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const transcriptFiles = entries.filter((e) => e.isFile() && TRANSCRIPT_EXT.has(path.extname(e.name).toLowerCase())).length;
  const parent = path.dirname(abs);
  return { path: abs, parent: parent !== abs ? parent : null, dirs, transcriptFiles };
}

export function makeDir(p) {
  const abs = path.resolve(expandHome(p));
  fs.mkdirSync(abs, { recursive: true });
  return abs;
}

// Every transcript file directly inside the folder, with a content hash so we know which ones are new.
export function listTranscripts(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && TRANSCRIPT_EXT.has(path.extname(e.name).toLowerCase()))
    .map((e) => {
      const file = path.join(dir, e.name);
      const st = fs.statSync(file);
      const tooBig = st.size > MAX_TRANSCRIPT_BYTES;
      const hash = tooBig ? null : crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 16);
      return { name: e.name, file, size: st.size, mtime: st.mtime.toISOString(), hash, tooBig };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

// Pull a JSON value out of a model reply that may wrap it in prose or a code fence.
export function parseJsonLoose(text) {
  let t = String(text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.search(/[{[]/);
  const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (start < 0 || end < start) throw new Error("the reply contained no JSON");
  return JSON.parse(t.slice(start, end + 1));
}

export const slug = (s, sep = "-") =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, sep)
    .replace(new RegExp(`^\\${sep}+|\\${sep}+$`, "g"), "");
