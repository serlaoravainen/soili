import fs from "fs";
const IN = process.argv[2] || "soili-index.json";
const OUT_HOT = process.argv[3] || "Soili-HOTSET.json";
const OUT_SUPPORT = process.argv[4] || "Soili-SUPPORT.json";

const idx = JSON.parse(fs.readFileSync(IN, "utf8")).files;

const score = f => {
  let s = 0;
  if (/schema\.sql$/.test(f.path)) s += 10;
  if (/useSettingsStore\.ts$/.test(f.path)) s += 9;
  if (/SettingsDialog\.tsx$/.test(f.path)) s += 9;
  if (/ScheduleTable\.tsx$/.test(f.path)) s += 8;
  if (/supabase\/functions\//.test(f.path)) s += 7;
  if (/(mailer|sendemail|absence|publish|notification)/i.test(f.path)) s += 3;
  // suositaan kompakteja tiedostoja
  s += 2 - Math.log10(f.size + 1);
  return s;
};

const sorted = [...idx].sort((a,b)=>score(b)-score(a));
const hot = sorted.slice(0, 25);
const support = sorted.slice(25, 80);

fs.writeFileSync(OUT_HOT, JSON.stringify(hot, null, 2));
fs.writeFileSync(OUT_SUPPORT, JSON.stringify(support, null, 2));
console.log(`HOTSET: ${hot.length} | SUPPORT: ${support.length}`);
