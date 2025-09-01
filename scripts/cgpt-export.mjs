import fs from "fs";
import path from "path";
import crypto from "crypto";
import fg from "fast-glob";

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

// Build a JS RegExp from a pattern that may start with inline flags like (?i)(?m)
const buildRegex = (raw) => {
  let pattern = raw;
  let flags = "g"; // always global replace

  // support a leading group of inline flags like (?im)
  const m = pattern.match(/^\(\?[im]+\)/);
  if (m) {
    if (m[0].includes("i")) flags += "i";
    if (m[0].includes("m")) flags += "m";
    pattern = pattern.slice(m[0].length);
  }

  return new RegExp(pattern, flags);
};

const redactFn = (text, patterns) => {
  let out = text;
  for (const p of patterns || []) {
    const re = buildRegex(p);
    out = out.replace(re, "[REDACTED]");
  }
  return out;
};


const isProbablyBinary = (buf) => {
  // yksinkertainen tarkistus: sisältääkö NULL-byttejä
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
  try { buf = fs.readFileSync(abs); } catch { manifest.counts.skipped++; continue; }

  const size = buf.length;
  if (cfg.maxFileBytes && size > cfg.maxFileBytes) { manifest.counts.skipped++; continue; }
  if (isProbablyBinary(buf)) { manifest.counts.skipped++; continue; }

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

fs.mkdirSync("chatgpt-export", { recursive: true });
const outPath = "chatgpt-export/code-index.json";
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), "utf8");
console.log(`Exported ${manifest.counts.files} files (${manifest.counts.bytes} bytes), skipped ${manifest.counts.skipped} → ${outPath}`);

// NEW: dumpataan jokainen tiedosto erikseen, jotta se on luettavissa raw.githubusercontent.comin kautta
for (const f of manifest.files) {
  const fullText = (f.chunks || []).map(c => c.text || "").join("");
  const destPath = path.join("chatgpt-export", "files", f.path);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, fullText, "utf8");
}
console.log(`Also wrote per-file dumps under chatgpt-export/files/**`);
