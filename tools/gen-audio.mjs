/**
 * ElevenLabs SFX generator — build-time asset pipeline (NOT runtime).
 * Calls the sound-generation API for the game's signature sounds and writes
 * mp3s to public/audio/sfx/. The API key stays in tools/audio.key (gitignored)
 * so it never ships with the game. Run: node tools/gen-audio.mjs
 * Existing files are skipped unless --force is passed (saves credits).
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
const outDir = join(root, 'public', 'audio', 'sfx');
mkdirSync(outDir, { recursive: true });
const force = process.argv.includes('--force');

const SFX = [
  { name: 'bonk_heavy', text: 'Extremely heavy metal ball slamming into steel, deep resonant metallic bonk impact, industrial echo, single hit', dur: 2 },
  { name: 'slam_ground', text: 'Massive ground slam shockwave, deep sub-bass thud with debris rumble, concrete cracking', dur: 2.5 },
  { name: 'boss_roar', text: 'Huge monster roar, deep guttural arena boss bellow with reverb, menacing', dur: 3 },
  { name: 'crate_break', text: 'Wooden crate smashing apart, splintering wood cracks and debris scatter, single burst', dur: 2 },
  { name: 'chest_open', text: 'Treasure chest bursting open with gold coin shower, metallic jingle and wooden creak, bright', dur: 2.5 },
  { name: 'bumper_fling', text: 'Pinball machine bumper thump, springy rubber boing kick, arcade pop', dur: 1.5 },
  { name: 'victory', text: 'Short triumphant arcade victory fanfare, bright retro synth brass, four rising notes, confident ending', dur: 3 },
  { name: 'steam_vent', text: 'Short steam valve release hiss, airy pneumatic puff, industrial machinery', dur: 2 },
  { name: 'levelup_chime', text: 'Bright arcade level up chime, rising three note fanfare, sparkling retro synth, celebratory video game sound', dur: 2 },
  { name: 'death_wreck', text: 'Massive metal wreck crashing down, deep crushing impact with scattering debris, defeat thunk, dramatic', dur: 3 },
  { name: 'descend_drop', text: 'Deep ominous descending tone, elevator dropping into abyss, dark riser reversing downward, eerie video game transition', dur: 3 },
];

for (const sfx of SFX) {
  const out = join(outDir, `${sfx.name}.mp3`);
  if (existsSync(out) && !force) {
    console.log('skip (exists):', sfx.name);
    continue;
  }
  process.stdout.write(`generating ${sfx.name}... `);
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: sfx.text, duration_seconds: sfx.dur }),
  });
  if (!res.ok) {
    console.log('FAILED', res.status, (await res.text()).slice(0, 140));
    continue;
  }
  writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log('ok');
}
console.log('done ->', outDir);
