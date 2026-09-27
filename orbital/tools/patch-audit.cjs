// one-shot patcher: adds --show mode to level-audit.ts
const fs = require('fs');
const p = 'tools/level-audit.ts';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('showAces')) { console.log('already patched'); process.exit(0); }
const anchor = "const regionArg = process.argv[2] ? Number(process.argv[2]) : 0;";
const addition = anchor + `

function showAces(def: LevelDef): void {
  const w0 = createWorld(def, 7, 1);
  startStroke(w0, true);
  const base = Math.atan2(w0.holeY - def.tee.y, w0.holeX - def.tee.x);
  const found: string[] = [];
  for (let a = -40; a <= 40; a += 2) {
    const ray = base + (a * Math.PI) / 180;
    for (const pow of [260, 340, 420, 500, 600, 700, 800, 900]) {
      const w = createWorld(def, 7, 1);
      startStroke(w, true);
      const res = predict(w, Math.cos(ray) * pow, Math.sin(ray) * pow, HORIZON, 10);
      if (res.end === 'sunk') found.push(a > 0 ? '+' + a + 'deg @ ' + pow : a + 'deg @ ' + pow);
    }
  }
  console.log(def.id + ' ' + def.name + ': ' + found.length + ' direct aces');
  for (const f of found.slice(0, 14)) console.log('  ' + f);
}`;
s = s.replace(anchor, addition);
s = s.replace(
  "for (const def of LEVELS) {\n  if (regionArg && def.region !== regionArg) continue;",
  "for (const def of LEVELS) {\n  if (showId && def.id !== showId) continue;\n  if (showId) { showAces(def); continue; }\n  if (regionArg && def.region !== regionArg) continue;",
);
s = s.replace("const regionArg = process.argv[2] ? Number(process.argv[2]) : 0;\n\nfunction showAces", "const regionArg = process.argv[2] ? Number(process.argv[2]) : 0;\nconst showId = process.argv[3];\n\nfunction showAces");
fs.writeFileSync(p, s);
console.log('PATCHED');
