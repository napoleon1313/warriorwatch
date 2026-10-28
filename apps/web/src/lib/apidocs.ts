import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import { API_BASE } from "./api";

/**
 * Build-time only: renders packages/contract/API.md (the single source of
 * truth for the public API) to HTML for /about. Runs in a server component
 * during `next build`, so neither marked nor the markdown ships to the browser.
 */
export async function apiDocsHtml(): Promise<string> {
  const file = path.join(process.cwd(), "..", "..", "packages", "contract", "API.md");
  const md = await readFile(file, "utf8");
  let html = await marked.parse(md, { gfm: true, async: true });
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, "</table></div>");
  if (API_BASE) html = html.replaceAll("https://&lt;worker-host&gt;/api", `${API_BASE}/api`);
  return html;
}
