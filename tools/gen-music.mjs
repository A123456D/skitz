/**
 * ElevenLabs MUSIC generator — build-time asset pipeline.
 * The /v1/music endpoint needs a paid plan (402), but /v1/sound-generation
 * works on the current key, so biome themes are generated there as ~20s
 * loopable tracks. Output: public/audio/music/<biome>.mp3 — the runtime
 * loops them; the procedural synth (engine/music.ts) stays as fallback.
 * Key stays in tools/audio.key (gitignored). Run: node tools/gen-music.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const keyPath = join(root, 'tools', 'audio.key');
const key = (process.env.ELEVEN_API_KEY ?? (existsSync(keyPath) ? readFileSync(keyPath, 'utf8').trim() : ''));
if (!key) {
  console.error('no API key: set ELEVEN_API_KEY or create tools/audio.key');
  process.exit(1);
}
const outDir = join(root, 'public', 'audio', 'music');
mkdirSync(outDir, { recursive: true });
const force = process.argv.includes('--force');

const TRACKS = [
  { name: 'iron', text: 'Driving industrial metal synth battle loop, pounding drums, aggressive distorted bass riff, dark arena video game music, energetic, relentless groove, seamless loop', dur: 20 },
  { name: 'frost', text: 'Cold icy synthwave loop, glacial pads, pulsing arpeggio, deep sub bass, frozen factory video game music, hypnotic, seamless loop', dur: 20 },
  { name: 'rust', text: 'Gritty desert rock loop, twangy junkyard guitar riff, scrap metal percussion, dusty western video game action music, mid tempo, seamless loop', dur: 20 },
  { name: 'ember', text: 'Intense volcanic metal electronic loop, searing lead synth, magma deep bass drops, fiery video game boss battle music, aggressive, seamless loop', dur: 20 },
];

for (const t of TRACKS) {
  const out = join(outDir, `${t.name}.mp3`);
  if (existsSync(out) && !force) {
    console.log('skip (exists):', t.name);
    continue;
  }
  process.stdout.write(`generating ${t.name}... `);
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: t.text, duration_seconds: t.dur }),
  });
  if (!res.ok) {
    console.log('FAILED', res.status, (await res.text()).slice(0, 140));
    continue;
  }
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log('ok');
}
console.log('done ->', outDir);
