import { SHOP_ITEMS } from '../src/core/shopItems';
import { ACTIVE_PLAYER, giftCoins, simulate, TYPICAL_PLAYER, VIP_PLAYER, type SimPlayer } from '../src/core/economySim';

// 30 days of play, and a few more days so the legendary purchase shows up.
function report(name: string, player: SimPlayer) {
  const r = simulate({ ...player, days: 150 });
  const avg = r.perDay.reduce((a, b) => a + b, 0) / r.perDay.length;
  console.log(`\n== ${name} (${player.playMinutes} min/jour, ${player.rewardedAds} pubs récompensées/jour, ${player.levelsPerDay} niveaux/jour)`);
  console.log('Pièces gagnées par jour:', r.perDay.join(' '));
  console.log(`Moyenne par jour: ${avg.toFixed(0)} (dont Cadeaux: ${giftCoins(player).toFixed(0)})   par niveau (dès le 6): ${r.perLevel.toFixed(1)}`);
  console.log('Premier achat de chaque rareté (jour):', JSON.stringify(r.firstBuy));
  console.log(`Dépensé ${r.spent}, reste ${r.coinsLeft}`);
}
report('Joueur typique', TYPICAL_PLAYER);
report('Joueur très actif', ACTIVE_PLAYER);
report('Abonné VIP (joueur typique + Pass VIP)', VIP_PLAYER);
console.log('\nPrix:');
for (const i of SHOP_ITEMS) console.log(`${i.kind.padEnd(5)} ${i.id.padEnd(14)} ${i.rarity.padEnd(9)} ${i.price ?? (i.exclusive ? `exclusif (${i.exclusive})` : 'gratuit')}`);
