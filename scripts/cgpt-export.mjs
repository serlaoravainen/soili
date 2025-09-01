import fs from "fs";
import path from "path";
import crypto from "crypto";
import fg from "fast-glob";
import prettier from "prettier";

const root = process.cwd();
const cfgPath = path.join(root, "cgpt.config.json");
if (!fs.existsSync(cfgPath)) {
  console.error("Missing cgpt.config.json at project root.");
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

const detectLang = (rel) => {
  const ext = rel.split(".").pop()?.toLowerCase();
  const map = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    mjs: "javascript", cjs: "javascript",
    css: "css", scss: "scss", sass: "sass", less: "less",
    html: "html", md: "markdown", json: "json", yml: "yaml", yaml: "yaml",
    go: "go", rs: "rust", py: "python", java: "java", cs: "csharp",
    php: "php", rb: "ruby", kt: "kotlin", swift: "swift", cpp: "cpp", c: "c"
  };
  return map[ext] || ext || "text";
};

// Build a JS RegExp from a pattern that may start with PCRE-style inline flags, e.g. (?i)(?m)...
function makeRegex(pattern) {
  let src = String(pattern);
  let flags = "g"; // we always want global
  // Collect inline flags like (?i), (?m), (?im)...
  // Support one or multiple flag groups at the very start.
  const inline = src.match(/^(\(\?[a-zA-Z]+\))+?/);
  if (inline) {
    // Extract flags from all groups at the start
    const all = inline[0];
    const flagSets = [...all.matchAll(/\(\?([a-zA-Z]+)\)/g)].map(m => m[1]);
    const flat = [...new Set(flagSets.join("").split(""))];
    if (flat.includes("i")) flags += "i";
    if (flat.includes("m")) flags += "m";
    // strip the inline flag groups from the source
    src = src.slice(all.length);
  }
  try {
    return new RegExp(src, flags);
  } catch (e) {
    console.warn(`Redact pattern invalid, skipping: ${pattern} → ${e.message}`);
    return null;
  }
}

const redactFn = (text, patterns) => {
  let out = text;
  for (const p of (patterns || [])) {
    const re = makeRegex(p);
    if (!re) continue;
    out = out.replace(re, "[REDACTED]");
  }
  return out;
};

const isProbablyBinary = (buf) => {
  const len = Math.min(buf.length, 1024);
  for (let i = 0; i < len; i++) if (buf[i] === 0) return true;
  return false;
};

const include = cfg.include?.length ? cfg.include : ["src/**/*"];
const exclude = cfg.exclude || [];
const entries = await fg(include, {
  cwd: root,
  dot: false,
  ignore: exclude,
  onlyFiles: true,
  followSymbolicLinks: false
});

const manifest = {
  generatedAt: new Date().toISOString(),
  root: path.basename(root),
  counts: { files: 0, bytes: 0, skipped: 0 },
  config: { ...cfg },
  files: []
};

for (const rel of entries) {
  const abs = path.join(root, rel);
  let buf;
  try {
    buf = fs.readFileSync(abs);
  } catch {
    manifest.counts.skipped++;
    continue;
  }

  const size = buf.length;
  if (cfg.maxFileBytes && size > cfg.maxFileBytes) {
    manifest.counts.skipped++;
    continue;
  }
  if (isProbablyBinary(buf)) {
    manifest.counts.skipped++;
    continue;
  }

  const content = buf.toString("utf8");
  const sha = crypto.createHash("sha256").update(content).digest("hex");
  const lang = detectLang(rel);

  const chunks = [];
  if (size <= (cfg.maxPreviewBytes || 250000)) {
    chunks.push({ i: 0, text: redactFn(content, cfg.redact) });
  } else {
    const step = cfg.chunkBytes || 64000;
    for (let i = 0; i < content.length; i += step) {
      const slice = content.slice(i, i + step);
      chunks.push({ i: Math.floor(i / step), text: redactFn(slice, cfg.redact) });
    }
  }

  manifest.files.push({
    path: rel.replace(/\\/g, "/"),
    size,
    sha256: sha,
    lang,
    chunks
  });

  manifest.counts.files++;
  manifest.counts.bytes += size;
}

// WRITE JSON
fs.mkdirSync("chatgpt-export", { recursive: true });
const outPath = "chatgpt-export/code-index.json";
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), "utf8");
console.log(
  `Exported ${manifest.counts.files} files (${manifest.counts.bytes} bytes), skipped ${manifest.counts.skipped} → ${outPath}`
);

// ---------- format helper for dumps (optional, controlled by cfg.formatDump) ----------
function formatForDump(text, filePath, enabled) {
  if (!enabled) return text;
  const ext = filePath.toLowerCase();
  let parser = null;
  if (ext.endsWith(".tsx") || ext.endsWith(".ts")) parser = "babel-ts";
  else if (ext.endsWith(".jsx") || ext.endsWith(".js")) parser = "babel";
  else if (ext.endsWith(".json")) parser = "json";
  else if (ext.endsWith(".css") || ext.endsWith(".scss") || ext.endsWith(".less")) parser = "css";
  else if (ext.endsWith(".html")) parser = "html";
  else if (ext.endsWith(".md")) parser = "markdown";
  if (!parser) return text;
  try {
    return prettier.format(text, { parser, printWidth: 100 });
  } catch (e) {
    console.warn(`Prettier failed for ${filePath}: ${e.message}`);
    return text;
  }
}

// WRITE PER-FILE DUMPS (formatted if cfg.formatDump === true)
const filesRoot = path.join("chatgpt-export", "files");
for (const f of manifest.files) {
  const fullTextRaw = (f.chunks || []).map((c) => c.text || "").join("");
  let fullText = fullTextRaw;
  // Prettier kaatuu redaktoituihin kenttiin kuten: process.env.[REDACTED]
  // Jos sisältö on redaktoitu, skippaa formatointi.
  const isRedacted = fullTextRaw.includes("[REDACTED]");
  if (cfg.formatDump === true && !isRedacted) {
    try {
      // prettier.format on asynkroninen → odota
      fullText = await prettier.format(fullTextRaw, {
        parser: f.path.endsWith(".tsx") || f.path.endsWith(".ts")
          ? "babel-ts"
          : f.path.endsWith(".jsx") || f.path.endsWith(".js")
          ? "babel"
          : f.path.endsWith(".json")
          ? "json"
          : f.path.endsWith(".css") || f.path.endsWith(".scss") || f.path.endsWith(".less")
          ? "css"
          : f.path.endsWith(".html")
          ? "html"
          : f.path.endsWith(".md")
          ? "markdown"
          : null,
        printWidth: 100,
      });
    } catch (e) {
      console.warn(`Prettier failed for ${f.path}: ${e.message}`);
    }
  }
  const dest = path.join(filesRoot, f.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, fullText, "utf8");
}
console.log(`Also wrote per-file dumps under ${filesRoot}/**`);

// Optional: tiny directory summary
const byDir = {};
for (const f of manifest.files) {
  const dir = f.path.split("/").slice(0, 3).join("/"); // e.g., src/app/components
  byDir[dir] = (byDir[dir] || 0) + 1;
}
console.log("Collected by dir:", byDir);
