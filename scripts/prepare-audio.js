/**
 * Builds the sound effects of the game from the Kenney packs (CC0): `node scripts/prepare-audio.js [folder]`.
 *
 * The packs (Impact Sounds, Interface Sounds, Music Jingles from kenney.nl) are unzipped OUTSIDE the project, by default in
 * C:\Users\alexa\Downloads\kenney-audio\ (one sub-folder per pack). Only the chosen sounds are converted, to AAC (.m4a, the
 * ogg of the packs is not played by iOS), into assets/audio/sfx/. Every sound goes through the same chain:
 *   - the silence at the start is cut (latency),
 *   - a soft low-pass at 5.5 kHz (nothing shrill or clacking),
 *   - the loudness is brought to the same level for all of them (a measured gain, then a peak limiter).
 * The paint "plip" is made in 12 pitches, the notes of a C major pentatonic scale over two octaves, so the game never changes
 * the playback speed live (reliable, and no latency).
 *
 * ffmpeg: the one on the PATH, else the one of the `ffmpeg-static` npm package.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SRC = process.argv[2] ?? path.join(os.homedir(), 'Downloads', 'kenney-audio');
const OUT = path.resolve(__dirname, '../assets/audio/sfx');

function findFfmpeg() {
  const probe = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (probe.status === 0) return 'ffmpeg';
  try {
    return require('ffmpeg-static');
  } catch {
    throw new Error('No ffmpeg: install it, or `npm i -D ffmpeg-static`.');
  }
}
const FFMPEG = findFfmpeg();

/** Level every sound is brought to (mean volume, dB) and the highest peak allowed. */
const TARGET_MEAN_DB = -21;
const PEAK_LIMIT = 0.7;

const CUT_SILENCE = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.005';
const SOFTEN = 'lowpass=f=5500:poles=2';

/** Source file (relative to the pack folders) -> name used by the game, with an optional extra filter. */
const SOUNDS = [
  // name, file, extra filter, what it is used for
  ['impact_soft', 'impact-sounds/Audio/impactWood_light_003.ogg', '', 'wall hit after a short slide'],
  ['impact_hard', 'impact-sounds/Audio/impactWood_heavy_002.ogg', '', 'wall hit after a long slide'],
  ['coin', 'interface-sounds/Audio/confirmation_001.ogg', '', 'coin picked up'],
  ['win', 'music-jingles/Audio/Pizzicato jingles/jingles_PIZZI03.ogg', '', 'level won'],
  ['fail', 'interface-sounds/Audio/minimize_006.ogg', '', 'out of moves'],
  ['teleport', 'interface-sounds/Audio/switch_005.ogg', '', 'portal'],
  ['break', 'impact-sounds/Audio/impactPlank_medium_000.ogg', 'lowpass=f=3500', 'fragile wall'],
  ['bomb', 'impact-sounds/Audio/impactSoft_heavy_000.ogg', '', 'paint bomb'],
  ['stop', 'impact-sounds/Audio/impactSoft_medium_001.ogg', '', 'stop tile'],
  ['click', 'interface-sounds/Audio/drop_002.ogg', 'volume=0.8', 'button'],
  ['popup_open', 'interface-sounds/Audio/maximize_008.ogg', '', 'pop-up opens'],
  ['popup_close', 'interface-sounds/Audio/minimize_008.ogg', '', 'pop-up closes'],
  ['purchase', 'interface-sounds/Audio/confirmation_004.ogg', '', 'purchase done'],
  ['chest', 'interface-sounds/Audio/switch_006.ogg', '', 'chest opens'],
  ['world', 'music-jingles/Audio/Pizzicato jingles/jingles_PIZZI07.ogg', '', 'new world'],
  ['tier', 'music-jingles/Audio/Pizzicato jingles/jingles_PIZZI12.ogg', '', 'streak goes up a tier'],
  ['piggy_break', 'music-jingles/Audio/Pizzicato jingles/jingles_PIZZI15.ogg', '', 'piggy bank breaks'],
  ['streak_saved', 'music-jingles/Audio/Pizzicato jingles/jingles_PIZZI13.ogg', '', 'streak kept'],
];

/**
 * The paint "plip" has 12 notes (C major pentatonic, two octaves). They are NOT 12 files any more: every audio file played needs its own
 * native player, and the phone only keeps a handful of them loaded at once. Two files are made, the original (A) and the same sound one
 * octave higher (B); the game plays them at a different speed (no pitch correction) to get the 12 notes: see PLIP_SEMITONES in
 * src/services/audio.ts.
 */
const PLIP_SOURCE = 'interface-sounds/Audio/drop_003.ogg';

