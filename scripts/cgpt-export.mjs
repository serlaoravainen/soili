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

// Redact ilman että rikotaan CSS-muuttujien avaimia tai JS/TS property-keytä vasemmalta puolelta.
// Strategia: käydään läpi *rivi kerrallaan* ja jos havaitaan CSS-var ( --foo-bar: ... ),
// redaktoidaan vain kaksoispisteen oikea puoli. Muuten redaktoidaan koko rivi.
const redactLine = (line, patterns) => {
  // CSS var -avaimet vasemmalla puolella → redaktoi vain RHS
  const cssVar = line.match(/^\s*(--[a-z0-9_-]+)\s*:/i);
  if (cssVar) {
    const idx = line.indexOf(":");
    const lhs = line.slice(0, idx + 1);
    const rhs = line.slice(idx + 1);
    return lhs + applyRedact(rhs, patterns);
  }
  return applyRedact(line, patterns);
};

const applyRedact = (text, patterns) => {
  let out = text;
  for (const p of (patterns || [])) {
    const re = makeRegex(p);
    if (!re) continue;
    out = out.replace(re, "[REDACTED]");
  }
  return out;
};

const redactFn = (text, patterns) => {
  if (!patterns || patterns.length === 0) return text;
  // rivi kerrallaan, ettei sotketa vasenta puolta (avaimia)
  return text.split(/\r?\n/).map((ln) => redactLine(ln, patterns)).join("\n");
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
  files: [],
  index: { byPath: [], byLang: {} }
};

// Git-metatiedot
function getGitSha() {
  try {
    return require("child_process").execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim();
  } catch { return null; }
}
const repoSha = process.env.SRC_SHA || getGitSha();

function getRemoteHttps() {
  // Yritä GHA envistä ensin
  const ghRepo = process.env.GITHUB_REPOSITORY;
  if (ghRepo) return `https://github.com/${ghRepo}`;
  // Fallback paikalliseen remoteen
  try {
    const raw = require("child_process").execSync("git remote get-url origin", { stdio: ["ignore","pipe","ignore"] })
      .toString().trim();
    // normalize
    if (raw.startsWith("git@github.com:")) {
      return "https://github.com/" + raw.replace("git@github.com:", "").replace(/\.git$/, "");
    }
    if (raw.startsWith("https://")) {
      return raw.replace(/\.git$/, "");
    }
  } catch {}
  return null;
}
const remoteHttps = getRemoteHttps();

function makeRawUrl(relPath) {
  // Jos konfigissa annettu rawBase, käytä sitä. Muuten rakenna GitHubin raw-linkki jos mahdollista.
  if (cfg.repoRawBase) {
    return `${cfg.repoRawBase.replace(/\/+$/,"")}/${relPath.replace(/^\/+/,"")}`;
  }
  if (remoteHttps && repoSha) {
    // https://raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>
    const m = remoteHttps.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/);
    if (m) {
      const owner = m[1], repo = m[2];
      return `https://raw.githubusercontent.com/${owner}/${repo}/${repoSha}/${relPath}`;
    }
  }
  return null;
}

// Pienapuri: laske rivit ja chunk-metadata
function splitToChunks(content, step) {
  const chunks = [];
  const totalLen = content.length;
  const totalChunks = Math.ceil(totalLen / step);
  for (let i = 0; i < totalLen; i += step) {
    const idx = Math.floor(i / step);
    const slice = content.slice(i, i + step);
    // rivit chunkissa (startLine, endLine) lasketaan skannaamalla alusta tähän kohtaan tehokkaasti:
    // nopea arvio: lasketaan rivit globaaliin taulukkoon vain kerran (kts. buildChunkLineIndex)
    chunks.push({ i: idx, text: slice, byteOffset: i, totalChunks, hasMore: idx < totalChunks - 1 });
  }
  return chunks;
}

function buildLineIndex(text) {
  // Palauttaa taulukon rivien aloitusoffseteista (UTF-16 index)
  const idx = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) idx.push(i + 1); // '\n'
  }
  return idx;
}

function annotateChunkLines(allText, lineIndex, chunk) {
  // Etsi chunkin alku- ja loppurivi byteOffsetin perusteella
  // (UTF-16 index, mutta riittää yhtenäiseksi indeksoinniksi UI-käyttöön)
  const startOff = chunk.byteOffset;
  const endOff = chunk.byteOffset + chunk.text.length;
  // binäärihaku rivitaulukkoon
  const findLine = (off) => {
    let lo = 0, hi = lineIndex.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lineIndex[mid] <= off) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    return ans + 1; // rivit 1-indeksoituna
  };
  chunk.startLine = findLine(startOff);
  chunk.endLine = findLine(endOff);
  return chunk;
}


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

  const step = cfg.chunkBytes || 64000;
  const rawChunks = (size <= (cfg.maxPreviewBytes || 250000))
    ? [{ i: 0, text: content, byteOffset: 0, totalChunks: 1, hasMore: false }]
    : splitToChunks(content, step);

  // Redaktoi chunkit riviturvallisesti + lisää rivinumerot
  const lineIndex = buildLineIndex(content);
  const chunks = rawChunks.map((c) => {
    const redacted = redactFn(c.text, cfg.redact);
    const annotated = annotateChunkLines(content, lineIndex, { ...c, text: redacted });
    if (annotated.hasMore) {
      annotated.nextOffset = annotated.byteOffset + annotated.text.length;
    }
    return annotated;
  });

  // Git modifiedAt (commit time) fallback: fs.stat
  let modifiedAt = null;
  try {
    const cmd = `git log -1 --format=%cI -- "${rel}"`;
    modifiedAt = require("child_process").execSync(cmd, { stdio: ["ignore","pipe","ignore"] }).toString().trim();
  } catch {
    try { modifiedAt = fs.statSync(abs).mtime.toISOString(); } catch {}
  }

  const fileEntry = {
    path: rel.replace(/\\/g, "/"),
    size,
    sha256: sha,
    lang,
    lines: lineIndex.length,          // kokonaisrivimäärä
    modifiedAt,
    commitSha: repoSha || null,
    rawUrl: makeRawUrl(rel.replace(/\\/g, "/")),
    chunks
  };
  manifest.files.push(fileEntry);

  manifest.counts.files++;
  manifest.counts.bytes += size;
  manifest.index.byPath.push(fileEntry.path);
  (manifest.index.byLang[fileEntry.lang] ||= []).push(fileEntry.path);
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
  const dirFull = require('path').posix.dirname(f.path);     // oikea hakemisto
  const dir = dirFull.split('/').slice(0, 3).join('/') || '.'; // rajaa 3 tasoon
  byDir[dir] = (byDir[dir] || 0) + 1;
}
console.log("Collected by dir:", byDir);
