import path from "node:path";
import { fileURLToPath } from "node:url";

// The repository root (one level above server/).
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PUBLIC_DIR = path.join(ROOT, "public");
export const SAMPLE_TRANSCRIPTS = path.join(ROOT, "samples", "transcripts");
