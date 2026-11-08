/**
 * Makes the three sounds of the newest mechanics with ffmpeg alone (no pack to download): `node scripts/make-slide-sounds.js`.
 *   whoosh.m4a - the air of the ball in a chute: a soft filtered noise, made to loop; the game plays it in a loop and changes its
 *                playback rate with the speed of the ball, so the pitch follows the speed;
 *   plop.m4a   - the little "plop" when the ball comes out of the chute: a quick rising bubble;
 *   rumble.m4a - the low rumble of a tile that collapses: brown noise, low-passed, nothing shrill;
 *   clac.m4a   - the flap of the exit of a chute opening or shutting: a short, dry knock of wood;
 *   tok.m4a    - the dull knock of the ball against the flap, seen from outside.
 * They go to assets/audio/sfx/ (AAC, like the others, because iOS does not play ogg).
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const OUT = path.resolve(__dirname, '../assets/audio/sfx');

const jobs = [
  {
    name: 'whoosh',
    // 1.6 s of pink noise, band-limited, with a faint slow swell so it breathes; constant on average, so it loops without a click.
    args: ['-f', 'lavfi', '-i', 'anoisesrc=d=1.6:c=pink:r=44100:a=0.9:seed=7', '-af', 'highpass=f=260,lowpass=f=3200,tremolo=f=5:d=0.12,volume=0.55'],
  },
  {
    name: 'plop',
    args: ['-f', 'lavfi', '-i', "aevalsrc='sin(2*PI*(260+2600*t)*t)*exp(-17*t)':d=0.2:s=44100", '-af', 'lowpass=f=3800,volume=0.4'],
  },
  {
    name: 'clac',
    args: ['-f', 'lavfi', '-i', 'anoisesrc=d=0.12:c=pink:r=44100:a=0.9:seed=11', '-af', 'bandpass=f=1400:width_type=h:w=900,afade=t=out:st=0.01:d=0.1,volume=1.1'],
  },
  {
    name: 'tok',
    args: ['-f', 'lavfi', '-i', "aevalsrc='sin(2*PI*150*t)*exp(-26*t)+0.35*sin(2*PI*420*t)*exp(-40*t)':d=0.16:s=44100", '-af', 'lowpass=f=900,volume=0.9'],
  },
  {
    name: 'rumble',
    args: ['-f', 'lavfi', '-i', 'anoisesrc=d=0.8:c=brown:r=44100:a=0.9:seed=3', '-af', 'lowpass=f=210,afade=t=in:st=0:d=0.04,afade=t=out:st=0.18:d=0.6,volume=1.3'],
  },
];

for (const job of jobs) {
  const out = path.join(OUT, `${job.name}.m4a`);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...job.args, '-c:a', 'aac', '-b:a', '96k', out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${job.name}: ${r.stderr}`);
  console.log('wrote', out);
}
