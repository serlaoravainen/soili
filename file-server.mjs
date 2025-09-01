import express from "express";
import fetch from "node-fetch";

const EXPORT_URL =
  "https://raw.githubusercontent.com/serlaoravainen/tuukka-chat-exports/main/code-index.json";

let cache = null;

async function loadIndex() {
  if (!cache) {
    const res = await fetch(EXPORT_URL);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    cache = await res.json();
  }
  return cache;
}

function getFileContent(manifest, path) {
  const file = manifest.files.find((f) => f.path === path);
  if (!file) throw new Error(`File not found: ${path}`);
  return file.chunks.map((c) => c.text).join("");
}

const app = express();

// Hae koko tiedosto
app.get("/file", async (req, res) => {
  try {
    const { path, start, end } = req.query;
    if (!path) return res.status(400).send("Missing ?path=");
    const manifest = await loadIndex();
    const text = getFileContent(manifest, path);

    const lines = text.split(/\r?\n/);
    const s = start ? parseInt(start, 10) : 1;
    const e = end ? parseInt(end, 10) : lines.length;
    const slice = lines.slice(s - 1, e);

    res.type("text/plain").send(slice.join("\n"));
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// Tyhjennä cache → pakota haku uudestaan GitHubista
app.get("/reload", (_req, res) => {
  cache = null;
  res.send("Cache cleared");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`File server running → http://localhost:${PORT}`)
);
