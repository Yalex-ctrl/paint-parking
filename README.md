# Paint Parking

Puzzle game: a jammed parking lot. Every vehicle has ONE way to go, shown by a big arrow painted on its roof (sometimes toward its rear: it reverses out). Tap a vehicle and it drives that way: out of the lot, round it by the road, leaving a trail of paint, if the way is clear; otherwise it goes up to what is in the way, honks, bumps and comes back (one tap = one move, a bump = one collision). Empty the lot with no collision for 3 stars.

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

- A vehicle covers 1 x 2 places (car) or 1 x 3 (truck); its body is 78 % of a place wide and 90 % of its length long, so the asphalt and the lines show round it. Its arrow shows its one way (front or rear).
- A tap sends it that way. It leaves if every place between it and the edge is free (no vehicle, no obstacle, no void of the lot shape), the barrier on that part of the edge is open and no one-way arrow on the way points another direction. Otherwise it bumps and comes back. A tap on a vehicle that is still moving, or has left, is ignored; taps on different vehicles can follow each other as fast as one likes.
- Optimum = number of vehicles. 3 stars: no collision; 2: one or two; 1: more. Move limit (levels 6+): optimum + 3 up to level 20, + 2 after.
- A vehicle is free when the places in front of it, up to the edge, are empty. Because vehicles only ever leave, a lot can be emptied if and only if one can keep removing a free vehicle: the solver has no search (`game/solver.ts`). The generator builds a lot backwards (each new vehicle gets the way and the arrow that are clear given the vehicles already there, and prefers to stand in the way of those that could leave), then moves vehicles around to reach the difficulty of the curve with only 15-30 % of the vehicles free at the start (`game/generator.ts`).
- Touches: `react-native-gesture-handler` gives the pixel, `render/pick.ts` casts it through the camera onto the ground and finds the vehicle (with a 0.3 place tolerance). The canvas itself never takes a touch (`pointerEvents="none"`), and neither do the help, the halo or any decoration over the lot. In the tester mode a dot and a line of text show where the last touch landed and what was found.

## Mechanics (each introduced by a tutorial level where it is alone and necessary)

| Level | Mechanic |
|---|---|
| 8 | fixed obstacles (posts, potted trees, bollards) |
| 15 | trucks (3 cells) |
| 25 | barrier: part of the edge is shut until enough vehicles have left (counter on the barrier) |
| 35 | one-way arrows painted on places: a vehicle may only drive over such a place the way the arrow shows (any other way is a wall). With one fixed way per vehicle, an arrow can only ever be on the way of vehicles that go its way: it is a rule to respect, not a puzzle on its own |

## State

See `docs/REUSE_PLAN.md`: what is done, and what has never been run on a phone.
