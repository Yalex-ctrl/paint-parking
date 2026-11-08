# Pass VIP : mettre en place l'abonnement (RevenueCat)

Dans l'app, l'abonnement est **simulé** (Expo Go) : l'achat affiche une confirmation puis réussit. Tout est déjà structuré pour
RevenueCat : le jour où tu branches le vrai magasin, seul `src/services/subscription.ts` change (une classe de plus et un appel).

## 1. Ce que le code attend

| Élément | Valeur | Où |
| --- | --- | --- |
| Entitlement RevenueCat | `vip` | `MONETIZATION.vip.entitlement` |
| Produit mensuel | `vip_monthly` — 3,99 €/mois | `MONETIZATION.vip.products.monthly` |
| Produit annuel | `vip_yearly` — 29,99 €/an | `MONETIZATION.vip.products.yearly` |
| Essai gratuit | aucun (`trialDays: 0`) | `MONETIZATION.vip.trialDays` |
| Jours de grâce | 16 | `MONETIZATION.vip.graceDays` |
| Liens | CGU, confidentialité, gestion | `MONETIZATION.vip.links` |

Les prix de `monetization.ts` sont ceux de la maquette. Une fois RevenueCat branché, affiche plutôt `package.product.priceString`
(le prix localisé de chaque pays) à la place de `formatEur(...)` dans `src/app/vip.tsx` et `src/components/VipParts.tsx`.

## 2. App Store Connect

1. **Accords, taxes et banque** : Business → remplis l'accord « Apps payantes » (sans lui, aucun achat ne marche, même en test).
2. **Groupe d'abonnements** : ton app → Monétisation → Abonnements → crée le groupe « Pass VIP ».
3. Dans ce groupe, crée deux abonnements à renouvellement automatique :
   - ID de produit `vip_monthly`, durée 1 mois, prix 3,99 € (palier de prix le plus proche dans chaque pays) ;
   - ID de produit `vip_yearly`, durée 1 an, prix 29,99 €.
   - Mets l'annuel au **niveau 1** du groupe et le mensuel au niveau 2 (l'annuel est le choix mis en avant).
4. Pour chacun : nom affiché et description (voir `docs/store/fr.md` et `docs/store/en.md`), capture d'écran de l'écran
   d'abonnement (le paywall), puis soumets-les avec la version de l'app.
5. **Offre d'introduction** : ne crée rien pour le moment (pas d'essai). Si tu en ajoutes une un jour, mets aussi
   `MONETIZATION.vip.trialDays` : le paywall affichera « N jours gratuits, puis … ».
6. **Liens obligatoires** : renseigne l'URL de la politique de confidentialité dans la fiche de l'app, et le contrat de licence
   (CLUF) standard d'Apple ou le tien. Mets les mêmes URL dans `MONETIZATION.vip.links.terms` et `.privacy` (elles sont
   aujourd'hui des adresses d'exemple : **à remplacer avant la soumission**, sinon l'app sera refusée).
7. **Testeurs** : Utilisateurs et accès → Sandbox → crée un compte testeur ; sur l'iPhone, connecte-le dans Réglages → App Store →
   Compte Sandbox. En sandbox, un mois dure 5 minutes : on voit tout le cycle (renouvellements, expiration) en une demi-heure.

## 3. RevenueCat

1. Crée un projet, ajoute l'app iOS avec son Bundle ID, et colle la **clé API publique iOS** (jamais la clé secrète dans l'app).
2. Products → ajoute `vip_monthly` et `vip_yearly`.
3. Entitlements → crée **`vip`** et attache les deux produits.
4. Offerings → l'offering `default` avec deux packages : `$rc_annual` (`vip_yearly`) et `$rc_monthly` (`vip_monthly`).
5. Dans « App Store Connect API / In-App Purchase key », ajoute la clé que RevenueCat demande (elle vérifie les reçus).

## 4. Brancher dans l'app (build de développement, pas Expo Go)

```bash
npx expo install react-native-purchases
```

Ajoute le plugin dans `app.json` si la doc de la version le demande, puis fais un build de développement
(`eas build --profile development --platform ios`). Ensuite, dans `src/services/subscription.ts` :

