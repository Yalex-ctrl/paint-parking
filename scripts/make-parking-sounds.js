/**
 * Makes the sounds of the parking in code: `node scripts/make-parking-sounds.js` -> assets/audio/sfx/*.wav.
 *
 * The Kenney packs could not be downloaded here (the site refuses automated downloads), so these five are synthesised: soft by
 * construction (a low-pass on everything, gentle attacks, nothing above 0.55 of full scale, no harsh noise), like the ones of Paint
 * Maze. They can be replaced one by one with Kenney files through scripts/prepare-audio.js without touching the code (same names).
 */
const fs = require('fs');
const path = require('path');

const RATE = 22050;
const OUT = path.join(__dirname, '..', 'assets', 'audio', 'sfx');

/** Deterministic noise (no two runs differ). */
let seed = 12345;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};

const lowpass = (data, cutoff) => {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    y += a * (data[i] - y);
    data[i] = y;
  }
  return data;
};

const make = (seconds, fn) => {
  const n = Math.floor(seconds * RATE);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) data[i] = fn(i / RATE, i);
  return data;
};

const env = (t, attack, total, release) => Math.min(1, t / attack) * Math.min(1, Math.max(0, (total - t) / release));
const saw = (phase) => 2 * (phase - Math.floor(phase + 0.5));

function write(name, data, peak = 0.55) {
  let max = 0;
  for (const v of data) max = Math.max(max, Math.abs(v));
  const gain = max > 0 ? peak / max : 1;
  const pcm = Buffer.alloc(data.length * 2);
  for (let i = 0; i < data.length; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, data[i] * gain)) * 32767), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), Buffer.concat([header, pcm]));
  console.log(name, `${(data.length / RATE).toFixed(2)} s`, `${Math.round((44 + pcm.length) / 1024)} KB`);
}

// An engine turning over, then catching: a low saw wobbling up, with a soft rumble.
{
  let phase = 0;
  const total = 0.6;
  const d = make(total, (t) => {
    const f = 34 + 38 * Math.min(1, t / 0.45) + 3 * Math.sin(t * 38);
    phase += f / RATE;
    return (saw(phase) * 0.8 + noise() * 0.15) * env(t, 0.06, total, 0.2);
  });
  write('engine_start.wav', lowpass(lowpass(d, 380), 520));
}

// A small "vroum" as a vehicle pulls away: pitch and brightness rise, then it fades.
{
  let phase = 0;
  const total = 0.55;
  const d = make(total, (t) => {
    const f = 62 * Math.pow(3.6, Math.min(1, t / 0.5));
    phase += f / RATE;
    return (saw(phase) + 0.5 * saw(phase * 2.01)) * env(t, 0.04, total, 0.3);
  });
  write('vroom.wav', lowpass(lowpass(d, 700), 900));
}

// A short, soft horn: two close notes that make a small "pip-pip" interval.
{
  const total = 0.3;
  const d = make(total, (t) => {
    const a = Math.sin(2 * Math.PI * 392 * t);
    const b = Math.sin(2 * Math.PI * 494 * t);
    return Math.tanh((a + b) * 1.6) * env(t, 0.012, total, 0.1);
  });
  write('horn.wav', lowpass(lowpass(d, 1500), 1900));
}

// The "pouet" of the angry emoji: a short rising squeak.
{
  const total = 0.17;
  let phase = 0;
  const d = make(total, (t) => {
    phase += (520 + 260 * (t / total) + 18 * Math.sin(t * 70)) / RATE;
    return Math.sin(2 * Math.PI * phase) * env(t, 0.01, total, 0.07);
  });
  write('pouet.wav', lowpass(d, 1800));
}

// The barrier opens: two soft clunks and a small servo whine going up.
{
  const total = 0.6;
  let phase = 0;
  const d = make(total, (t) => {
    const clunk = (at) => (t >= at ? noise() * Math.exp(-(t - at) * 38) : 0);
    phase += (210 + 260 * Math.min(1, t / 0.5)) / RATE;
    const whine = Math.sin(2 * Math.PI * phase) * 0.35 * env(t, 0.08, total, 0.2);
    return clunk(0) * 1.2 + clunk(0.2) * 0.8 + whine;
  });
  write('barrier.wav', lowpass(lowpass(d, 900), 1300));
}
