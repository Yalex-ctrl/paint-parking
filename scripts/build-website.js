/**
 * Builds the static website (website/*.html) of Paint Parking: home, privacy policy, terms, legal notice, support. Every page has the French
 * text, then the English one. Run: node scripts/build-website.js. The pages are the source of the public URLs given to App Store Connect.
 *
 * What the privacy policy says must match the SDKs that are really in the app (AdMob, RevenueCat). If a crash reporter or an analytics
 * service is added, update PRIVACY below at the same time.
 */
const fs = require('node:fs');
const path = require('node:path');

const OUT = path.resolve(__dirname, '../website');
const NAME = 'Paint Parking: Roll & Color';
const EMAIL = 'alexandregoepfert@gmail.com';
const OWNER = 'Alexandre Goepfert';
const CITY = 'Issy-les-Moulineaux, France';
const UPDATED_FR = '4 novembre 2026';
const UPDATED_EN = 'November 4, 2026';
const APP_STORE = 'https://apps.apple.com/app/id6830656968';

const page = (title, body) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<header><a class="brand" href="index.html">Paint Parking</a>
<nav><a href="privacy.html">Confidentialité / Privacy</a><a href="terms.html">Conditions / Terms</a><a href="legal.html">Mentions légales / Legal</a><a href="support.html">Support</a></nav></header>
<main>
${body}
</main>
<footer>© 2026 ${OWNER} — <a href="mailto:${EMAIL}">${EMAIL}</a></footer>
</body>
</html>
`;

const PRIVACY = `
<h1>Politique de confidentialité</h1>
<p><em>Dernière mise à jour : ${UPDATED_FR}</em></p>
<p>${NAME} est un jeu de réflexion édité par ${OWNER} (${CITY}). Cette page explique quelles données l'app utilise et pourquoi. Contact : <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>
<h2>Ce qui reste sur ton téléphone</h2>
<p>Ta progression (niveaux, pièces, vies, réglages, balles et peintures débloquées) est enregistrée <strong>uniquement sur ton appareil</strong>. Il n'y a ni compte, ni mot de passe, et nous ne recevons pas ces données.</p>
<h2>Publicités (Google AdMob)</h2>
<p>L'app affiche des publicités avec Google AdMob. Pour les diffuser, Google peut utiliser l'identifiant publicitaire de ton appareil (si tu l'autorises), ton adresse IP, des informations techniques sur l'appareil et sur l'usage de l'app. Quand la loi l’exige, un formulaire de consentement (Google UMP) s’affiche, et la fenêtre d’Apple « Suivi » te laisse choisir : si tu refuses, les publicités restent non personnalisées. Tu peux revoir ton choix à tout moment dans Réglages → Confidentialité publicitaire. Plus d'informations : <a href="https://policies.google.com/technologies/ads">policies.google.com/technologies/ads</a>.</p>
<h2>Achats et abonnement (Apple et RevenueCat)</h2>
<p>Les paiements sont traités par Apple : nous ne voyons jamais ta carte ni tes coordonnées bancaires. Pour valider tes achats et ton abonnement VIP, l'app utilise RevenueCat, qui reçoit un identifiant anonyme d'utilisateur de l'app, les reçus d'achat et l'état de ton abonnement. Cela permet de restaurer tes achats. Politique de RevenueCat : <a href="https://www.revenuecat.com/privacy">revenuecat.com/privacy</a>.</p>
<h2>Ce que nous ne faisons pas</h2>
<p>Nous ne vendons pas tes données, nous ne te demandons ni ton nom, ni ton e-mail, ni ta position, et l'app ne contient pas d'outil de mesure d'audience ou de rapport de plantage tiers dans cette version.</p>
<h2>Durée de conservation et transferts</h2>
<p>Les données de jeu restent sur ton appareil jusqu'à la désinstallation de l'app. Les données traitées par Google et RevenueCat sont conservées selon leurs propres politiques ; elles peuvent être transférées hors de l'Union européenne (notamment aux États-Unis) avec les garanties prévues par le RGPD.</p>
<h2>Tes droits</h2>
<p>Selon le RGPD, tu peux demander l'accès, la rectification ou l'effacement des données qui te concernent, et t'opposer à leur traitement. Écris-nous : <a href="mailto:${EMAIL}">${EMAIL}</a>. Tu peux aussi saisir la CNIL (cnil.fr).</p>
<h2>Enfants</h2>
<p>Le jeu n'est pas destiné aux enfants de moins de 13 ans et ne collecte pas sciemment de données les concernant ; les publicités sont limitées aux contenus tout public.</p>
<h2>Modifications</h2>
<p>Cette politique peut évoluer ; la date de mise à jour est indiquée en haut de la page.</p>
<hr>
<h1>Privacy policy</h1>
<p><em>Last updated: ${UPDATED_EN}</em></p>
<p>${NAME} is a puzzle game published by ${OWNER} (${CITY}). This page explains what data the app uses and why. Contact: <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>
<h2>What stays on your phone</h2>
<p>Your progress (levels, coins, lives, settings, unlocked balls and paints) is stored <strong>only on your device</strong>. There is no account and no password, and we do not receive this data.</p>
<h2>Ads (Google AdMob)</h2>
<p>The app shows ads through Google AdMob. To serve them, Google may use your device's advertising identifier (if you allow it), your IP address, technical device information and how the app is used. Where the law requires it, a consent form (Google UMP) is shown, and Apple’s "Tracking" prompt lets you choose: if you refuse, ads stay non-personalised. You can review your choice at any time in Settings → Ad privacy. More information: <a href="https://policies.google.com/technologies/ads">policies.google.com/technologies/ads</a>.</p>
<h2>Purchases and subscription (Apple and RevenueCat)</h2>
<p>Payments are handled by Apple: we never see your card or bank details. To validate your purchases and your VIP subscription, the app uses RevenueCat, which receives an anonymous app user ID, purchase receipts and your subscription status. This lets you restore your purchases. RevenueCat's policy: <a href="https://www.revenuecat.com/privacy">revenuecat.com/privacy</a>.</p>
<h2>What we do not do</h2>
<p>We do not sell your data, we do not ask for your name, e-mail or location, and this version of the app contains no third-party analytics or crash-reporting tool.</p>
<h2>Retention and transfers</h2>
<p>Game data stays on your device until you uninstall the app. Data processed by Google and RevenueCat is kept according to their own policies; it may be transferred outside the European Union (notably to the United States) with the safeguards provided by the GDPR.</p>
<h2>Your rights</h2>
<p>Under the GDPR you may ask for access, correction or deletion of data about you, and object to its processing. Write to <a href="mailto:${EMAIL}">${EMAIL}</a>. You may also contact your data protection authority.</p>
<h2>Children</h2>
<p>The game is not directed at children under 13 and does not knowingly collect their data; ads are limited to general-audience content.</p>
<h2>Changes</h2>
<p>This policy may change; the update date is shown at the top of the page.</p>
`;

const TERMS = `
<h1>Conditions d'utilisation</h1>
<p><em>Dernière mise à jour : ${UPDATED_FR}</em></p>
<p>En utilisant ${NAME}, tu acceptes ces conditions, en plus du contrat de licence standard d'Apple (<a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Licensed Application End User License Agreement</a>).</p>
<h2>Le jeu et les pièces</h2>
<p>Les pièces, vies, indices, balles et peintures sont des éléments virtuels du jeu : ils n'ont aucune valeur monétaire, ne sont ni remboursables ni échangeables contre de l'argent, et restent liés à ton appareil.</p>
<h2>Achats</h2>
<p>Les achats (packs de pièces, vies infinies, tirelire, « Sans pub », pack de départ) sont payés à Apple et soumis à ses conditions. Les achats permanents (« Sans pub », pack de départ) peuvent être restaurés avec « Restaurer les achats ».</p>
<h2>Abonnement Pass VIP</h2>
<p>Le Pass VIP est un abonnement à renouvellement automatique : <strong>3,99 € par mois</strong> ou <strong>29,99 € par an</strong> (prix indicatifs, ceux de l'App Store font foi). Il donne : plus de pubs forcées, 100 pièces par jour, vies infinies, une balle exclusive par mois et un 2e tour de roue gratuit par jour. Le paiement est débité de ton compte Apple à la confirmation de l'achat. L'abonnement se renouvelle automatiquement à la fin de chaque période, au même prix, sauf si tu l'annules au moins 24 heures avant la fin de la période en cours. Tu peux gérer ou annuler ton abonnement à tout moment dans les réglages de ton compte Apple (Réglages → ton nom → Abonnements). Les balles déjà obtenues te restent.</p>
<h2>Remboursements</h2>
<p>Les remboursements sont gérés par Apple : <a href="https://reportaproblem.apple.com">reportaproblem.apple.com</a>.</p>
<h2>Utilisation</h2>
<p>Tu t'engages à ne pas tricher en modifiant l'app, à ne pas tenter de contourner les achats et à ne pas utiliser le jeu de manière illégale.</p>
<h2>Responsabilité</h2>
<p>Le jeu est fourni « en l'état ». Dans la mesure permise par la loi, l'éditeur n'est pas responsable des dommages indirects liés à son utilisation. Ces conditions sont régies par le droit français.</p>
<hr>
<h1>Terms of use</h1>
<p><em>Last updated: ${UPDATED_EN}</em></p>
<p>By using ${NAME} you accept these terms, in addition to Apple's standard license agreement (<a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Licensed Application End User License Agreement</a>).</p>
<h2>The game and coins</h2>
<p>Coins, lives, hints, balls and paints are virtual items of the game: they have no cash value, are not refundable or exchangeable for money, and are tied to your device.</p>
<h2>Purchases</h2>
<p>Purchases (coin packs, infinite lives, piggy bank, "No ads", starter pack) are paid to Apple and subject to its terms. Permanent purchases ("No ads", starter pack) can be restored with "Restore purchases".</p>
<h2>VIP Pass subscription</h2>
<p>The VIP Pass is an auto-renewing subscription: <strong>€3.99 per month</strong> or <strong>€29.99 per year</strong> (indicative prices; the App Store prices apply). It gives: no forced ads, 100 coins a day, infinite lives, one exclusive ball a month and a 2nd free wheel spin a day. Payment is charged to your Apple account at confirmation of purchase. The subscription renews automatically at the end of each period, at the same price, unless you cancel at least 24 hours before the end of the current period. You can manage or cancel it at any time in your Apple account settings (Settings → your name → Subscriptions). Balls you already earned stay yours.</p>
<h2>Refunds</h2>
<p>Refunds are handled by Apple: <a href="https://reportaproblem.apple.com">reportaproblem.apple.com</a>.</p>
<h2>Use</h2>
<p>You agree not to cheat by modifying the app, not to try to bypass purchases and not to use the game unlawfully.</p>
<h2>Liability</h2>
<p>The game is provided "as is". To the extent permitted by law, the publisher is not liable for indirect damages related to its use. These terms are governed by French law.</p>
`;

const LEGAL = `
<h1>Mentions légales</h1>
<p><strong>Éditeur :</strong> ${OWNER}, ${CITY} — particulier.<br>
<strong>Contact :</strong> <a href="mailto:${EMAIL}">${EMAIL}</a><br>
<strong>Directeur de la publication :</strong> ${OWNER}<br>
<strong>Hébergeur du site :</strong> GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis (GitHub Pages).<br>
<strong>Application :</strong> ${NAME}, distribuée sur l'App Store d'Apple.</p>
<hr>
<h1>Legal notice</h1>
<p><strong>Publisher:</strong> ${OWNER}, ${CITY} — individual.<br>
<strong>Contact:</strong> <a href="mailto:${EMAIL}">${EMAIL}</a><br>
<strong>Website host:</strong> GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA (GitHub Pages).<br>
<strong>Application:</strong> ${NAME}, distributed on Apple's App Store.</p>
`;

const SUPPORT = `
<h1>Support</h1>
<p>Une question, un bug, une idée ? Écris-nous : <a href="mailto:${EMAIL}">${EMAIL}</a>. Indique ton modèle d'iPhone, la version d'iOS et, si possible, le niveau concerné.</p>
<h2>Questions fréquentes</h2>
<h3>Comment restaurer mes achats ?</h3><p>Réglages (engrenage) → <strong>Restaurer les achats</strong>, avec le même compte Apple qu'à l'achat.</p>
<h3>Comment annuler mon abonnement VIP ?</h3><p>Dans les réglages de ton iPhone : ton nom → <strong>Abonnements</strong> → Paint Parking → Annuler. Fais-le au moins 24 h avant le renouvellement.</p>
<h3>J'ai perdu mes vies / mes pièces.</h3><p>Ta progression est enregistrée sur ton appareil : elle ne suit pas si tu changes de téléphone ou réinstalles l'app. Écris-nous, nous regarderons ce qui est possible.</p>
<h3>Comment modifier mon choix sur les publicités ?</h3><p>Réglages → <strong>Confidentialité publicitaire</strong>.</p>
<hr>
<h1>Support</h1>
<p>A question, a bug, an idea? Write to us: <a href="mailto:${EMAIL}">${EMAIL}</a>. Please include your iPhone model, iOS version and, if possible, the level concerned.</p>
<h2>FAQ</h2>
<h3>How do I restore my purchases?</h3><p>Settings (gear) → <strong>Restore purchases</strong>, with the same Apple account you bought with.</p>
<h3>How do I cancel my VIP subscription?</h3><p>In your iPhone settings: your name → <strong>Subscriptions</strong> → Paint Parking → Cancel. Do it at least 24 hours before renewal.</p>
<h3>I lost my lives / coins.</h3><p>Your progress is stored on your device: it does not follow you to a new phone or after a reinstall. Write to us and we will see what is possible.</p>
<h3>How do I change my ad choice?</h3><p>Settings → <strong>Ad privacy</strong>.</p>
`;

const HOME = `
<h1>${NAME}</h1>
<p class="lead">Fais rouler ta balle, peins chaque case, ouvre la sortie. Un jeu de réflexion en 3D, simple à prendre en main et difficile à lâcher.</p>
<p class="lead">Roll your ball, paint every tile, open the exit. A 3D puzzle game that is easy to pick up and hard to put down.</p>
<p><a class="button" href="${APP_STORE}">App Store</a></p>
<ul>
<li>Des centaines de niveaux et un défi du jour / Hundreds of levels and a daily challenge</li>
<li>Balles et peintures à collectionner / Balls and paints to collect</li>
<li>Pass VIP facultatif / Optional VIP Pass</li>
</ul>
`;

const CSS = `:root{--bg:#1d1733;--fg:#f3efff;--soft:#c9bff0;--gold:#ffd24a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #3a2f63}
.brand{font-weight:800;font-size:20px;color:var(--gold);text-decoration:none}nav{display:flex;flex-wrap:wrap;gap:14px}nav a{color:var(--soft);text-decoration:none;font-size:14px}
main{max-width:760px;margin:0 auto;padding:24px 20px 56px}h1{font-size:28px;line-height:1.2;margin:28px 0 8px}h2{font-size:20px;margin:26px 0 6px;color:var(--gold)}h3{font-size:16px;margin:16px 0 2px}
a{color:var(--gold)}hr{border:0;border-top:1px solid #3a2f63;margin:40px 0}.lead{font-size:18px;color:var(--soft)}
.button{display:inline-block;background:var(--gold);color:#2a1d00;font-weight:800;padding:12px 22px;border-radius:999px;text-decoration:none}
footer{text-align:center;color:var(--soft);font-size:13px;padding:24px 20px;border-top:1px solid #3a2f63}`;

fs.mkdirSync(OUT, { recursive: true });
const write = (file, content) => fs.writeFileSync(path.join(OUT, file), content);
write('index.html', page(NAME, HOME));
write('privacy.html', page(`Confidentialité / Privacy — ${NAME}`, PRIVACY));
write('terms.html', page(`Conditions / Terms — ${NAME}`, TERMS));
write('legal.html', page(`Mentions légales / Legal — ${NAME}`, LEGAL));
write('support.html', page(`Support — ${NAME}`, SUPPORT));
write('style.css', CSS);
// app-ads.txt: the AdMob publisher id of Paint Parking (account pub-4162283159262767).
write('app-ads.txt', 'google.com, pub-4162283159262767, DIRECT, f08c47fec0942fa0\n');
write('.nojekyll', '');
console.log('Website written to', OUT);
