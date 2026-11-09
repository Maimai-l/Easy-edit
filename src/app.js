import * as monaco from "./monaco-entry.js";
import { PRELUDE } from "./prelude.js";

// ---------- workers (own files of the artifact) ----------
// In the Mac app the page is a file:// URL, where workers can't load from files: their code ships
// as script-wrapped strings and each worker starts from a blob instead.
const workerFile = label => label === "typescript" || label === "javascript" ? "ts" : label === "json" ? "json" : "editor";
const loadWorkerSrc = name => new Promise((res, rej) => {
  const have = () => window.__EE_W && window.__EE_W[name];
  if (have()) return res(have());
  const s = document.createElement("script");
  s.src = `${name}.worker.src.js`;
  s.onload = () => have() ? res(have()) : rej(new Error("worker source missing: " + name));
  s.onerror = () => rej(new Error("worker source failed: " + name));
  document.head.appendChild(s);
});
self.MonacoEnvironment = {
  getWorker(_id, label) {
    if (__APP__) return loadWorkerSrc(workerFile(label)).then(src => new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })), { name: label }));
    return new Worker(new URL(workerFile(label) + ".worker.js", location.href), { name: label });
  },
};

const $ = id => document.getElementById(id);
const store = {
  get(k){ try { return localStorage.getItem(k); } catch { return null; } },
  set(k,v){ try { localStorage.setItem(k,v); } catch {} },
};
const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const KEY = MAC ? "Cmd" : "Ctrl";
const esc = s => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

// ---------- native bridge (Mac app only) ----------
const bridge = __APP__ ? window.webkit?.messageHandlers?.ee : null;
const native = (cmd, args = {}) => bridge ? bridge.postMessage({ cmd, ...args }) : Promise.reject(new Error("no bridge"));
let env = { python: null, cpp: null, workdir: "~/Easy Edit" };
if (__APP__) document.body.classList.add("app");

// id, label, monaco language, file extension
const LANGS = [
  ["typescript","TypeScript","typescript","ts"], ["javascript","JavaScript","javascript","js"],
  ...(__APP__ ? [["python","Python","python","py"], ["cpp","C++","cpp","cpp"]] : []),
  ["plain","纯文本","plaintext","txt"],
];
const langSel = $("lang");
$("indent").value = store.get("ed.indent") || "4";
$("target").value = store.get("ed.target") || "ES2022";
$("strict").checked = store.get("ed.strict") !== "0";
$("minimap").checked = store.get("ed.minimap") === "1";
$("wrap").checked = store.get("ed.wrap") === "1";

const lang = () => active().lang;
const info = () => LANGS.find(l => l[0] === lang());
const isTS = () => lang() === "typescript";
const isNativeLang = () => lang() === "python" || lang() === "cpp";
const canRun = () => lang() === "typescript" || lang() === "javascript" || (lang() === "python" && !!env.python) || (lang() === "cpp" && !!env.cpp);

