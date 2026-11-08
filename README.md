# Paint Parking

Puzzle game: a jammed parking lot. Swipe a vehicle along its axis (or tap it to send it forward) and it drives out, round the lot by the road, leaving a trail of paint. If something is in the way it honks, bumps and comes back (one move, one collision). Empty the lot with no collision for 3 stars.

Built on the same base as Paint Maze (Expo SDK 58, React Three Fiber on expo-gl, runs in Expo Go and in EAS builds). The project is a copy: **Paint Maze itself is never touched**, the two games share no data on a phone (storage keys `paint-parking/…`, product ids `paintparking_…`).

```bash
npm install
npx expo start                              # then scan the QR code (Expo Go) or use a development build
npm test                                    # Jest: rules, solver, generator, levels, scoring, help, render maths, shop, economy, isolation
npm run typecheck && npx expo lint
npm run generate-levels -- --count 50       # assets/levels.json (compact format) + difficulty table (--table docs/LEVEL_TABLE.md)
npm run generate-daily -- --count 30        # assets/daily.json (the app handles 366)
npx tsx scripts/level-stats.ts 10 30 50     # difficulty of lots built without steering (to calibrate game/generator.ts targetDifficulty)
node scripts/make-parking-sounds.js         # re-synthesise the five sounds of the parking
node scripts/audit-frame-allocations.js     # nothing may be allocated in a useFrame callback (a test runs it)
```

## Layout

| Folder | What |
|---|---|
| `src/core/` | Everything that is not gameplay and that a next game reuses as it is: UI, HUD, services (ads, purchases, audio...), storage, config (economy in `config/monetization.ts`), i18n FR/EN, economy / shop / lives / streak / gifts / piggy bank / VIP / daily challenge logic, guided tour, `core/render` (frame watch, decor models, paint styles, thumbnails registry). |
| `src/game/` | The parking only: `types`, `engine` (rules of a gesture), `solver`, `generator`, `levelSchema` (compact files + zod), `levels`, `dailyLevels`, `scoring`, `guide`, `mechanics`. |
| `src/render/` | The 3D parking: `ParkingCanvas` (one Canvas, two lots mounted for the transition), `ParkingScene` (everything that moves, no allocation per frame), `paths` (the way out), `lotGeometry`, `vehicleGeometry`, `skinSpecs` (52 vehicles), `thumbnails`, `ShopPreview`. |
| `src/screens/` | `GameScreen` (the level: HUD, gestures, result, chest, tour offer...). |
| `legacy-maze/` | What was taken out of Paint Maze and is kept for reference only (outside typecheck, tests and lint). To be deleted. |
| `docs/` | `REUSE_PLAN.md` (what was reused / adapted / removed and what remains), `LEVEL_TABLE.md` (the 50 levels), store listings, release checklist. |

## Rules

- A vehicle covers 2 cells (car) or 3 (truck), has a front, and can leave by either end of its axis. A gesture along the other axis shakes it and counts nothing.
- It leaves if every cell between it and the edge is free (no vehicle, no obstacle), the barrier on that part of the edge is open and the one-way arrow of its lane allows that way. Otherwise it drives up to the obstacle, bumps and comes back.
- Optimum = number of vehicles. 3 stars: no collision; 2: one or two; 1: more. Move limit (levels 6+): optimum + 3 up to level 20, + 2 after.
- Because vehicles only ever leave, a lot can be emptied if and only if one can keep removing a free vehicle: the solver has no search (`game/solver.ts`), and the generator builds a lot backwards so it is solvable by construction (`game/generator.ts`), then moves vehicles to reach the difficulty of the curve.

## Mechanics (each introduced by a tutorial level where it is alone and necessary)

| Level | Mechanic |
|---|---|
| 8 | fixed obstacles (posts, potted trees, bollards) |
| 15 | trucks (3 cells) |
| 25 | barrier: part of the edge is shut until enough vehicles have left (counter on the barrier) |
| 35 | one-way: an arrow painted on an edge cell, vehicles of that lane may only leave that way |

## State

See `docs/REUSE_PLAN.md`: what is done, and what has never been run on a phone.