function ffmpeg(args, capture = false) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostdin', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}\n${r.stderr}`);
  return capture ? r.stderr : '';
}

/** Mean volume (dB) of the sound once it has gone through `filters`. */
function meanVolume(input, filters) {
  const err = ffmpeg(['-i', input, '-af', `${filters},volumedetect`, '-f', 'null', '-'], true);
  const m = /mean_volume: (-?[0-9.]+) dB/.exec(err);
  return m ? Number(m[1]) : TARGET_MEAN_DB;
}

function convert(input, output, extra) {
  const chain = [CUT_SILENCE, extra, SOFTEN].filter(Boolean).join(',');
  const gain = Math.max(-12, Math.min(18, TARGET_MEAN_DB - meanVolume(input, chain)));
  ffmpeg([
    '-i', input,
    '-af', `${chain},volume=${gain.toFixed(2)}dB,alimiter=limit=${PEAK_LIMIT}:level=disabled,afade=t=in:d=0.003`,
    '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '96k', output,
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
const used = [];

for (const [name, file, extra, use] of SOUNDS) {
  const input = path.join(SRC, file);
  if (!fs.existsSync(input)) throw new Error(`Missing ${input}`);
  convert(input, path.join(OUT, `${name}.m4a`), extra);
  used.push([`${name}.m4a`, file, use]);
}

// The paint plip: the original and one octave higher.
const plipInput = path.join(SRC, PLIP_SOURCE);
if (!fs.existsSync(plipInput)) throw new Error(`Missing ${plipInput}`);
convert(plipInput, path.join(OUT, 'plip_a.m4a'), '');
convert(plipInput, path.join(OUT, 'plip_b.m4a'), 'asetrate=88200,aresample=44100');
used.push(['plip_a.m4a, plip_b.m4a', PLIP_SOURCE, 'paint: one note per tile; the 12 notes are these two files played at different speeds']);

// The door of the exit: a small wood slide and, a moment after, a light chime, mixed into one short sound (then softened and levelled
// like the others by `convert`).
const DOOR_WOOD = 'impact-sounds/Audio/footstep_wood_001.ogg';
const DOOR_CHIME = 'interface-sounds/Audio/confirmation_002.ogg';
const DOOR_CHIME_DELAY_MS = 140;
const DOOR_CHIME_GAIN = 0.55;
const DOOR_SECONDS = 0.55;
for (const f of [DOOR_WOOD, DOOR_CHIME]) if (!fs.existsSync(path.join(SRC, f))) throw new Error(`Missing ${path.join(SRC, f)}`);
const doorMix = path.join(os.tmpdir(), 'paint-parking-door-open.wav');
ffmpeg([
  '-i', path.join(SRC, DOOR_WOOD), '-i', path.join(SRC, DOOR_CHIME),
  '-filter_complex', `[0:a]${CUT_SILENCE},aresample=44100,aformat=channel_layouts=mono[a];[1:a]${CUT_SILENCE},aresample=44100,aformat=channel_layouts=mono,adelay=${DOOR_CHIME_DELAY_MS},volume=${DOOR_CHIME_GAIN}[b];[a][b]amix=inputs=2:normalize=0:duration=longest,atrim=0:${DOOR_SECONDS},afade=t=out:st=${DOOR_SECONDS - 0.12}:d=0.12`,
  doorMix,
]);
convert(doorMix, path.join(OUT, 'door_open.m4a'), '');
fs.rmSync(doorMix, { force: true });
used.push(['door_open.m4a', `${DOOR_WOOD.replace(/^[a-z-]+\/Audio\//, '')} + ${DOOR_CHIME.replace(/^[a-z-]+\/Audio\//, '')} (delayed ${DOOR_CHIME_DELAY_MS} ms)`, 'the exit door opens: wood slide + light chime']);

// The credits.
const lines = [
  '# Audio credits',
  '',
  'Sound effects and jingles: **Kenney** (https://kenney.nl), Impact Sounds, Interface Sounds and Music Jingles, licence **CC0** (public domain, commercial use allowed, no attribution required).',
  'Each was filtered (soft low-pass), levelled and converted to AAC by `scripts/prepare-audio.js`; the plip is also made one octave higher.',
  '',
  '| File (assets/audio/sfx/) | Kenney file | Used for |',
  '|---|---|---|',
  ...used.map(([out, from, use]) => `| ${out} | ${from.replace(/^[a-z-]+\/Audio\//, '')} | ${use} |`),
  '',
  'Music: `paint_maze_ambiance_douce.m4a`, supplied with the project.',
  '',
];
fs.writeFileSync(path.resolve(__dirname, '../assets/audio/CREDITS.md'), lines.join('\n'));
console.log(`Wrote ${used.length} sound files to ${OUT}`);