// ---------- themes ----------
const LIGHT = {
  bg:"#ffffff", fg:"#1d1d1f", k:"9b2393", s:"c41a16", n:"1c00cf", c:"5d6c79", t:"0b4f79", f:"326d74", p:"3900a0", re:"6c36a9", tag:"9b2393", attr:"836c28", punc:"1d1d1f",
  colors: {
    "editor.background":"#ffffff", "editor.foreground":"#1d1d1f",
    "editorLineNumber.foreground":"#c7c7cc", "editorLineNumber.activeForeground":"#6e6e73",
    "editor.lineHighlightBackground":"#00000000", "editor.lineHighlightBorder":"#0000000a",
    "editor.selectionBackground":"#b4d7ff", "editor.inactiveSelectionBackground":"#dfe8f3",
    "editor.selectionHighlightBackground":"#00000010", "editor.wordHighlightBackground":"#0000000c", "editor.wordHighlightStrongBackground":"#00000012",
    "editorCursor.foreground":"#1d1d1f",
    "editorIndentGuide.background1":"#0000000f", "editorIndentGuide.activeBackground1":"#00000030",
    "editorWhitespace.foreground":"#00000022",
    "editorBracketMatch.background":"#0000000d", "editorBracketMatch.border":"#00000030",
    "editorBracketHighlight.foreground1":"#1d1d1f", "editorBracketHighlight.foreground2":"#9b2393", "editorBracketHighlight.foreground3":"#0b4f79",
    "editorBracketHighlight.foreground4":"#1d1d1f", "editorBracketHighlight.foreground5":"#9b2393", "editorBracketHighlight.foreground6":"#0b4f79",
    "editorGutter.background":"#ffffff", "editorWidget.background":"#fbfbfb", "editorWidget.border":"#0000001a",
    "editorSuggestWidget.background":"#fbfbfb", "editorSuggestWidget.border":"#0000001a", "editorSuggestWidget.selectedBackground":"#0000000f",
    "editorSuggestWidget.highlightForeground":"#1d1d1f", "editorSuggestWidget.focusHighlightForeground":"#1d1d1f",
    "editorHoverWidget.background":"#fbfbfb", "editorHoverWidget.border":"#0000001a",
    "list.hoverBackground":"#0000000a", "list.activeSelectionBackground":"#0000000f", "list.activeSelectionForeground":"#1d1d1f", "list.focusHighlightForeground":"#1d1d1f", "list.highlightForeground":"#1d1d1f",
    "scrollbarSlider.background":"#00000014", "scrollbarSlider.hoverBackground":"#00000024", "scrollbarSlider.activeBackground":"#00000030",
    "editorOverviewRuler.border":"#00000000", "editorStickyScroll.background":"#ffffff", "editorStickyScrollHover.background":"#f5f5f7", "editorStickyScroll.shadow":"#00000014",
    "editorError.foreground":"#d70015", "editorWarning.foreground":"#c27c00",
    "focusBorder":"#00000000", "input.background":"#ffffff", "input.border":"#0000001a", "inputOption.activeBorder":"#00000040",
    "minimap.background":"#ffffff",
  },
};
const DARK = {
  bg:"#1e1e1e", fg:"#e8e8ea", k:"fc5fa3", s:"fc6a5d", n:"d0bf69", c:"6c7986", t:"5dd8ff", f:"67b7a4", p:"a167e6", re:"d0a8ff", tag:"fc5fa3", attr:"bf8555", punc:"d4d4d6",
  colors: {
    "editor.background":"#1e1e1e", "editor.foreground":"#e8e8ea",
    "editorLineNumber.foreground":"#4a4a4f", "editorLineNumber.activeForeground":"#98989d",
    "editor.lineHighlightBackground":"#00000000", "editor.lineHighlightBorder":"#ffffff0c",
    "editor.selectionBackground":"#3f638b", "editor.inactiveSelectionBackground":"#34404d",
    "editor.selectionHighlightBackground":"#ffffff14", "editor.wordHighlightBackground":"#ffffff10", "editor.wordHighlightStrongBackground":"#ffffff18",
    "editorCursor.foreground":"#f5f5f7",
    "editorIndentGuide.background1":"#ffffff10", "editorIndentGuide.activeBackground1":"#ffffff30",
    "editorWhitespace.foreground":"#ffffff26",
    "editorBracketMatch.background":"#ffffff12", "editorBracketMatch.border":"#ffffff38",
    "editorBracketHighlight.foreground1":"#d4d4d6", "editorBracketHighlight.foreground2":"#fc5fa3", "editorBracketHighlight.foreground3":"#5dd8ff",
    "editorBracketHighlight.foreground4":"#d4d4d6", "editorBracketHighlight.foreground5":"#fc5fa3", "editorBracketHighlight.foreground6":"#5dd8ff",
    "editorGutter.background":"#1e1e1e", "editorWidget.background":"#2a2a2c", "editorWidget.border":"#ffffff1a",
    "editorSuggestWidget.background":"#2a2a2c", "editorSuggestWidget.border":"#ffffff1a", "editorSuggestWidget.selectedBackground":"#ffffff14",
    "editorSuggestWidget.highlightForeground":"#ffffff", "editorSuggestWidget.focusHighlightForeground":"#ffffff",
    "editorHoverWidget.background":"#2a2a2c", "editorHoverWidget.border":"#ffffff1a",
    "list.hoverBackground":"#ffffff0d", "list.activeSelectionBackground":"#ffffff14", "list.activeSelectionForeground":"#f5f5f7", "list.focusHighlightForeground":"#ffffff", "list.highlightForeground":"#ffffff",
    "scrollbarSlider.background":"#ffffff14", "scrollbarSlider.hoverBackground":"#ffffff24", "scrollbarSlider.activeBackground":"#ffffff30",
    "editorOverviewRuler.border":"#00000000", "editorStickyScroll.background":"#1e1e1e", "editorStickyScrollHover.background":"#2a2a2c", "editorStickyScroll.shadow":"#00000066",
    "editorError.foreground":"#ff6961", "editorWarning.foreground":"#ffb340",
    "focusBorder":"#00000000", "input.background":"#1e1e1e", "input.border":"#ffffff1a", "inputOption.activeBorder":"#ffffff40",
    "minimap.background":"#1e1e1e",
  },
};
function rules(x){
  return [
    { token:"", foreground:x.fg.slice(1) },
    { token:"comment", foreground:x.c },
    { token:"keyword", foreground:x.k, fontStyle:"bold" },
    { token:"string", foreground:x.s }, { token:"string.escape", foreground:x.n },
    { token:"number", foreground:x.n },
    { token:"regexp", foreground:x.re },
    { token:"type", foreground:x.t }, { token:"type.identifier", foreground:x.t },
    { token:"identifier", foreground:x.fg.slice(1) },
    { token:"delimiter", foreground:x.punc }, { token:"operator", foreground:x.punc },
    { token:"tag", foreground:x.tag }, { token:"metatag", foreground:x.tag },
    { token:"attribute.name", foreground:x.attr }, { token:"attribute.value", foreground:x.s },
    { token:"variable", foreground:x.p }, { token:"variable.predefined", foreground:x.t },
    { token:"annotation", foreground:x.attr }, { token:"key", foreground:x.p },
    { token:"string.key.json", foreground:x.p }, { token:"string.value.json", foreground:x.s },
    { token:"keyword.json", foreground:x.k },
  ];
}
monaco.editor.defineTheme("paper", { base:"vs", inherit:true, rules:rules(LIGHT), colors:LIGHT.colors });
monaco.editor.defineTheme("ink", { base:"vs-dark", inherit:true, rules:rules(DARK), colors:DARK.colors });
const darkQ = matchMedia("(prefers-color-scheme: dark)");
const applyTheme = () => monaco.editor.setTheme(darkQ.matches ? "ink" : "paper");
darkQ.addEventListener?.("change", applyTheme);

