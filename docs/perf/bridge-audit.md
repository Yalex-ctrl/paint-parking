# The bridge: what the code does at the end of a level (read before the first measurement)

This is a reading of the code, not a measurement. Every line below is a **hypothesis** that the bench (see README.md) has to confirm or
reject with a figure before anything is changed. It is written so that the first report can be read against it.

## What happens, in order

1. **The last tile is painted** (`render/Board.tsx`, the `paint` handler). In that one call: the "wave of shine" copies the whole colour
   buffer of the board (`new Float32Array(paint.instanceColor.array)`, three floats per tile), the slow motion is armed, and
   `bus.onEvent('exitOpen')` runs.
2. **`exitOpen` in `screens/GameScreen.tsx`** (`bus.onEvent`): `react('exitOpen')` (a vibration and a sound), then three state changes
   of the big screen component: `setGateOpen(true)`, `setConfetti(n + 1)` (it mounts `Confetti`: 44 animated pieces) and a timer for
   `setConfetti(0)`. `GameScreen` is one component of 1,760 lines with 34 `useState`: a commit of it is not cheap.
3. **`gateOpen` changes two things at once**, in the same commit:
   - the effect that prepares the next level (`prepareSteps`, dependency list ends with `gateOpen`) restarts, and from now on it works at
     `gateOpen ? 3 : STEP_GAP_MS` (3 ms instead of 24 ms between two steps) and starts at once (`gateOpen ? 0 : PREPARE_NEXT_DELAY_MS`);
     if the next level is not finished yet (a slow phone, a long level) its remaining steps run **inside the window**, and `setNext`
     mounts the whole next board (`LevelWorld`, mounted in stages) while the ball is on the bridge;
   - `setWarmIdle(idleNow || gateOpen)`: the preparation of the levels *ahead* (`warmAhead`) is put at **full speed** at exactly the
     moment the window opens. This is the opposite of what the window needs.
4. **The ball leaves** (`render/Ball.tsx`, phase `exit`) and the exit settles. When it has rolled out, `bus.onSlideDone(true)` calls
   `handleVictory`: the stars (`starsFor`), the settlement of the result (`settleVictory` / `settleDaily`), `updateProfile` (it notifies
   **every** subscriber of the profile: the header, the shop badges... each one re-renders), `completeLevelNow` (progress in memory),
   `setDoneStars`, `setEnd({...})` (it mounts `ResultStars`, `WorldProgressRow`, the score...), sounds, `arriveLater` (the coin flight).
   The interstitial test and the saves are already queued (`runWhenIdle`) and held (`holdIdle`) until the ball has landed.
5. **The bridge** (`render/Director.tsx`): four clones at the start of the run (`poseOld`, `poseNew`, the two orientations), then the
   camera, the ball and the old board are moved in `useFrame` with no allocation (checked by `scripts/audit-frame-allocations.js`).
6. **Arrival**: `bus.onTransitionDone` releases the idle queue (`releaseIdle`, 350 ms later the saves, the analytics and the freeing of
   the old board run one at a time), `setWarmPaused(false)`, and the screen switches to the new level (a commit of `GameScreen`, then
   the old board stays mounted for 1.5 s and is unmounted: its geometries are freed on the GPU).

## What to look at in the first report (the order of the suspicions)

| # | Suspect | Where it would show | What confirms it |
|---|---|---|---|
| 1 | The commit of `GameScreen` at `exitOpen` and at `handleVictory` (the confetti, the result, the profile subscribers) | phase `lastTile` / `exitOpening`: `commit GameScreen`, `commit Confetti`, `commit ResultStars` | commits of several ms in frames over 20 ms |
| 2 | The preparation of the next level, and of the levels ahead, at full speed from `gateOpen` | phases `exitOpening` to `bridge`: `prepare step` | `prepare step` tasks in slow frames; `+n geometries` on the GPU side |
| 3 | The mounting of the next board (`setNext` then the stages of `LevelWorld`) if it was not ready | phase `bridge`: new geometries and textures in a frame | `+n geometry(ies)`, `+n texture(s)` in the report; programs must stay constant |
| 4 | A shader compiled during the passage (a material the warm-up did not see) | any phase | `ROSE n time(s)` on the programs line |
| 5 | The garbage collector (the wave's buffer, the clones of the Director, the arrays of the result, the profile objects) | slow frames with nothing named | the "garbage collector" line of the report; frames "nothing named" |
| 6 | The sounds and vibrations of the end (`win`, `door_open`, the stars, the coins) | `sfx ...` and `haptic ...` tasks | milliseconds in the task table |
| 7 | The unmounting of the old board 1.5 s after the landing (GPU frees) | phase `entryClose` and after | slow frames with a drop of geometries |

Nothing is to be changed for a suspect the report does not show.
