import fs from "fs";
import path from "path";

// odottaa että sinulla on "files/<polku>" raakasisällöt saatavilla (tai haet ne valmiiksi)
const HOT = JSON.parse(fs.readFileSync("Soili-HOTSET.json","utf8"));
const SUP = JSON.parse(fs.readFileSync("Soili-SUPPORT.json","utf8"));

function readOrEmpty(p) {
  const fp = path.join("files", p); // sama rakenne kuin raw-exportissa
  try { return fs.readFileSync(fp, "utf8"); } catch { return ""; }
}

// yksinkertainen katkelman rajaus: ekat ~300–500 riviä tai ekat merkittävät lohkot
function snippet(txt, maxLines = 400) {
  const lines = txt.split(/\r?\n/);
  if (lines.length <= maxLines) return txt;
  return lines.slice(0, maxLines).join("\n") + "\n// ... [truncated]";
}

function block(file) {
  const body = snippet(readOrEmpty(file.path));
  const why =
    /schema\.sql$/.test(file.path) ? "Tietokannan lähde: taulut, suhteet, indeksit, RLS-perusta." :
    /useSettingsStore\.ts$/.test(file.path) ? "Asetusten lähde: togglet ja niiden vaikutukset." :
    /SettingsDialog\.tsx$/.test(file.path) ? "UI-lähde asetusten ohjaukselle." :
    /ScheduleTable\.tsx$/.test(file.path) ? "Vuoronäkymän logiikka." :
    /functions\/mailer/.test(file.path) ? "Ilmoitusten lähetin (queue/Resend)." :
    /functions\/sendemail/.test(file.path) ? "Sähköpostin lähetysrutiini." :
    "Keskeinen Soili-komponentti.";
  return `\n\n## ${file.path}\n**Miksi tärkeä:** ${why}\n\n\`\`\`${(file.language || 'txt')}\n${body}\n\`\`\`\n`;
}

function build(name, list) {
  let out = `# ${name}\n\n`;
  out += `> Tämä on kuratoitu tietoisku. Vastaukset tulee ankkuroida näihin tiedostoihin. Jos tieto puuttuu, sano suoraan.\n`;
  for (const f of list) out += block(f);
  return out;
}

fs.writeFileSync("Soili-HOTSET.md", build("Soili HOTSET", HOT));
fs.writeFileSync("Soili-SUPPORT.md", build("Soili SUPPORT", SUP));
console.log("Wrote Soili-HOTSET.md and Soili-SUPPORT.md");