// ---------- TypeScript ----------
const ts = monaco.typescript;
const ENV_DTS = `
declare module "*";
declare var process: {
  argv: string[]; env: Record<string, string | undefined>; platform: string; version: string;
  exit(code?: number): never; nextTick(fn: (...args: any[]) => void, ...args: any[]): void; cwd(): string;
  hrtime: { bigint(): bigint }; memoryUsage(): { heapUsed: number };
  stdout: { write(s: string): boolean }; stderr: { write(s: string): boolean };
};
declare function require(id: string): any;
declare namespace JSX { interface IntrinsicElements { [tag: string]: any } interface Element {} }
`;
function applyTsOptions(){
  const opts = {
    target: { ES2015: 2, ES2017: 4, ES2020: 7, ES2022: 9, ESNext: 99 }[$("target").value] ?? 9,
    module: ts.ModuleKind.ESNext,
    moduleResolution: 100, // Bundler
    moduleDetection: 3,    // Force: every file is a module, no clashes with DOM globals
    strict: $("strict").checked,
    lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts", "lib.dom.asynciterable.d.ts"],
    jsx: ts.JsxEmit.Preserve,
    allowNonTsExtensions: true, esModuleInterop: true, skipLibCheck: true,
    noEmit: false, removeComments: false, sourceMap: false,
  };
  ts.typescriptDefaults.setCompilerOptions(opts);
  ts.javascriptDefaults.setCompilerOptions({ ...opts, allowJs: true, checkJs: false });
}
applyTsOptions();
ts.typescriptDefaults.addExtraLib(ENV_DTS, "file:///env.d.ts");
ts.javascriptDefaults.addExtraLib(ENV_DTS, "file:///env.d.ts");
ts.typescriptDefaults.setEagerModelSync(true);
ts.javascriptDefaults.setEagerModelSync(true);

// ---------- editor ----------
const indentOpts = () => {
  const v = $("indent").value;
  return v === "tab" ? { insertSpaces:false, tabSize:4 } : { insertSpaces:true, tabSize:+v };
};
// ---------- scratches: no names, no paths, auto-saved in this browser ----------
const KEEP = 50;
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const blank = l => ({ id: newId(), lang: l || "typescript", content: "", mtime: Date.now() });
function loadScratches(){
  try {
    const s = JSON.parse(store.get("ed.scratch") || "null");
    if (Array.isArray(s) && s.length && s.every(x => x && typeof x.content === "string" && LANGS.some(l => l[0] === x.lang))) return s;
  } catch {}
  // carry over earlier versions: the named files, or the single draft before that
  const byExt = { ts:"typescript", mts:"typescript", cts:"typescript", tsx:"typescript", js:"javascript", mjs:"javascript", cjs:"javascript", jsx:"javascript" };
  let out = [];
  try {
    const f = JSON.parse(store.get("ed.files") || "null");
    if (Array.isArray(f)) out = f.filter(x => x && typeof x.content === "string" && x.content.trim())
      .map(x => ({ id: newId(), lang: byExt[(x.name.split(".").pop() || "").toLowerCase()] || "plain", content: x.content, mtime: x.mtime || Date.now() }));
  } catch {}
  if (!out.length && (store.get("ed.code") || "").trim()) out = [{ ...blank(store.get("ed.lang") === "javascript" ? "javascript" : "typescript"), content: store.get("ed.code") }];
  return out.length ? out : [blank()];
}
let scratches = loadScratches();
let activeId = scratches.some(s => s.id === store.get("ed.activeScratch")) ? store.get("ed.activeScratch") : recent()[0].id;
function recent(){ return [...scratches].sort((a, b) => b.mtime - a.mtime); }
const active = () => scratches.find(s => s.id === activeId);
let saveT, probT, quotaWarned = false;
function saveAll(){
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { localStorage.setItem("ed.scratch", JSON.stringify(scratches)); localStorage.setItem("ed.activeScratch", activeId); }
    catch { if (!quotaWarned) { quotaWarned = true; toast("浏览器存储空间不够了，最近的修改没有存上"); } }
  }, 250);
}
const models = new Map(), views = new Map();
function modelFor(s){
  let m = models.get(s.id);
  if (m && !m.isDisposed()) return m;
  const [, , mlang, ext] = LANGS.find(l => l[0] === s.lang);
  m = monaco.editor.createModel(s.content, mlang, monaco.Uri.from({ scheme: "file", path: `/${s.id}/scratch.${ext}` }));
  m.updateOptions({ ...indentOpts(), trimAutoWhitespace: true });
  m.onDidChangeContent(() => {
    s.content = m.getValue(); s.mtime = Date.now(); saveAll();
    if (runMarked.has(m)) { monaco.editor.setModelMarkers(m, "run", []); runMarked.delete(m); }
    clearTimeout(listT); listT = setTimeout(renderList, 400);
    if (s.id !== activeId) return;
    clearTimeout(probT); probT = setTimeout(updateProblems, 1200);
    if (curView === "js") scheduleJs();
  });
  models.set(s.id, m);
  return m;
}
let listT;
const runMarked = new Set();
let model = modelFor(active());
applyTheme();
const editor = monaco.editor.create($("editor"), {
  model,
  theme: darkQ.matches ? "ink" : "paper",
  automaticLayout: true,
  fontFamily: '"SF Mono", ui-monospace, Menlo, "JetBrains Mono", Consolas, "Liberation Mono", monospace',
  fontSize: 13, lineHeight: 21, letterSpacing: 0,
  fontLigatures: false,
  padding: { top: 16, bottom: 16 },
  lineNumbersMinChars: 3, lineDecorationsWidth: 12, glyphMargin: false, folding: true, showFoldingControls: "mouseover",
  minimap: { enabled: $("minimap").checked, renderCharacters: false, scale: 1, showSlider: "mouseover" },
  wordWrap: $("wrap").checked ? "on" : "off",
  scrollBeyondLastLine: true,
  // VS Code defaults: no caret/scroll animation, so the cursor and the page track input instantly
  smoothScrolling: false,
  cursorBlinking: "blink", cursorSmoothCaretAnimation: "off", cursorWidth: 2,
  renderLineHighlight: "line", renderLineHighlightOnlyWhenFocus: true,
  renderWhitespace: "selection",
  guides: { indentation: true, highlightActiveIndentation: true, bracketPairs: false },
  bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: false },
  matchBrackets: "always",
  autoClosingBrackets: "languageDefined", autoClosingQuotes: "languageDefined",
  autoClosingOvertype: "always", autoClosingDelete: "always", autoSurround: "languageDefined",
  autoIndent: "full", formatOnPaste: false, formatOnType: true,
  linkedEditing: true,
  stickyScroll: { enabled: true, maxLineCount: 4 },
  quickSuggestions: { other: true, comments: false, strings: false }, suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: "on", tabCompletion: "off", snippetSuggestions: "inline",
  suggest: { showStatusBar: false, preview: false, insertMode: "insert" },
  parameterHints: { enabled: true },
  hover: { delay: 300, sticky: true },
  inlayHints: { enabled: "off" },
  detectIndentation: false,
  placeholder: "在这里写代码",
  fixedOverflowWidgets: true,
  overviewRulerLanes: 2, hideCursorInOverviewRuler: true, overviewRulerBorder: false,
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false, alwaysConsumeMouseWheel: false },
  contextmenu: true, mouseWheelZoom: true, dragAndDrop: true,
  unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: true },
  accessibilitySupport: "off",
});
window.editor = editor; window.monaco = monaco;

