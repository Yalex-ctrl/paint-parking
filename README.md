# Paint Parking

Puzzle game inspired by AMAZE!!!: swipe to slide the ball, paint every tile, then leave through the exit. Expo SDK 57, React Three Fiber (expo-gl), runs in Expo Go.

```bash
npm install
npx expo start            # then scan the QR code with Expo Go
npm test                  # Jest: rules, mechanics, generator, solver, campaign, economy, daily, ads rules, services, render maths
npm run generate-levels   # rebuild assets/levels.json (500 solver-validated levels, ~3.5 min)
npm run generate-daily    # rebuild assets/daily.json (366 harder daily challenges, ~2 min)
npm run typecheck && npx expo lint
npx tsx scripts/show-level.ts 25 50 75   # print levels as ASCII
npx tsx scripts/show-pictures.ts         # print the gallery pictures as ASCII
node scripts/generate-sounds.js          # re-synthesise assets/sounds/*.wav
```

## Mechanics (introduced by tutorial levels)

| Level | Mechanic | Rule |
|---|---|---|
| 1-5 | slide | Tiny levels (3-4 swipes), finished in a few seconds. |
| 1-24 | slide | The ball slides until a wall; every tile it crosses is painted. The exit stays shut until everything is painted. |
| 5+ | coins | Optional, never needed. A coin only counts once per level. |
| 25 | stop tile | Halts the ball on the tile even with open floor ahead. |
| 50 | bend | Turns the ball 90° without stopping; a wall for the two closed sides. |
| 75 | portals | Linked pair (max 2 pairs, different colours); same direction on the way out; stops on the exit portal if a wall is right after it. |
| 100 | double coat | Needs two passes (light, then dark). |
| 125 | fragile wall | Stops the ball like a wall and breaks; becomes floor that must be painted. |
| 150 | paint bomb | Paints the floor tiles of the 3×3 area when the ball passes; once. |

## Economy, shop, retention

Everything tunable (prices, rewards, ad frequency, offers) is in `src/config/monetization.ts`; nothing else hard-codes a number.

