# Paint Parking — mise en production sur l'App Store

Ce fichier suit toute la mise en production. Il ne contient AUCUN secret (ni clé privée, ni fichier .p8, ni mot de passe) : seulement des identifiants publics.

Légende : `[x]` fait · `[ ]` à faire · `[~]` en cours / en attente d'une action de ta part.

## Identifiants (non secrets)

| Élément | Valeur |
| --- | --- |
| Nom du jeu (fiche App Store) | Paint Parking: Roll & Color (« Paint Parking » seul est déjà pris) ; nom sous l'icône : Paint Parking |
| Apple ID de l'app (App Store Connect) | 6830656968 |
| SKU | paintparking-ios-001 |
| Projet EAS | @yakisarame1/paint-parking (ID 93c4c7bb-5e9b-4890-a1b2-f5bd396ec42e) |
| Bundle ID | `com.alexgoepfert.paintparking` (proposé par défaut, à confirmer avant la création de la fiche) |
| Slug Expo | `paint-parking` |
| Version / build | 1.0.0 / géré par EAS (incrément automatique) |
| E-mail de support | `alexandregoepfert@gmail.com` (par défaut, à confirmer) |
| Commerçant (DSA) | _à donner_ |
| Domaine / hébergement du site | _à choisir_ |
| Identifiant éditeur AdMob (`pub-…`) | _plus tard (phase 3)_ |
| Identifiants des blocs AdMob (bannière / interstitiel / récompensée) | _plus tard (phase 3)_ |
| Clé API publique RevenueCat (iOS) | _plus tard (phase 4)_ |
| Entitlements RevenueCat | `no_ads`, `vip` |

### Produits (identifiants stables, déjà dans `src/config/monetization.ts`)

| Identifiant | Type | Prix |
| --- | --- | --- |
| `coins_1000` | consommable | 1,99 € |
| `coins_3000` | consommable | 4,99 € |
| `coins_10000` | consommable | 9,99 € |
| `piggy_bank` | consommable | 2,99 € |
| `infinite_lives_1h` | consommable | 0,99 € |
| `infinite_lives_24h` | consommable | 2,99 € |
| `no_ads` | non consommable | 5,99 € |
| `starter_pack` | non consommable | 2,99 € |
| `vip_monthly` | abonnement (groupe « VIP ») | 3,99 € / mois |
| `vip_yearly` | abonnement (groupe « VIP ») | 29,99 € / an |

> Identifiant unique : `no_ads` (renommé depuis `remove_ads` dans le code, les tests et les docs).

## Phase 0 — Audit et informations de départ

- [x] Audit du projet (voir ci-dessous)
- [ ] Nom définitif du jeu, vérifié libre sur l'App Store
- [ ] Bundle ID choisi
- [ ] E-mail de support
- [ ] Nom et adresse de commerçant (DSA)
- [ ] Domaine ou hébergement du site
- [x] **Accord « Paid Apps » + coordonnées bancaires + formulaires fiscaux (W-8BEN)** : acceptés / envoyés le 4 nov. 2026 ; banque et formulaires fiscaux « Actif », contrat payant « Traitement en cours » chez Apple
- [x] **Statut de commerçant (Digital Services Act)** : « En cours de vérification » chez Apple (envoyé le 27 oct. 2026)
- [ ] **DAC7** (Directive relative à la coopération administrative, 7e révision) : « Informations à renseigner » dans App Store Connect → Business → Conformité (à faire par toi)
- [x] `.gitignore` renforcé (secrets) et premier commit

### Audit : ce qui est encore simulé ou réservé au développement