// ---------- status ----------
function renderStat(){
  const p = editor.getPosition();
  const sel = editor.getSelection();
  const selLen = sel && !sel.isEmpty() ? model.getValueInRange(sel).length : 0;
  $("stat").textContent = p ? `行 ${p.lineNumber}，列 ${p.column}` + (selLen ? `（已选 ${selLen}）` : "") : "";
}
editor.onDidChangeCursorSelection(renderStat);

function refreshChrome(){
  langSel.innerHTML = "";
  for (const [v, label] of LANGS) if (v !== "plain" || lang() === "plain") langSel.add(new Option(label, v));
  langSel.value = lang(); fitSelect(langSel);
  document.title = titleOf(active()) || "草稿";
  document.querySelectorAll(".tsopt").forEach(el => el.classList.toggle("hidden", !isTS()));
  $("tc").classList.toggle("hidden", !isTS());
  $("run").disabled = !canRun();
  $("run").title = canRun() ? `运行（${KEY} + Enter）`
    : lang() === "python" ? "没有找到 python3" : lang() === "cpp" ? "没有找到 clang++，请安装 Xcode 命令行工具" : "纯文本不能运行";
  if (!isTS() && curView !== "cons") show("cons");
  renderList();
}
// drop scratches nobody wrote anything in, and keep the list short
function tidy(){
  scratches = scratches.filter(s => s.id === activeId || s.content.trim());
  for (const s of recent().slice(KEEP)) if (s.id !== activeId) { models.get(s.id)?.dispose(); models.delete(s.id); views.delete(s.id); scratches = scratches.filter(x => x !== s); }
  for (const id of [...models.keys()]) if (!scratches.some(s => s.id === id)) { models.get(id)?.dispose(); models.delete(id); views.delete(id); }
}
function openScratch(id, { focus = true } = {}){
  if (editor.getModel()) views.set(activeId, editor.saveViewState());
  activeId = id;
  tidy(); saveAll();
  model = modelFor(active());
  editor.setModel(model);
  const vs = views.get(id); if (vs) editor.restoreViewState(vs);
  refreshChrome(); renderStat();
  if (isTS()) setTc("busy", "正在检查");
  updateProblems(); setTimeout(updateProblems, 1500);
  if (curView === "js") renderJs();
  if (focus) editor.focus();
}
function newScratch(){
  const cur = active();
  if (!cur.content.trim()) { editor.focus(); return; } // already on an empty one
  const s = blank(cur.lang === "plain" ? "typescript" : cur.lang);
  scratches.push(s);
  openScratch(s.id);
}
function deleteScratch(id){
  const order = recent().map(s => s.id), i = order.indexOf(id);
  models.get(id)?.dispose(); models.delete(id); views.delete(id);
  scratches = scratches.filter(s => s.id !== id);
  if (!scratches.length) scratches.push(blank());
  if (id === activeId) { const next = order.filter(x => x !== id)[Math.min(i, order.length - 2)]; openScratch(next && scratches.some(s => s.id === next) ? next : scratches[0].id); }
  else renderList();
  saveAll();
}
// changing the language re-types the same scratch
langSel.addEventListener("change", () => {
  const s = active();
  views.set(s.id, editor.saveViewState());
  const old = models.get(s.id); models.delete(s.id);
  s.lang = langSel.value; saveAll();
  model = modelFor(s); editor.setModel(model);
  const vs = views.get(s.id); if (vs) editor.restoreViewState(vs);
  if (old) { monaco.editor.setModelMarkers(old, "run", []); runMarked.delete(old); old.dispose(); }
  refreshChrome();
  if (isTS()) setTc("busy", "正在检查");
  updateProblems(); setTimeout(updateProblems, 1500);
  editor.focus();
});

