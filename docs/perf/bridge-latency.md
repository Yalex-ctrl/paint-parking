# The latency at the bridge: before / after

**Status: the bench and the first changes are in; the figures are still to be taken on a phone.** This file is written by hand from the
two reports of the bench (`bridge-before.md`, `bridge-after.md`, see README.md). Nothing below is a measurement until a report is pasted
next to it.

## What was read in the code (hypotheses, see bridge-audit.md)

- The crossing does not start by itself: `handleVictory` (after the ball has rolled out) ends with `bus.transitionRequested = true`,
  and `Director` waits there until the next board is mounted and warm (`nextGroup.userData.ready`). If the next level is late, the ball
  keeps rolling on the bridge at the speed it had (that is the "latency"), then the crossing starts. So the wait that matters is
  `transitionRequested -> bridge` in the report, and the number of passages in which the next level was **not** ready.
- `gateOpen` (set at the moment the last tile is painted) used to put the preparation of the next level, and of the levels ahead, at full
  speed: the heaviest work of the preparation ran exactly when the window of the bridge opened.

## Changed before the first measurement (they remove work from the window, they add none)

1. **The next level is prepared from the moment the ball has landed** (250 ms after, was 600 ms), a piece at a time, and **only in calm
   frames**: while the ball slides, leaves the board or crosses, the preparation does not run (it looks again 80 ms later).
2. **The opening of the exit no longer speeds anything up.** The "full speed" switch (`gateOpen`) is gone, together with the state and the
   re-render of `GameScreen` that went with it. The only time the preparation goes fast is when the crossing is already waiting for the
   very level being prepared (`bus.transitionRequested`): then each piece follows the previous one after 3 ms.
3. The levels ahead (`warmAhead`) are prepared at full speed only while nothing moves (a pop-up, the menu, the tour), not at the gate.
4. The bench (`render/bench.ts`) records the waits between the moments of the passage and whether the next level was ready, so each of
   the goals below has a figure.

## Goals (from the brief) and where each is read in the report

| goal | read in |
|---|---|
| last swipe -> the ball starts to leave: < 50 ms | "Waits": `exitSwipe -> ballExit` |
| the ball out -> the camera moves: 0 frame of waiting | "Waits": `transitionRequested -> bridge` |
| the ball down -> a swipe is possible at once | "Waits": `arrival -> swipeable` |
| no frame over 25 ms during the passage | the header of the report, "By phase" |
| the next level was ready (mounted and warm) | "the next level was not ready ... in n of 20 passages" (goal: 0) |
| no loss of frame rate during play because of the preparation | compare the average frame time of two runs of the bench, with and without the preparation (see below) |

To compare the frame rate in play with and without the preparation: run the bench once as it is, then once with
`PREPARE_NEXT_DELAY_MS` set very high in `screens/GameScreen.tsx` (the preparation never starts), and compare the frame rate shown by
the performance badge ("Afficher les perfs") during play.

## Figures

| | before | after |
|---|---|---|
| exitSwipe -> ballExit (ms, average / worst) | | |
| transitionRequested -> bridge (ms) | | |
| arrival -> swipeable (ms) | | |
| passages with the next level not ready (of 20) | | |
| frames over 20 ms / over 25 ms | | |
| 99th percentile, worst frame (ms) | | |
| shader programs during the passages | | |
| garbage collections over 10 ms | | |

## Not done yet, and why

- The settlement of the result (`settleVictory`, the profile write, `setEnd`) still runs when the ball has rolled out, i.e. at the
  start of the bridge. Moving it to the moment of the exit swipe needs the bench to say it costs something: its duration is the line
  `handoff -> transitionRequested` of the report. If it is under 3 ms it stays where it is.
- The end-of-level overlays are mounted at that moment, not before. The commits of `ResultStars`, `WorldProgressRow` and `Confetti`
  are timed (`commit ...` lines of the report); they are to be mounted ahead and animated by Reanimated only if the report shows them
  in the slow frames.