- **Coins**: coins picked up in a level (once per coin, ever) + end-of-level bonus (1★ = 5, 2★ = 10, 3★ = 20). Replaying a level only pays the improvement over its best stars, so short levels cannot be farmed. "x2 🎬" during the fall to the next level doubles the bonus.
- **Hints**: 50 coins *or* a rewarded ad (player's choice). An animated arrow shows the next good swipe (stored solution, or the solver from the current position).
- **Shop** (`/shop`): 13 balls and 6 paints made in code (procedural textures, see `src/render/skinPatterns.ts`, `skins.tsx`, `paintEffects.ts`), one rotating 3D preview, buy / equip. Exclusive balls come from the starter pack, day 7 of the daily reward, and 7 / 30-day challenge streaks. A third tab "Offres" holds the real-money products.
- **Daily challenge** (`/daily`): one of 366 pre-generated levels (`assets/daily.json`), picked by day of the year (same for everybody), streak 🔥, one free "save streak" per streak via a rewarded ad, rewards growing with the streak, month calendar.
- **Daily reward**: popup at the first opening of the day, 7-day cycle (25 / 50 / 75 / 100 / 150 / 200, day 7 = exclusive ball or 500 coins), a missed day restarts at day 1, "x2 🎬".
- **Worlds**: one per 25 levels (forest, flowering meadow, autumn, snow, desert, then again with shifted colours): ground, sky, light and decor change (`src/game/worlds.ts`, applied in `render/prepare`, `GameCanvas` ThemeRig, `decor/`). Progress bar toward the next world shown during the fall; an unlock card appears when a new world starts.
- **Gallery** (`/gallery`): a 16×16 pixel-art picture every 10 levels (50 pictures, `src/game/gallery.ts`); each finished level reveals a piece (animated during the fall), finished pictures stay in the gallery.
- **First launch**: no home screen, straight into level 1 with an animated hand; the home appears from the 2nd launch.
- **Notifications**: local only (`expo-notifications`), permission asked after level 3, at most one a day around 18:00 (daily challenge, or "your streak is in danger"), switch in settings.
- **Dev mode only** (`__DEV__`): level selector, "+1000 coins" in the settings.

## What is simulated, and how to plug the real thing

Only three small modules know about the outside world; the game calls them through stable interfaces, so going live changes **no game code**.

| Service | Today (Expo Go) | Going live |
|---|---|---|
| `src/services/ads.ts` | `showRewarded` / `showInterstitial` open a full-screen "PUB (simulation)" of 3 s (`components/AdHost`) | `react-native-google-mobile-ads` (steps in the file's header) |
| `src/services/purchases.ts` | A confirmation dialog, then an instant purchase; permanent purchases are remembered for "Restore" | RevenueCat (`react-native-purchases`, steps in the file's header) |
| `src/services/analytics.ts` | `console.log` | Any provider through `setAnalyticsImplementation` |

Interstitial rules live in `src/game/adRules.ts` (tested): never before level 5, once every 3-4 victories, never in a level, never twice within 90 s, never with "Sans pub" bought.

### Real ads — checklist

1. `npx expo install react-native-google-mobile-ads`; add its config plugin to `app.json` with your AdMob **app ids** (iOS and Android); create the rewarded and interstitial **ad unit ids**.
2. Make a development build (`eas build --profile development`): the SDK does not run in Expo Go.
3. iOS: App Tracking Transparency prompt at first launch (`expo-tracking-transparency`, plus the `NSUserTrackingUsageDescription` text).
4. GDPR: the UMP consent form (`AdsConsent.requestInfoUpdate` + `loadAndShowConsentFormIfRequired`) **before** `mobileAds().initialize()`.
5. Implement `AdsService` (`RewardedAd` / `InterstitialAd`, preload the next ad, resolve `showRewarded` with `true` only on the earned-reward event) and call `setAdsImplementation(realAds)` once in `src/app/_layout.tsx`; stop mounting `<AdHost />`.
6. Use test ad units while developing; switch to the real ids for release.

### Real purchases — checklist

1. Create in App Store Connect and Google Play Console, with **exactly** the ids of `MONETIZATION.products`: `no_ads` (non-consumable), `starter_pack` (non-consumable), `coins_500`, `coins_1500`, `coins_5000` (consumables). Prices shown in the app come from the config until the store prices are read from RevenueCat.
2. Create the RevenueCat project, attach the products and an entitlement / offering.
3. `npx expo install react-native-purchases`, add its config plugin, make a development build.
4. `Purchases.configure({ apiKey })` at start-up; implement `PurchasesService` (`purchase` → `Purchases.purchaseStoreProduct`, answer `'cancelled'` on `userCancelled`; `restore` → ids the customer owns) and call `setPurchasesImplementation(realPurchases)`.
5. Receipt validation is handled by RevenueCat; if you also keep the profile on a server, grant `adsRemoved` / the starter pack from the entitlement, not from the device.

## Architecture

- `src/game/` – pure logic, no React / three.
  - `engine` – the rules. A level is compiled to flat arrays (`Board`); `traceSlide` is THE movement rule, shared by the game, the solver and the generator; it also detects infinite loops.
  - `solver` – BFS on (position, first coats, second coats, broken walls, used bombs): validation, hints, stars.
  - `generator` – solvable by construction: a ball is simulated with the real rules while corridors and "gadgets" are dug in front of it; every swipe is recorded. Rejects any level where a swipe can loop. Also builds the daily challenges.
  - `analysis`, `progression`, `scoring` (3★ = optimum, 2★ = up to ×1.5), `levels`, `dailyLevels`, `rng`, `types`.
  - `economy` (profile + coins, shop, products, starter offer), `daily` (streak, calendar, daily reward), `adRules`, `worlds`, `gallery` + `png`, `notificationPlan`, `dates` (local day keys, DST-safe), `shopItems`.
- `src/render/` – 3D only.
  - `GameCanvas` (scene root, `ThemeRig` for sky and lights), `World` (one board: island, maze, special tiles, decor), `Board` (paint effects), `Features3D`, `Ball` (+ `skins`, `skinPatterns`), `Particles`/`ParticlePool`, `Trail`, `HintArrow`, `ShopPreview`.
  - `prepare` – everything heavy about a level (geometry, island, decor plan, camera, world theme), built while the previous level is played.
  - `Director` + `transition` – the level transition and camera shake. `bus` – imperative channel between the screen and the scene.
  - `decor/` – Kenney Nature Kit models (CC0, `assets/models`), placement rules per world and screen-space checks.
- `src/app/` – Expo Router screens: home, game, shop, daily, gallery, settings, levels (dev).
- `src/components/` – stars, bonus row / progress card, pop-ups, first-level hand, ad host, coin counter.
- `src/storage/` – the profile store (`profile`, saved in AsyncStorage), launch counter, progress and stars, settings, tutorials already seen.
- `src/services/` – `ads`, `purchases`, `analytics`, `notifications`, `haptics`.
- `src/config/monetization.ts` – every tunable number.
- `scripts/` – level and daily generation, sound synthesis, ASCII viewers.

## Look and feel (design system, home, map)

- **Design system** (`src/ui/`): `theme.ts` holds every colour, radius, shadow and spacing (screens never hard-code a colour); `Text` is the only text component (the rounded Fredoka font, loaded before the first frame); `Button3D` is the only button (a face on a thick edge that sinks when pressed, haptic, optional float) with five variants whose text always reads; `Card3D` the raised card; `CoinIcon` / `CoinAmount` the only way a price or a balance is written; `Icon` one icon family (Material Community); `ScreenHeader` the same header on every secondary screen (round back button, centred title, coin balance) with a fade under it for the scrolling content.
- **Home** (`src/app/index.tsx`, `src/render/home/`): a 3D diorama of the world the player is in (island, decor, a mini board where the equipped ball plays the stored solution in a loop, clouds, butterflies / leaves / snow / tumbleweeds), a slowly swaying camera, the "Paint Parking" logo in relief (MAZE fills with paint letter by letter), floating Button3D buttons. Play dives into the diorama and fades into the map.
- **Map of levels** (`src/app/map.tsx`, `src/render/map/`, `src/game/mapLayout.ts`): a vertical 3D path, one pad per level (colour it was painted in, 1-3 stars, padlock on locked ones, the equipped ball bouncing on the current one), worlds one after the other with a gradual change of ground and sky, wooden signs, chests every 10 levels, the daily-challenge balloon, coins that fly by (20 a day at most), balls that roll down the path. Only the visible window of levels and at most two worlds are alive; pads, stars, locks and decor are instanced. After a victory the map plays the stars falling, the ball hopping to the next pad and its padlock flying off. Scrolling state is a plain object read every frame (`mapState.ts`), written only through `mapController.ts`.
- **Board shape**: wall cells that touch no floor are not built, so big plain wooden areas are gone; the board, its slab and its drop shadow follow the corridors (`src/game/silhouette.ts`).
- **Size rules** (`src/game/sizeRules.ts`): levels 1-5 are tiny, a tutorial is at least 4x4, every other level is at least as big as the ramp (5x5 up to 11x13), checked by the campaign script, by the on-device generator and by a test.

## Performance

- **One 3D scene at a time.** The home diorama and the map are torn down as soon as another screen is on top of them (`useIsFocused`); the game's canvas stops drawing (`frameloop="never"`) while a screen (settings, shop) covers it; the shop's preview only runs while the shop is shown. The stack also freezes the React tree of hidden screens.
- **In a level only the ball, the paint and the splashes move.** No clouds, flying coins, rolling balls or ambience (those are for the home and the map). Scenery is static.
- Pixel ratio capped at 2; a single light casts shadows (map 1024), only the ball and the walls cast; splashes and stains are instanced and capped (190 droplets, 40 stains per board).
- **Frame-rate watch** (`src/render/perf.ts`): if the average drops under 50 fps for 2 seconds, the quality steps down (1: no shadows, half the scenery, half the particles; 2: no scenery, a quarter of the particles). `__DEV__` builds show an "N fps · Qx" counter under the header of the game.
- **Shop pictures** are not canvases: each card's picture is drawn once in plain code, saved as a PNG in the cache folder (`expo-file-system`), and shown as an `<Image>`; they are made one at a time as the list scrolls (`useThumbnail`). Only the big preview at the top is 3D.

## Catalogue and reset

- 45 balls and 36 paints with four rarities (common 200-500 coins, rare 800-1500, epic 2000-4000, legendary 6000-10000 or earned). Balls: patterns and materials in `skinPatterns*.ts` / `skinSpecs.ts`; paints: `paintStyles.ts` (data) and `paintTexels.ts` (tile patterns). A painted tile is always clearly different from an unpainted one (a test checks every paint on every level colour). Exclusive items come from the chests of the map (n°2, 4, 6, 8) and from the end of the first five worlds (levels 25, 50, 75, 100, 125) - see `MONETIZATION.shop`.
- **Settings > Progression**: "Revoir le tutoriel" and "Remettre à zéro" (summary, then a button to hold for 2 seconds). Every AsyncStorage key is declared in `src/storage/keys.ts`; real-money purchases and the preferences survive a reset (`src/storage/reset.ts`, tested).