// ---------- recent list ----------
const titleOf = s => {
  const line = s.content.split("\n").map(l => l.trim()).find(l => l && !/^(\/\/|\/\*|\*|#!)/.test(l)) || s.content.trim().split("\n")[0] || "";
  return line.length > 60 ? line.slice(0, 60) + "…" : line;
};
function ago(t){
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} 天前`;
  const d = new Date(t); return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
const TRASH = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M3 4.5h10M6.5 4.5V3.2c0-.4.3-.7.7-.7h1.6c.4 0 .7.3.7.7v1.3M4.5 4.5l.6 8.2c0 .5.4.8.9.8h4c.5 0 .9-.3.9-.8l.6-8.2"/></svg>`;
const SHORT = { typescript: "TS", javascript: "JS", python: "Py", cpp: "C++", plain: "文本" };
function renderList(){
  const list = $("fileList");
  list.innerHTML = recent().map(s => {
    const title = titleOf(s);
    return `<div class="f${s.id === activeId ? " on" : ""}" data-id="${s.id}"><div class="nm"><div class="t${title ? "" : " empty"}">${title ? esc(title) : "空白草稿"}</div><div class="meta">${SHORT[s.lang]} · ${ago(s.mtime)}</div></div><button class="del" title="删除">${TRASH}</button></div>`;
  }).join("");
  if (active()) document.title = titleOf(active()) || "草稿";
}
setInterval(renderList, 60000); // keep "n 分钟前" honest
$("fileList").addEventListener("click", e => {
  const row = e.target.closest(".f"); if (!row) return;
  const del = e.target.closest(".del");
  if (del) {
    if (del.dataset.armed) return deleteScratch(row.dataset.id);
    del.dataset.armed = 1; del.textContent = "删除"; del.classList.add("armed");
    setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.innerHTML = TRASH; del.classList.remove("armed"); } }, 2500);
    return;
  }
  if (row.dataset.id !== activeId) openScratch(row.dataset.id);
  if (innerWidth <= 760) setSidebar(false); // overlay on small screens: get out of the way
});
$("newFile").onclick = newScratch;
function setSidebar(open){
  document.body.classList.toggle("files-open", open);
  store.set("ed.sidebar", open ? "1" : "0");
}
$("toggleFiles").onclick = () => setSidebar(!document.body.classList.contains("files-open"));
setSidebar(store.get("ed.sidebar") !== "0" && innerWidth > 760);

// ---------- download (through the platform's save prompt) ----------
const DIRECT = new Set(["txt", "json", "md", "html", "csv", "svg"]);
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(entries){ // stored (no compression): tiny, and plenty for text
  const enc = new TextEncoder(), parts = [], central = [];
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
        date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let off = 0;
  for (const { name, content } of entries) {
    const nb = enc.encode(name), db = enc.encode(content), crc = crc32(db);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
    h.setUint32(18, db.length, true); h.setUint32(22, db.length, true); h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
    parts.push(h.buffer, nb, db);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, db.length, true); c.setUint32(24, db.length, true);
    c.setUint16(28, nb.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true);
    c.setUint32(38, 0, true); c.setUint32(42, off, true);
    central.push(c.buffer, nb);
    off += 30 + nb.length + db.length;
  }
  const size = central.reduce((s, x) => s + x.byteLength, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
  e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, e.buffer]);
}
let downloads = null;
async function save(filename, data){
  if (!downloads) return toast("这里不能下载文件");
  try { await downloads.save({ filename, data }); toast(`已下载 ${filename}`); }
  catch (e) {
    if (e?.code === "declined") return;
    toast(e?.code === "rate_limited" ? "已经有一个下载在等确认" : "下载失败：" + (e?.message || e?.code || e));
  }
}
const stamp = t => { const d = new Date(t), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
const fileNameOf = s => `scratch-${stamp(s.mtime)}.${LANGS.find(l => l[0] === s.lang)[3]}`;
function downloadActive(){
  const s = active(), name = fileNameOf(s);
  if (s.lang === "plain") return save(name, s.content);
  save(name.replace(/\.\w+$/, ".zip"), zip([{ name, content: s.content }]));
}
const downloadAll = () => {
  closeMenu();
  const seen = new Set();
  const entries = recent().filter(s => s.content.trim()).map(s => { let n = fileNameOf(s), k = 2; while (seen.has(n)) n = fileNameOf(s).replace(/(\.\w+)$/, `-${k++}$1`); seen.add(n); return { name: n, content: s.content }; });
  save(`草稿-${stamp(Date.now())}.zip`, zip(entries));
};
async function saveNative(){
  const s = active();
  try {
    const r = await native("save", { name: fileNameOf(s), text: s.content });
    if (r && r.path) toast(`已存储到 ${r.path}`);
  } catch (e) { toast("存储失败：" + e.message); }
}
if (__APP__) {
  $("download").onclick = saveNative;
  $("download").lastChild.textContent = "存储";
  $("download").title = "存储为文件（Cmd + S）";
  $("download").classList.remove("hidden");
} else {
$("download").onclick = downloadActive;
$("downloadAll").onclick = downloadAll;
(async () => {
  try { downloads = await window.claude?.use?.("downloads") ?? null; } catch { downloads = null; }
  $("download").classList.toggle("hidden", !downloads);
  $("downloadAll").classList.toggle("hidden", !downloads);
})();
}

// ---------- problems (from the TypeScript worker's markers) ----------
let lastDiags = [];
function updateProblems(){
  if (!isTS()) { lastDiags = []; renderProbs(); return; }
  lastDiags = monaco.editor.getModelMarkers({ resource: model.uri })
    .filter(m => m.severity >= monaco.MarkerSeverity.Warning && !(m.tags || []).includes(monaco.MarkerTag.Unnecessary))
    .sort((a,b) => a.startLineNumber - b.startLineNumber || a.startColumn - b.startColumn)
    .map(m => ({ line:m.startLineNumber, col:m.startColumn, msg:m.message, code:m.code && (m.code.value ?? m.code),
                 cat: m.severity === monaco.MarkerSeverity.Error ? "error" : "warn" }));
  renderProbs();
  const n = lastDiags.length;
  setTc(n ? "bad" : "ok", n ? `${n} 个问题` : "无类型错误");
  $("nProbs").textContent = n || "";
}
function setTc(cls, text){ const t = $("tc"); t.className = "tc " + cls + (isTS() ? "" : " hidden"); t.textContent = text; }
monaco.editor.onDidChangeMarkers(uris => { if (uris.some(u => u.toString() === model.uri.toString())) updateProblems(); });
function renderProbs(){
  const v = $("v-probs");
  if (!lastDiags.length) { v.innerHTML = `<div class="empty">没有类型错误。</div>`; return; }
  v.innerHTML = lastDiags.map((d,i) =>
    `<div class="p ${d.cat}" data-i="${i}"><span class="loc">${d.line}:${d.col}</span><span class="msg">${esc(d.msg)}</span><span class="ts">${d.code ? "TS" + d.code : ""}</span></div>`
  ).join("");
}
$("v-probs").addEventListener("click", e => {
  const p = e.target.closest(".p"); if (!p) return;
  const d = lastDiags[+p.dataset.i];
  editor.setPosition({ lineNumber: d.line, column: d.col });
  editor.revealPositionInCenterIfOutsideViewport({ lineNumber: d.line, column: d.col });
  editor.focus();
});
$("tc").onclick = () => show("probs");

// ---------- side tabs ----------
let curView = "cons";
function show(v){
  curView = v;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.dataset.v === v));
  for (const k of ["cons","probs","js"]) $("v-"+k).classList.toggle("hidden", k !== v);
  if (v === "js") renderJs();
}
document.querySelectorAll(".tab").forEach(t => t.onclick = () => show(t.dataset.v));

