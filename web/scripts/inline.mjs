// Inline the built JS and CSS into a single HTML file (dist-single/index.html) for hosts that want one file.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// the private (owner) build: includes owner-only controls such as "Reveal now"
const dist = new URL("../dist-owner/", import.meta.url).pathname;
let html = readFileSync(join(dist, "index.html"), "utf8");
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/g, (_, f) =>
  `<style>${readFileSync(join(dist, f), "utf8")}</style>`);
html = html.replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/g, (_, f) =>
  `<script type="module">${readFileSync(join(dist, f), "utf8").replace(/<\/script/gi, "<\\/script")}</script>`);
// move the module script to the end of <body> so #root exists when it runs
const m = html.match(/<script type="module">[\s\S]*?<\/script>/);
if (m) html = html.replace(m[0], "").replace("</body>", m[0] + "</body>");
const out = new URL("../dist-single/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "index.html"), html);
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>|<meta name="viewport"[^>]*>/g, "");
// the inlined app code itself contains "</body>" strings, so cut at the LAST one (the real end of the page)
const body = html.slice(html.indexOf("<body>") + 6, html.lastIndexOf("</body>"));
writeFileSync(join(out, "artifact.html"), head.trim() + "\n" + body.trim() + "\n");
console.log("dist-single/index.html", (html.length / 1024).toFixed(0) + " KB");