```ts
import Purchases from 'react-native-purchases';

class RevenueCatStore implements SubscriptionStore {
  async purchase(plan) {
    const offerings = await Purchases.getOfferings();
    const pkg = plan === 'yearly' ? offerings.current?.annual : offerings.current?.monthly;
    if (!pkg) return 'failed';
    try {
      await Purchases.purchasePackage(pkg);
      return 'purchased';
    } catch (e: any) {
      return e.userCancelled ? 'cancelled' : 'failed';
    }
  }
  async entitlement() {
    try {
      const info = await Purchases.getCustomerInfo();
      const e = info.entitlements.all[MONETIZATION.vip.entitlement];
      if (!e) return { active: false, plan: 'monthly', expiresAt: 0, inGrace: false };
      return {
        active: e.isActive,
        plan: e.productIdentifier === MONETIZATION.vip.products.yearly.id ? 'yearly' : 'monthly',
        expiresAt: e.expirationDateMillis ?? 0,
        inGrace: e.billingIssueDetectedAt !== null && e.isActive,
      };
    } catch {
      return null; // hors ligne : on garde la valeur gardée sur le téléphone
    }
  }
  async restore() {
    await Purchases.restorePurchases();
    return this.entitlement();
  }
}
```

Puis, une seule fois au démarrage (avant `startSubscriptionWatch`) : `Purchases.configure({ apiKey })` et
`setSubscriptionStore(new RevenueCatStore())`. Rien d'autre ne change : les écrans, les règles (`src/game/vip.ts`) et les tests ne
parlent qu'à `subscription.ts`.

## 5. Comment l'app tient son état

- Le profil garde une **copie** de l'abonnement (formule, fin de période, période de grâce) : le Pass VIP marche hors ligne.
- Il est revérifié au lancement et à chaque retour de l'app au premier plan (`startSubscriptionWatch`).
- Fin de période + jours de grâce dépassés → le Pass s'arrête : pubs et vies reviennent, les balles VIP déjà reçues restent.
- « Remettre à zéro » n'efface **pas** l'abonnement (ni les balles déjà reçues) : c'est le magasin qui le possède.
- Une balle VIP par mois payé (12 au total, dans l'ordre de `MONETIZATION.vip.balls`), conservées après résiliation.

## 6. Menu développeur (Réglages, en mode dev)

« Pass VIP (développeur) » : activer mensuel / annuel, faire expirer, simuler un renouvellement, période de grâce, réinitialiser.

## 7. Avant de soumettre : la liste de contrôle d'Apple

- [ ] Le paywall montre : le nom du Pass, ce qu'il donne, le **prix complet** de chaque formule, la durée, le renouvellement
      automatique et comment résilier (texte déjà en place, FR et EN).
- [ ] Liens « Conditions d'utilisation » et « Politique de confidentialité » qui ouvrent de vraies pages.
- [ ] Bouton « Restaurer les achats » (paywall, Offres, Réglages).
- [ ] Croix de fermeture visible tout de suite, sans attendre.
- [ ] « Gérer mon abonnement » → https://apps.apple.com/account/subscriptions
- [ ] Les deux abonnements sont soumis avec la version et ont chacun une capture d'écran.
- [ ] Testé en sandbox : achat, restauration, résiliation, expiration, retour de l'app après plusieurs jours.

## 8. Les autres produits de la boutique (achats ponctuels)

À créer dans App Store Connect (Monétisation → Achats intégrés) avec exactement ces identifiants, aussi attachés à l'offering `default` de RevenueCat.

| Identifiant | Type | Prix |
| --- | --- | --- |
| `coins_1000` | consommable | 1,99 € |
| `coins_3000` | consommable | 4,99 € |
| `coins_10000` | consommable | 9,99 € |
| `piggy_bank` | consommable | 2,99 € |
| `infinite_lives_1h` | consommable | 0,99 € |
| `infinite_lives_24h` | consommable | 2,99 € |
| `starter_pack` | non consommable (une seule fois, proposé 48 h) | 2,99 € |
| `no_ads` | non consommable | 5,99 € |

Les vies infinies (1 h et 24 h) s'additionnent : racheter pendant qu'elles tournent ajoute la durée à ce qui reste (`grantInfinite` dans `src/game/lives.ts`). Elles ne s'achètent plus avec des pièces. Tous les prix sont dans `src/config/monetization.ts` (`priceEur`) et affichés par `Intl` ; une fois RevenueCat branché, affiche le prix localisé du store.