// ---------- compile ----------
async function compileJs(){
  if (!isTS()) return model.getValue();
  const getWorker = await ts.getTypeScriptWorker();
  const w = await getWorker(model.uri);
  const out = await w.getEmitOutput(model.uri.toString());
  const f = out.outputFiles.find(f => /\.(m?js|jsx)$/.test(f.name)) || out.outputFiles[0];
  return (f?.text || "").replace(/\n?export \{\};\s*$/, "\n");
}
let jsT;
const scheduleJs = () => { clearTimeout(jsT); jsT = setTimeout(renderJs, 400); };
async function renderJs(){
  try {
    const js = await compileJs();
    $("jsOut").innerHTML = await monaco.editor.colorize(js, lang() === "tsx" ? "javascript" : "javascript", { tabSize: 4 });
    $("jsOut").dataset.text = js;
  } catch (e) { $("jsOut").textContent = "编译失败：" + e.message; }
}

// ---------- copy / toast ----------
function toast(msg){
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 1500);
}
async function copyText(text, label){
  if (!text) return toast("没有内容可复制");
  if (bridge) { try { await native("copy", { text }); toast(`已复制${label}，${text.length} 字符`); return; } catch {} }
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch {}
    ta.remove();
    if (!ok) return toast("复制被浏览器拒绝了，请手动全选后复制");
  }
  toast(`已复制${label}，${text.length} 字符`);
}
const copyAll = () => copyText(model.getValue(), "代码");
$("copy").onclick = copyAll;
$("copySide").onclick = async () => {
  if (curView === "js") return copyText(await compileJs(), " JS");
  if (curView === "probs") return copyText(lastDiags.map(d => `L${d.line}:${d.col} TS${d.code}: ${d.msg}`).join("\n"), "问题列表");
  copyText([...$("v-cons").querySelectorAll(".l")].map(l => l.textContent).join("\n"), "控制台输出");
};

