// Copy the production build to ../docs, which GitHub Pages serves.
import { cpSync, rmSync, writeFileSync } from "node:fs";

const src = new URL("../dist/", import.meta.url).pathname;
const docs = new URL("../../docs/", import.meta.url).pathname;
rmSync(docs, { recursive: true, force: true });
cpSync(src, docs, { recursive: true });
writeFileSync(docs + ".nojekyll", "");   // serve files as-is, no Jekyll processing
console.log("copied dist to docs/");
