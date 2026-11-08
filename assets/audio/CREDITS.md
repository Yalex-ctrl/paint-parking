# Audio credits

Sound effects and jingles: **Kenney** (https://kenney.nl), Impact Sounds, Interface Sounds and Music Jingles, licence **CC0** (public domain, commercial use allowed, no attribution required).
Each was filtered (soft low-pass), levelled and converted to AAC by `scripts/prepare-audio.js`; the plip is also made one octave higher.

| File (assets/audio/sfx/) | Kenney file | Used for |
|---|---|---|
| impact_soft.m4a | impactWood_light_003.ogg | wall hit after a short slide |
| impact_hard.m4a | impactWood_heavy_002.ogg | wall hit after a long slide |
| coin.m4a | confirmation_001.ogg | coin picked up |
| win.m4a | Pizzicato jingles/jingles_PIZZI03.ogg | level won |
| fail.m4a | minimize_006.ogg | out of moves |
| teleport.m4a | switch_005.ogg | portal |
| break.m4a | impactPlank_medium_000.ogg | fragile wall |
| bomb.m4a | impactSoft_heavy_000.ogg | paint bomb |
| stop.m4a | impactSoft_medium_001.ogg | stop tile |
| click.m4a | drop_002.ogg | button |
| popup_open.m4a | maximize_008.ogg | pop-up opens |
| popup_close.m4a | minimize_008.ogg | pop-up closes |
| purchase.m4a | confirmation_004.ogg | purchase done |
| chest.m4a | switch_006.ogg | chest opens |
| world.m4a | Pizzicato jingles/jingles_PIZZI07.ogg | new world |
| tier.m4a | Pizzicato jingles/jingles_PIZZI12.ogg | streak goes up a tier |
| piggy_break.m4a | Pizzicato jingles/jingles_PIZZI15.ogg | piggy bank breaks |
| streak_saved.m4a | Pizzicato jingles/jingles_PIZZI13.ogg | streak kept |
| plip_a.m4a, plip_b.m4a | drop_003.ogg | paint: one note per tile; the 12 notes are these two files played at different speeds |
| door_open.m4a | footstep_wood_001.ogg + confirmation_002.ogg (delayed 140 ms) | the exit door opens: wood slide + light chime |

Music: `paint_maze_ambiance_douce.m4a`, supplied with the project.

## Sounds of the parking

Synthesised in code by `scripts/make-parking-sounds.js` (the Kenney packs could not be downloaded automatically). Soft by construction: low-passed, gentle attacks, quiet peak.

| File (assets/audio/sfx/) | Used for |
|---|---|
| engine_start.wav | an engine turning over, when a vehicle leaves |
| vroom.wav | the small "vroum" as it pulls away |
| horn.wav | the short soft horn at a collision |
| pouet.wav | the squeak of the angry emoji |
| barrier.wav | a barrier opens |