Simulé, à remplacer :
- `src/services/ads.ts` : pubs simulées (écran « PUB (simulation) » dessiné par `src/components/AdHost.tsx`, durée `mockAdSeconds` dans la config) → phase 3.
- `src/services/purchases.ts` : boutique simulée (boîte de dialogue « Achat simulé », reçus gardés dans AsyncStorage) → phase 4.
- `src/services/subscription.ts` : abonnement VIP simulé (même principe) → phase 4.
- `src/services/analytics.ts` : n'écrit que dans la console → phase 5.
- `src/services/leaderboard.ts` : fonction `submitScore` vide (classement en ligne non construit) : on la laisse vide pour la 1.0.
- Les textes « Les achats sont simulés dans cette version de test » (`common.simulatedPurchase(s)` dans les fichiers de langue, affichés dans l'onglet Offres, la tirelire et la fenêtre « Sans pub ») → à supprimer de l'interface en production (phase 1).
- Pas de bannière publicitaire dessinée aujourd'hui : seule la place réservée existe (`adsBannerHeight` dans `src/config/app.ts`) → phase 3.

Réservé au développement (déjà derrière `__DEV__`, donc absent d'un build de production) :
- Menu développeur des Réglages (vies, niveaux, pièces, Pass VIP de test…), écran « Niveaux (dev) » (`src/app/levels.tsx`, redirige hors développement), compteur de FPS, menu de pause « dev ».
- Traces de performance (`src/render/transitionTrace.ts`) : à vérifier qu'elles ne tournent pas en production.

À vérifier / à traiter :
- `app.json` : pas de `bundleIdentifier`, pas de `buildNumber`, pas de `supportsTablet: false`, pas de `ITSAppUsesNonExemptEncryption`, pas encore de `eas.json`.
- Icône iOS : `assets/expo.icon` est **l'icône par défaut d'Expo** (fond bleu et symbole Expo) : à remplacer avant l'envoi (phase 7).
- Les adresses des conditions d'utilisation, de la confidentialité et du support pointent vers le site `https://yalex-ctrl.github.io/paint-parking-site/` (`MONETIZATION.vip.links`) et sont aussi dans Réglages → Informations.
- Les boutons « Sans pub » et la tirelire gardent un texte « achat simulé » même hors développement (voir plus haut).
- Soldes de test : pas de solde de test dans le code de production (le bouton « +1000 pièces » est derrière `__DEV__`).
- Dépendances à ajouter plus tard : `react-native-google-mobile-ads`, `react-native-purchases`, Sentry, un outil de statistiques ; aucune n'est installée aujourd'hui.

## Phase 1 — Configuration du projet
- [ ] app.json (nom, bundleIdentifier, buildNumber, portrait, supportsTablet: false, icône, splash, ITSAppUsesNonExemptEncryption, locales FR/EN, texte ATT FR/EN)
- [ ] eas.json (development / preview / production)
- [ ] Éléments de développement masqués en production, mentions « simulé » retirées
- [ ] Compte Expo, `eas login`, `eas init`

## Phase 2 — Development build et performances réelles
- [ ] iPhone enregistré (`eas device:create`)
- [ ] Premier build development installé et testé
- [ ] Build preview, mesure du passage du pont (trace avant/après)

## Phase 3 — Publicités (AdMob)
- [ ] App iOS + 3 blocs d'annonces + message RGPD + explication ATT
- [ ] Intégration `react-native-google-mobile-ads` (mêmes règles qu'aujourd'hui)
- [ ] Consentement UMP + ATT + réglage « Confidentialité publicitaire »
- [ ] Identifiants de test (development / preview), vrais identifiants seulement en production

## Phase 4 — Achats intégrés et abonnement
- [ ] App créée dans App Store Connect, produits créés (FR/EN + capture de vérification)
- [ ] Clé d'achats intégrés + clé d'API App Store Connect (.p8 gardé hors dépôt)
- [ ] RevenueCat : projet, app, produits, entitlements, offering, notifications serveur
- [ ] Intégration `react-native-purchases`
- [ ] Compte Sandbox, test de chaque produit, restauration, abonnement

## Phase 5 — Crashs et statistiques
- [ ] Sentry (+ sourcemaps)
- [ ] Statistiques respectueuses du RGPD, branchées sur `services/analytics.ts`
- [ ] Tableaux de bord

## Phase 6 — Documents légaux et site web
- [ ] Confidentialité, conditions d'utilisation, mentions légales (FR/EN)
- [ ] Site statique `website/` + `app-ads.txt`
- [ ] Mise en ligne + liens dans l'app

## Phase 7 — Fiche App Store
- [ ] Textes FR/EN finalisés
- [ ] Captures 1320 x 2868 (5 par langue)
- [ ] Icône 1024 x 1024 sans transparence
- [ ] Confidentialité de l'app + classification par âge

## Phase 8 — TestFlight et recette
- [ ] Build production + envoi TestFlight (avec ton accord)
- [ ] Recette complète (liste à détailler)

## Phase 9 — Soumission à Apple
- [ ] Page de la version, notes pour le vérificateur
- [ ] Vérification des causes de refus fréquentes
- [ ] Soumission (avec ton accord)

## Phase 10 — Après la publication
- [ ] AdMob relié à la fiche, `app-ads.txt` vérifié
- [ ] Rapport hebdomadaire (`docs/WEEKLY_REPORT_TEMPLATE.md`)
- [ ] Réglages à surveiller dans `src/config/monetization.ts`

## Bugs / remarques notés (à ne pas corriger sans ton accord)
- _(aucun pour l'instant)_

## Phase 1 — Configuration du projet

- [x] `app.json` : bundle ID, `buildNumber`, `supportsTablet: false`, `ITSAppUsesNonExemptEncryption: false`, textes ATT et nom FR/EN (déjà dans `languages/`)
- [x] `eas.json` : development / preview (outils de test) / production (outils de test coupés, test `__tests__/tester.test.ts`)
- [x] Mentions « achats simulés » masquées hors mode testeur
- [ ] `eas login` + `eas init` (demande ta connexion)

## Phase 2 — Fiche de l'app et produits

- [x] Bundle ID `com.alexgoepfert.paintparking` enregistré (portail développeur)
- [x] Fiche créée le 4 nov. 2026 : iOS, anglais (US), SKU `paintparking-ios-001`
- [x] Produits intégrés (8) et abonnements VIP (2) créés par l'API (`scripts/asc-products.js`) : prix en euros (base France), textes FR/EN, disponibilité mondiale, capture de vérification en 1242×2688 (`scripts/asc-review-screenshots.js`) ; état « READY_TO_SUBMIT », à soumettre avec la première version de l'app
- [x] Clé d'API App Store Connect « Paint Parking » (rôle App Manager) : identifiant de clé `32J6W4WF36`, Issuer ID `25b8fa20-4d7c-4a63-ba6a-b17c02176b15` ; le fichier `.p8` est rangé hors du dépôt (dossier `.appstoreconnect/private_keys` du profil utilisateur), et `*.p8` est ignoré par git
- [x] Clé d'achats intégrés pour RevenueCat : identifiant `6452SBCL97` (fichier `.p8` rangé hors du dépôt, même dossier que l'autre clé)
- [x] Projet RevenueCat « Paint Parking » créé (identifiant `5bf5d9b4`, catégorie Games, React Native) ; reste : configuration de l'app iOS (bundle ID, clés Apple), produits, entitlements `no_ads` et `vip`, offering par défaut, notifications serveur
- [ ] Comptes testeurs Sandbox

## Phase 5 — Achats et abonnement (RevenueCat)

- [x] App iOS « Paint Parking » (identifiant `app7de6f285e9`) dans le projet RevenueCat `5bf5d9b4` ; clé d'achats intégrés (`6452SBCL97`) et clé d'API App Store Connect (`32J6W4WF36`) validées (« Valid credentials »)
- [x] 10 produits importés ; entitlements `no_ads` (produit `no_ads`) et `vip` (produits `vip_monthly`, `vip_yearly`) ; offering `default` (paquets Monthly, Annual, Lifetime)
- [x] Clé publique du SDK iOS (publique, livrée dans l'app) : `appl_dKnOCpUXjXUyifNGZyLTRcgosoB`, dans `eas.json` (variable `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, profils development, preview et production)
- [x] Code : `src/services/revenuecat.ts` branche le vrai magasin sur `PurchasesService` et `SubscriptionStore` ; consommables crédités une seule fois par transaction, achat interrompu crédité au lancement suivant ; en Expo Go ou sans clé, le magasin simulé reste
- [ ] URL de notification serveur Apple (RevenueCat → app → « Apple Server Notification URL » → App Store Connect, informations de l'app) : à copier à la main, RevenueCat la masque
- [ ] Test de chaque produit, restauration et abonnement avec un compte Sandbox (nécessite le build de développement avec `react-native-purchases`)

## État au 4 novembre 2026 (soir)

- [x] AdMob : compte, app « Paint Parking: Roll & Color » (`ca-app-pub-4162283159262767~5199046190`), blocs bannière `…/8535443940`, interstitiel `…/2808299538`, avec récompense `…/8730885069` (dans `eas.json`, profil production) ; `app-ads.txt` publié à la racine de `https://yalex-ctrl.github.io/app-ads.txt`
- [ ] AdMob : message de consentement RGPD (Confidentialité et messages) — impossible à publier tant que l'app n'est pas sur l'App Store (AdMob lit l'URL de confidentialité de la fiche publiée) ; à faire juste après la mise en ligne, avec « Ajouter un magasin d'applications »
- [x] Fiche App Store : textes FR/EN, catégorie, âge, prix gratuit, captures (6,5 pouces), contact de vérification (+33 6 87 82 31 93) et notes pour l'accès à la boutique
- [x] App Privacy : réponses saisies (9 types de données : identifiant utilisateur et appareil, achats, interaction avec le produit, données publicitaires, pannes, performance, autres diagnostics, localisation approximative) ; **à publier par le propriétaire du compte** (attestation légale)
- [ ] Build de production + envoi TestFlight : `npx eas-cli@latest build --platform ios --profile production --auto-submit` (connexion Apple demandée)
- [ ] Soumission à l'examen d'Apple : attend le « go »
