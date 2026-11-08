# Paint Parking : plan de réutilisation de Paint Maze

Paint Parking est parti d'une copie de Paint Maze (commit `80ac91a` = la copie renommée, avant tout autre changement ; `git show 80ac91a:<chemin>` redonne n'importe quel fichier d'origine). Paint Maze lui-même n'est jamais modifié.

Légende : **Tel quel** = repris sans changement de logique. **Adapté** = repris, avec des changements (textes, constantes, types). **Retiré** = sorti du build (propre au labyrinthe). **À refaire** = le rôle existe dans le nouveau jeu mais le code est réécrit.

Le dossier `legacy-maze/` (hors typecheck, hors tests, hors lint) garde tous les fichiers sortis du build, à leur emplacement d'origine : ceux à porter (« Adapté / À refaire ») et ceux « Retiré », qui ne servent que de référence. Il sera supprimé à la fin du portage (tout reste dans l'historique git).

## Organisation du code

| Dossier | Contenu |
|---|---|
| `src/core/` | Tout ce qui n'est pas du gameplay : `ui`, `components`, `services`, `storage`, `config`, `i18n`, `tour`, `hooks`, la logique d'économie / boutique / vies / série / cadeaux / tirelire / VIP / défi du jour (`economy`, `lives`, `streak`, `rewards`, `vip`, `piggy`, `daily`, …), `core/render` (perf, profileur, pool de particules, décors Kenney, trace de transition, garde de scène, banc d'essai), `core/grid.ts` (directions). Un troisième jeu reprend ce dossier tel quel. |
| `src/game/` | Le gameplay du parking uniquement : types, règles, solveur, générateur, niveaux, étoiles, aide, mécaniques. |
| `src/render/` | Le rendu 3D du parking (à porter, voir ci-dessous). |
| `src/app/`, `src/screens/` | Routes Expo Router et écran de jeu. |

Règle : `src/core` n'importe jamais `src/game`. (Quelques fichiers de `core` ont encore des liens vers des types du labyrinthe ; ils sont listés plus bas, section « Dette ».)

## Réutilisé tel quel (dans `src/core/`)

- **Services** : `ads`, `admob`, `purchases`, `revenuecat`, `subscription` (achats et pubs simulés compris), `analytics`, `audio` (pool, session audio, silencieux, diagnostic), `haptics`, `idleQueue`, `leaderboard`, `notifications`, `playClock`, `playTime`, `toast`.
- **Stockage** : `keys` (préfixe `paint-parking/`), `launch`, `lives`, `profile`, `reset`, `settings`, `useVip` ; migrations conservées.
- **UI** : `Button3D`, `Card3D`, `CoinIcon`, `Countdown`, `HoldButton`, `Icon`, `LivesPill`, `LoadingScreen`, `loadingStore`, `OutlineText`, `PiggyBank`, `PiggyGauge`, `SceneCover`, `ScreenHeader`, `Slider`, `StreakFlame`, `Text`, `theme`, `Title3D`, `useScreenReady`.
- **Composants** : `AdBanner`, `AdHost`, `Confetti`, `DailyRewardCard`, `FreeCoins`, `GiftButton`, `HudPop`, `LevelHud`, `LevelResult`, `LivesModals`, `Modals`, `NoLivesCard`, `PauseMenu`, `PiggyParts`, `ResetFlow`, `RewardBurst`, `ShopOffers`, `StepBar`, `StreakModals`, `ToastHost`, `TrialCards`, `VipCards`, `VipParts`, `Wheel`, `GuidedTour`.
- **Logique** : `economy`, `economySim`, `lives`, `streak`, `rewards`, `vip`, `piggy`, `offers`, `adRules`, `chrono`, `dates`, `duration`, `loadingRules`, `notificationPlan`, `playTimer`, `rng`, `shopCatalog`, `steps`, `testerClock`, `png`, `points`, `gallery` (tableau révélé tous les 10 niveaux).
- **Config** : `app`, `features`, `monetization` (économie, prix, règles de pubs inchangés ; identifiants de produits `paintparking_*`), `scoring`, `tester`.
- **i18n** FR/EN, **mode testeur** (actif en `development` et `preview`, jamais en `production`, voir `eas.json`), **tour** (visite guidée : projecteur, main, étapes, cadeau de 30 pièces), **préchargement et règles de performance** (`core/render/perf`, `profiler`, `transitionTrace`, `bench`, `SceneGuard`, `ParticlePool`), **décors Kenney** (`core/render/decor`), tests de ces modules.

## Adapté

- `core/config/monetization.ts` : règle de limite de coups (`moves`) : optimum + 3 aux niveaux 6-20, + 2 ensuite, aucune limite aux niveaux 1-5.
- `core/config/scoring.ts` : temps cible = 2 s + 1,2 s × nombre de véhicules.
- `core/shopItems.ts` : onglet « Balles » devenu « Véhicules » (~40 skins), mêmes paliers de rareté et de prix.
- `core/dailyLoadout.ts`, `core/daily.ts` : voiture et peinture du jour.
- `core/worlds.ts`, `core/progression.ts`, `core/newFeatures.ts`, `core/storage/tutorials.ts`, `core/storage/progress.ts` : mécaniques du parking (obstacles 8, camions 15, barrière 25, sens unique 35).
- `core/tour/steps.ts`, `i18n/fr.json`, `i18n/en.json` : textes du parking.
- Rendu 3D (dans `legacy-maze/src/render`, à porter) : `GameCanvas`, `CameraRig`, `cameraFit`, `Director`, `World`, `Ground`, `island`, `islandLayout`, `prepare`, `prepareCache`, `transition`, `bus`, `bridge`, `budget`, `bubbleSlot`, `loadTimer`, `FirstFrame`, `Warmup`, `Particles`, `PerfMonitor`, `paintEffects`, `paintPalette`, `paintStyles`, `paintTexels`, `Trail`, `HintArrow`, `ShopPreview`, `skins*`, `thumbnails`, `useThumbnail`, `resultTimings`, `visibility`, `surface`, `style`, `clouds`, `ambience`, `worldContext`, `useCommitTimer`, `FreeCamera`, `home/HomeScene`.
- `screens/GameScreen.tsx`, `screens/useBridgeBench.ts` : déroulé, HUD, étapes, aide des niveaux 1-5, résultat (dans `legacy-maze/src/screens`, à porter).

## Retiré (sorti du build, dans `legacy-maze/`)

- Logique : glissade et peinture des cases, `solver`, `beam`, `generator`, `levelgen`, `rooms`, `campaign`, `infinite`, `crop`, `transform`, `silhouette`, `sides`, `sizeRules`, `mapLayout`, `analysis`, `difficulty`, `curve`, `demoLevels`, `showcase` (vitrine des éléments du labyrinthe), `funDaily`, mécaniques (virages, stops, téléporteurs, x2, toboggans, étages, sols fragiles, bombes, effondrement).
- Rendu : `Ball*`, `Board`, `boardShadow`, `Coins`, `CollapseDebris`, `collapseVisuals`, `coords`, `ExitMarks`, `exitPhysics`, `Features3D`, `geometry`, `heights`, `rolling`, `Slides`, `slide*`, `tier*`, `TierMeshes`, `x2Mark`, `map/*`.
- Niveaux et défis : anciens `levels.json`, `daily.json`, `curve.json` (dans `legacy-maze/assets/`), remplacés par les niveaux du parking dans `assets/`.
- Scripts et tests propres au labyrinthe.

## À refaire (le rôle existe, le code est neuf)

- `game/types.ts`, `game/engine.ts` (règles de déplacement), `game/solver.ts`, `game/generator.ts`, `game/levelSchema.ts`, `game/levels.ts`, `game/dailyLevels.ts`, `game/scoring.ts`, `game/guide.ts` (aide niveaux 1-5 et indice).
- Rendu : parking, véhicules, route, collisions, sorties, transition par la route.

## Dette connue (à traiter pendant le portage)

- `core/shopItems.ts`, `core/dailyLoadout.ts`, `core/storage/profile.ts` gardent le mot technique `ball` (`kind: 'ball'`, `equipped.ball`) : les textes disent « véhicule », le renommage des champs est une migration de sauvegarde à faire un jour.
- `core/worlds.ts`, `core/gallery.ts` : mondes, noms et décors repris du labyrinthe ; la logique est générique, les noms et les décors seront revus avec le rendu.
- `core/soundRules.ts` contient encore des règles de sons de toboggan à remplacer par les sons du parking.
- `core/render/useThumbnail.ts` est un bouchon (les vignettes de la boutique sont vides), `render/ShopPreview.tsx` et `screens/GameScreen.tsx` sont des écrans provisoires.
- `core/tour/steps.ts` et les textes de la visite guidée n'ont pas encore été adaptés au parking.
- Tests de Paint Maze mis de côté dans `legacy-maze/__tests__/` : à reporter une fois les modules portés (audio, catalog, hud, i18n, lives, streak, tour, worlds, loading, migration, thumbnails, skins, idleQueue, perf, transition...).

## État

| Étape | État |
|---|---|
| Copie, renommage, isolation des données, identifiants de production retirés | fait |
| Regroupement du code commun dans `src/core/` | fait (imports réécrits, typecheck et lint propres) |
| Retrait du code propre au labyrinthe | fait (déplacé dans `legacy-maze/`, hors build) |
| Règles, solveur, générateur, niveaux, défis, étoiles, points, aide, mécaniques + tests | fait |
| Rendu 3D du parking (plateau, trottoir, route, places, lignes, obstacles, barrières, flèches, décors Kenney), véhicules procéduraux, sorties, collisions, traînées, vague de brillance, fumée, émoji | fait, **jamais lancé sur un téléphone** (build Android exporté sans erreur, tests de la logique et de la géométrie) |
| Transition entre niveaux par la route (la caméra suit la route jusqu'au parking suivant) | à faire (pour l'instant le niveau suivant remplace l'actuel) |
| Vrais modèles Kenney Car Kit | à faire à la main : le site renvoie 403 aux téléchargements automatiques |
| HUD et écran de jeu, gestes, indice, aide niveaux 1-5, vies, série, résultat, défi du jour | fait (`src/screens/GameScreen.tsx`), jamais lancé sur un téléphone |
| Visite guidée adaptée au parking, coffre de fin d'étape, galerie à l'écran de résultat | à faire |
| Boutique « Véhicules » : 40 véhicules + 12 du Pass VIP (noms FR/EN, raretés et prix de Paint Maze), skin porté par le véhicule à couronne, aperçu 3D qui tourne, vignettes dessinées en code, peinture équipée sur la traînée | fait, jamais lancé sur un téléphone (le type d'objet s'appelle encore `ball` dans les sauvegardes et le code, le joueur voit « véhicule ») |
| Sons du parking | à faire |
| Mesures de performance en build optimisé | à faire (rien à mesurer avant le rendu) |
