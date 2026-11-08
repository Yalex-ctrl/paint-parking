# Bridge bench ("Banc d'essai du pont")

What it measures: the passage from the last painted tile of a level to the moment the ball is settled on the next one, over 20
passages in a row, with the real game (the stored solution of each level is played swipe after swipe, at the pace of a player who knows
the level; no ad interrupts it).

## Running it

Measure an **optimised** build, never the development mode (it is several times slower and distorts everything):

```powershell
$env:EXPO_PUBLIC_BENCH = "1"
npx expo start --no-dev --minify
```

(or an EAS `preview` build made with `EXPO_PUBLIC_BENCH=1`). Open Réglages: a "MODE DÉVELOPPEUR" card with the two bench buttons is
shown even in an optimised build. "Banc d'essai du pont (avant)" is for the figures before a change, "(après)" for the ones after. The
bench starts on level 12 and plays 20 passages; a badge at the bottom of the screen shows its progress and, at the end, the summary.

In a development build (`npx expo start`) the same buttons are in the usual developer menu. The report says which kind of build it came
from; only the optimised one counts.

## What comes out

- The report, between `[bench] ===== BEGIN docs/perf/bridge-<label>.md` and `END` lines in the terminal (copy it into
  `docs/perf/bridge-before.md` or `bridge-after.md`), and the same file on the device (`Paths.document/bridge-<label>.md`, the path is
  shown in the badge).
- Per frame: its duration, its phase (`lastTile`, `exitOpening`, `ballExit`, `bridge`, `arrival`, `entryClose`), every named task that
  ran during it (the saves, the analytics, the sounds, the vibrations, the preparation and freeing of levels, the settlement of the
  result, every React commit of the main components), the collections of the garbage collector (Hermes statistics, when the runtime
  gives them) and what the GPU was given (shader programs, geometries, textures).
- Average, 95th and 99th percentile, worst frame, the frames over 20 ms with their tasks, and the causes ranked from the most to the
  least costly. The goals are written in the report: no frame over 25 ms, 99th percentile under 18 ms, a constant number of shader
  programs, no garbage collection over 10 ms during a passage.

## Adding a measurement

`benchTimed('name', fn)` (render/bench.ts) times a piece of work; `useCommitTimer('Name')` times the commits of a component. Both cost a
boolean test when no bench runs. `node scripts/audit-frame-allocations.js` lists what looks like an allocation inside a `useFrame`.