// ---------- menu ----------
const menu = $("menu"), more = $("more");
document.body.appendChild(menu);
function closeMenu(){ menu.classList.add("hidden"); more.setAttribute("aria-expanded","false"); }
more.onclick = e => { e.stopPropagation(); const open = menu.classList.toggle("hidden") === false; more.setAttribute("aria-expanded", open); if (open) fitAll(); };
document.addEventListener("mousedown", e => { if (!menu.contains(e.target) && !more.contains(e.target)) closeMenu(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });

$("indent").onchange = () => { store.set("ed.indent", $("indent").value); for (const m of models.values()) if (!m.isDisposed()) m.updateOptions(indentOpts()); };
$("strict").onchange = () => { store.set("ed.strict", $("strict").checked ? "1" : "0"); applyTsOptions(); };
$("target").onchange = () => { store.set("ed.target", $("target").value); applyTsOptions(); if (curView === "js") scheduleJs(); };
$("minimap").onchange = () => { store.set("ed.minimap", $("minimap").checked ? "1" : "0"); editor.updateOptions({ minimap: { enabled: $("minimap").checked } }); };
$("wrap").onchange = () => { store.set("ed.wrap", $("wrap").checked ? "1" : "0"); editor.updateOptions({ wordWrap: $("wrap").checked ? "on" : "off" }); };
$("format").onclick = () => { closeMenu(); editor.focus(); editor.getAction("editor.action.formatDocument")?.run(); };
$("palette").onclick = () => { closeMenu(); editor.focus(); editor.trigger("menu", "editor.action.quickCommand"); };
$("clear").onclick = () => {
  const b = $("clear");
  if (b.dataset.armed) {
    editor.executeEdits("clear", [{ range: model.getFullModelRange(), text: "" }]);
    editor.pushUndoStop();
    delete b.dataset.armed; b.textContent = "清空代码"; closeMenu(); editor.focus();
  } else {
    b.dataset.armed = 1; b.textContent = "再点一次以清空";
    setTimeout(() => { delete b.dataset.armed; b.textContent = "清空代码"; }, 2500);
  }
};
$("clearCons").onclick = () => { $("v-cons").innerHTML = ""; closeMenu(); show("cons"); };

// size each select to its current label
const measureCtx = document.createElement("canvas").getContext("2d");
function fitSelect(sel){
  const cs = getComputedStyle(sel);
  measureCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const w = measureCtx.measureText(sel.options[sel.selectedIndex]?.text || "").width;
  sel.style.width = Math.ceil(w + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 2) + "px";
}
const fitAll = () => document.querySelectorAll("select").forEach(fitSelect);
document.fonts?.ready.then(fitAll);
document.querySelectorAll("select").forEach(s => s.addEventListener("change", () => fitSelect(s)));

// ---------- run in worker ----------
const NODE_BUILTINS = new Set("assert buffer child_process cluster crypto dgram dns events fs http http2 https module net os path perf_hooks process querystring readline repl stream string_decoder timers tls tty url util v8 vm worker_threads zlib fs/promises timers/promises stream/promises readline/promises".split(" "));
function rewriteImports(js){
  const nodeMods = [];
  const fix = spec => {
    if (/^(\.|\/|https?:|blob:|data:)/.test(spec)) return null;
    const bare = spec.replace(/^node:/, "");
    if (spec.startsWith("node:") || NODE_BUILTINS.has(bare)) { nodeMods.push(bare); return spec; }
    return `https://cdn.jsdelivr.net/npm/${spec}/+esm`;
  };
  const sub = (m, pre, q, spec, post) => { const f = fix(spec); return f ? `${pre}${q}${f}${q}${post}` : m; };
  js = js.replace(/(\bfrom\s*)(["'])([^"']+)\2()/g, sub)
         .replace(/(^|\n)(\s*import\s*)(["'])([^"']+)\3/g, (m, nl, pre, q, spec) => nl + sub(m.slice(nl.length), pre, q, spec, ""))
         .replace(/(\bimport\s*\(\s*)(["'])([^"']+)\2(\s*\))/g, sub);
  return { js, nodeMods };
}
let worker, runT0, tick;
function line(cls, text){
  const v = $("v-cons");
  v.querySelector(".empty")?.remove();
  const d = document.createElement("div");
  d.className = "l " + cls; d.textContent = text;
  v.appendChild(d);
  v.scrollTop = v.scrollHeight;
}
function stopWorker(msg){
  if (worker) { worker.terminate(); worker = null; }
  clearInterval(tick);
  $("run").classList.remove("hidden"); $("stop").classList.add("hidden"); $("stopTxt").textContent = "停止";
  if (msg) line("sys", msg);
}
const R = s => String(s).replace(/blob:[^\s)]+/g, "main.js");
async function run(){
  if (isNativeLang()) return runAny();
  if (!canRun()) return;
  stopWorker();
  show("cons");
  $("v-cons").innerHTML = "";
  let js;
  try { js = await compileJs(); } catch (e) { return line("error", "编译失败：" + e.message); }
  const { js: out, nodeMods } = rewriteImports(js);
  if (nodeMods.length) {
    return line("error", `Node 内置模块 ${[...new Set(nodeMods)].map(m => `'${m}'`).join("、")} 在浏览器里不可用。这里只能运行不依赖 Node API 的代码。`);
  }
  const errs = lastDiags.filter(d => d.cat === "error").length;
  if (isTS() && errs) line("sys", `有 ${errs} 个类型问题，照常运行。`);
  const src = PRELUDE + "\n" + out + "\n;globalThis.__done();\n";
  const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
  try { worker = new Worker(url, { type: "module" }); }
  catch (e) { return line("error", "无法创建运行环境：" + e.message); }
  runT0 = performance.now();
  $("run").classList.add("hidden"); $("stop").classList.remove("hidden");
  let finished = false;
  tick = setInterval(() => { $("stopTxt").textContent = `停止  ${((performance.now()-runT0)/1000).toFixed(1)}s`; }, 100);
  worker.onmessage = ({ data: [t, d] }) => {
    if (t === "log") line("", d);
    else if (t === "warn") line("warn", d);
    else if (t === "error") { line("error", d); if (!finished) { finished = true; setTimeout(() => worker && stopWorker(`出错退出，${Math.round(performance.now()-runT0)} ms`), 50); } }
    else if (t === "out") line("", d.replace(/\n$/, ""));
    else if (t === "errout") line("error", d.replace(/\n$/, ""));
    else if (t === "exit") { finished = true; stopWorker(`process.exit(${d})`); }
    else if (t === "done") { finished = true; }
    else if (t === "idle") stopWorker(`运行结束，${Math.round(performance.now()-runT0)} ms`);
  };
  worker.onerror = e => {
    e.preventDefault?.();
    line("error", e.message ? R(e.message) : "运行环境加载失败（可能是 import 的包不存在，或语法错误）");
    stopWorker();
  };
  URL.revokeObjectURL(url);
}
// ---------- native run: python3 / clang++ on this Mac ----------
let nativeId = null, nbuf = { out: "", err: "" }, nerr = "";
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
function flushStream(stream, all){
  let b = nbuf[stream];
  const parts = b.split("\n");
  nbuf[stream] = all ? "" : parts.pop();
  if (all && parts[parts.length - 1] === "") parts.pop();
  for (const p of parts) line(stream === "err" ? "error" : "", p.replace(ANSI, ""));
}
window.__ee = {
  out(id, stream, text){
    if (id !== nativeId) return;
    if (stream === "err") nerr += text;
    nbuf[stream] += text; flushStream(stream, false);
  },
  exit(id, code, ms, how){
    if (id !== nativeId) return;
    flushStream("out", true); flushStream("err", true);
    nativeId = null;
    clearInterval(tick);
    $("run").classList.remove("hidden"); $("stop").classList.add("hidden"); $("stopTxt").textContent = "停止";
    const t = ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
    const SIG = { 4: "非法指令", 6: "abort", 8: "浮点异常（比如整数除以 0）", 9: "被强制结束", 10: "总线错误", 11: "段错误（访问了非法内存）", 15: "被终止" };
    line("sys", how === "stopped" ? `已停止，${t}` : how === "compile" ? `编译失败，${t}`
      : code === 0 ? `运行结束，${t}` : code < 0 ? `程序崩溃：${SIG[-code] || "信号 " + -code}，${t}` : `退出码 ${code}，${t}`);
    markRunErrors(nerr);
  },
  // menu items in the Mac app
  run: () => run(), newScratch: () => newScratch(), save: () => saveNative(),
  stop: () => { if (nativeId) stopNative(); else if (worker) stopWorker(`已停止，${((performance.now()-runT0)/1000).toFixed(1)} s`); },
  undo: () => editor.hasTextFocus() ? editor.trigger("menu", "undo") : document.execCommand("undo"),
  redo: () => editor.hasTextFocus() ? editor.trigger("menu", "redo") : document.execCommand("redo"),
  selectAll: () => editor.hasTextFocus() ? editor.trigger("menu", "editor.action.selectAll") : document.execCommand("selectAll"),
  fullscreen: on => document.body.classList.toggle("fullscreen", !!on),
};
function markRunErrors(text){
  const markers = [];
  if (lang() === "cpp") {
    for (const m of text.matchAll(/main\.cpp:(\d+):(\d+): (fatal error|error|warning): (.*)/g))
      markers.push({ startLineNumber: +m[1], startColumn: +m[2], endLineNumber: +m[1], endColumn: +m[2] + 1,
        message: m[4], severity: m[3] === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error });
  } else if (lang() === "python") {
    const frames = [...text.matchAll(/File "main\.py", line (\d+)/g)];
    const last = text.trim().split("\n").pop() || "";
    if (frames.length) { const ln = +frames[frames.length - 1][1];
      markers.push({ startLineNumber: ln, startColumn: 1, endLineNumber: ln, endColumn: model.getLineMaxColumn(Math.min(ln, model.getLineCount())), message: last, severity: monaco.MarkerSeverity.Error }); }
  }
  monaco.editor.setModelMarkers(model, "run", markers);
  if (markers.length) runMarked.add(model);
}
async function runNativeLang(){
  if (nativeId) await stopNative();
  stopWorker();
  show("cons");
  $("v-cons").innerHTML = "";
  monaco.editor.setModelMarkers(model, "run", []);
  nativeId = newId(); nbuf = { out: "", err: "" }; nerr = "";
  runT0 = performance.now();
  $("run").classList.add("hidden"); $("stop").classList.remove("hidden");
  tick = setInterval(() => { $("stopTxt").textContent = `停止  ${((performance.now()-runT0)/1000).toFixed(1)}s`; }, 100);
  if (lang() === "cpp") line("sys", "编译中…");
  try { await native("run", { id: nativeId, lang: lang(), code: model.getValue() }); }
  catch (e) { line("error", "无法运行：" + e.message); window.__ee.exit(nativeId, -1, 0, "error"); }
}
const stopNative = () => nativeId ? native("stop", { id: nativeId }).catch(() => {}) : Promise.resolve();
const runAny = () => isNativeLang() ? (canRun() ? runNativeLang() : toast($("run").title)) : run();
$("run").onclick = runAny;
$("stop").onclick = () => nativeId ? stopNative() : stopWorker(`已停止，${((performance.now()-runT0)/1000).toFixed(1)} s`);

// keys: inside the editor Monaco owns the keyboard, so register there too
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runAny);
editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyN, newScratch);
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyC, copyAll);
document.addEventListener("keydown", e => {
  if (editor.hasTextFocus()) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === "Enter") { e.preventDefault(); runAny(); }
  if (e.altKey && e.code === "KeyN") { e.preventDefault(); newScratch(); }
});

$("consEmpty").textContent = `按 ${KEY} + Enter 运行，结果会显示在这里。`;
if (__APP__) {
  const header = document.querySelector("header");
  const interactive = t => t.closest("button, select, input, label, a, .tc, .menu");
  header.addEventListener("mousedown", e => { if (e.button === 0 && !interactive(e.target) && e.detail === 1) native("drag").catch(() => {}); });
  header.addEventListener("dblclick", e => { if (!interactive(e.target)) native("zoom").catch(() => {}); });
  $("reveal").classList.remove("hidden");
  $("reveal").onclick = () => { closeMenu(); native("reveal").catch(() => {}); };
  $("downloadAll").remove();
  document.querySelector(".files-foot").textContent = "自动保存在本机，保留最近 50 份";
  native("env").then(e => {
    env = { ...env, ...e };
    $("reveal").textContent = `在 Finder 中打开工作目录`;
    $("reveal").title = env.workdir;
    refreshChrome();
  }).catch(() => {});
}
$("copy").title = `复制全部（${KEY} + Shift + C）`;
refreshChrome();
if (isTS()) setTc("busy", "正在检查");
// markers only fire on change; settle the status once the worker has had a first pass
for (const ms of [1500, 4000]) setTimeout(updateProblems, ms);
fitAll();
renderStat();
editor.focus();
document.body.classList.add("ready");
