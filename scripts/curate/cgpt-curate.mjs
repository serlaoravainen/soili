import fs from "fs";
const RAW = process.argv[2] || "code-index.json";
const OUT = process.argv[3] || "soili-index.json";

// 1) lue manifesti
const idx = JSON.parse(fs.readFileSync(RAW, "utf8"));

// 2) sallitut polut Soiliin (rajattu ja relevantti)
const ALLOW = [
  /^supabase\/schema\.sql$/,
  /^supabase\/functions\//,
  /^src\/store\//,
  /^src\/app\/components\//,
  /^src\/lib\//,
  /^src\/types\//
];

// 3) filtteröi tekstitiedostoihin ja kokorajaan
const MAX = 250_000; // ~250 kB / tiedosto knowledgea varten
const textLike = f => !f.binary && f.size > 0 && f.size <= MAX;
const allowed = f => ALLOW.some(rx => rx.test(f.path));

const files = idx.files.filter(f => textLike(f) && allowed(f));

// 4) kirjoita suppea indeksi
fs.writeFileSync(OUT, JSON.stringify({ files }, null, 2));
console.log(`Wrote ${OUT} with ${files.length} files`);
