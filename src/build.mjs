// node mon/build.mjs        -> dist2/   (claude.ai artifact)
// node mon/build.mjs app    -> distapp/ (Mac app: classic script, workers as script-wrapped strings)
import * as esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const APP = process.argv[2] === "app";
const out = process.env.OUT || path.join(here, "..", APP ? "distapp" : "dist2");
const MONACO = path.join(here, "..", "node_modules", "monaco-editor", "esm", "vs");
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const common = { bundle: true, minify: true, legalComments: "none", logLevel: "warning", target: APP ? "safari15" : "es2022" };
await esbuild.build({ ...common, entryPoints: [path.join(here, "app.js")], format: APP ? "iife" : "esm", outfile: path.join(out, "app.js"),
  loader: { ".ttf": "dataurl" }, define: { __APP__: APP ? "true" : "false" } });
const workers = [["editor", "editor/editor.worker.js"], ["ts", "languages/features/typescript/ts.worker.js"], ["json", "languages/features/json/json.worker.js"]];
for (const [name, entry] of workers) {
  const r = await esbuild.build({ ...common, entryPoints: [path.join(MONACO, entry)], format: "iife", write: !APP, outfile: path.join(out, name + ".worker.js") });
  if (APP) fs.writeFileSync(path.join(out, name + ".worker.src.js"),
    `window.__EE_W=window.__EE_W||{};window.__EE_W[${JSON.stringify(name)}]=${JSON.stringify(r.outputFiles[0].text)};\n`);
}
const css = fs.readFileSync(path.join(out, "app.css"), "utf8"); fs.rmSync(path.join(out, "app.css"));
const base = fs.readFileSync(path.join(here, "base.css"), "utf8");
let html = fs.readFileSync(path.join(here, "index.tpl.html"), "utf8");
if (css.includes("</style")) throw new Error("css contains </style");
html = html.replace("/*MONACO_CSS*/", () => css).replace("/*BASE_CSS*/", () => base);
if (APP) html = html.replace('<script type="module" src="app.js"></script>', '<script src="app.js"></script>').replace("<title>草稿编辑器</title>", "<title>Easy Edit</title>");
fs.writeFileSync(path.join(out, "index.html"), html);
for (const f of fs.readdirSync(out)) console.log(f, (fs.statSync(path.join(out, f)).size / 1024 / 1024).toFixed(2) + " MB");
