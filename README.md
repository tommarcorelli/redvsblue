# 🔴🔵 Red vs Blue — Simulateur Attaque / Défense

Un labo de cybersécurité 100 % statique, jouable dans le navigateur : vous
compromettez un système simulé (phase **attaque**), puis vous durcissez la
configuration que vous venez d'exploiter pour empêcher la même attaque de
fonctionner à nouveau (phase **défense**). Aucun système réel n'est touché —
tout tourne dans un faux terminal, avec un système de fichiers, des
utilisateurs et des services entièrement simulés en JavaScript.

Le projet ne dépend d'aucun backend, d'aucune base de données et d'aucune
clé API : c'est du HTML/CSS/JS pur, hébergeable tel quel sur GitHub Pages
(ou n'importe quel hébergeur statique), et installable en PWA pour un usage
hors-ligne.

## 🚀 Lancer le projet

Aucune installation n'est nécessaire.

- **En local, le plus simple** : ouvrez `index.html` directement dans un
  navigateur.
- **Avec un petit serveur local** (recommandé pour que le service worker
  fonctionne comme en production) :
  ```bash
  python3 -m http.server 8000
  # puis ouvrez http://localhost:8000
  ```
- **En ligne** : servez le dossier tel quel depuis GitHub Pages, Netlify,
  Vercel ou tout hébergeur statique — il n'y a rien à builder.

## ✅ Vérifier l'intégrité des scénarios

Un script de test (Node pur, aucune dépendance) rejoue automatiquement
les vérifications structurelles refaites à la main à chaque ajout de
scénario : cohérence des ids entre `scenarios.js` et les fichiers de
métadonnées, structure du système de fichiers simulé, invariant d'état
initial (un scénario neuf n'est jamais déjà « corrigé »), et un solveur
best-effort qui rejoue les commandes citées dans les indices d'attaque.

```bash
node test/validate-scenarios.js
# ou, si npm est disponible :
npm test
```

## ✨ Fonctionnalités

- **74 scénarios attaque/défense** couvrant 7 grandes familles techniques :
  élévation de privilèges Linux, réseau & annuaires (dont Memcached,
  session nulle SMB, empoisonnement LLMNR/NBT-NS, relais NTLM faute
  de signature SMB, chaîne de communauté SNMP par défaut et module
  rsync anonyme), conteneurs & orchestration (dont RBAC Kubernetes
  trop permissif, PID namespace hôte partagé, NetworkPolicy absente,
  etcd non authentifié, évasion via cgroup release_agent, secret en
  clair exposé via pods/exec et API Docker distante non authentifiée),
  cloud & infrastructure as code (dont identité, secrets, confusion de
  dépendances, chaîne d'approvisionnement Terraform non épinglée et
  politique de ressource cloud trop permissive), applications web (dont IDOR, mass assignment, exposition
  excessive de données, absence de limitation de débit côté API,
  introspection GraphQL non protégée, CORS mal configuré, absence de
  jeton CSRF et entité externe XML non désactivée),
  Active Directory / Windows (AS-REP Roasting, délégation Kerberos,
  DCSync, GPO, Kerberoasting, Pass-the-Hash, Silver Ticket, abus d'ACL
  GenericAll, abus de délégation contrainte S4U2Proxy, mot de passe
  GPP cpassword laissé dans SYSVOL, modèle de certificat ADCS mal
  configuré ESC1 et Zerologon), et mobile & API embarquées (clé API
  codée en dur dans un APK décompilé, absence d'épinglage de
  certificat et redirect_uri OAuth non validé).
- **Scénarios chaînés** : mouvement latéral réel sur plusieurs machines
  (clé SSH oubliée → pivot interne → identifiants trouvés → pivot final).
- **Bac à sable** : système et faille tirés au hasard, sans script guidé,
  pour s'entraîner librement — avec **mode revanche** pour retenter
  spécifiquement un scénario déjà résolu avec beaucoup d'indices ou de
  temps (attaque *et* défense).
- **Faille du jour** : un scénario identique pour tout le monde chaque jour
  (façon Wordle), avec série de jours consécutifs et classement du jour
  simulé localement.
- **Mode Examen chronométré** : un lot de 5, 8 ou 12 systèmes tirés au
  hasard à traiter entièrement (attaque *puis* défense) avant l'expiration
  d'un temps global — façon certification blanche, avec historique local
  des sessions passées.
- **Mode duel** : deux joueurs en local, un terminal attaquant et un
  terminal défenseur synchronisés en simultané.
- **Génération procédurale** et **éditeur de scénario** sans code, pour
  créer ses propres CTF.
- **Mode Apprendre** : une leçon par scénario, pour comprendre la faille
  sans forcément la rejouer.
- **Fiches techniques** : pour chacun des 74 scénarios, une fiche
  imprimable/exportable en HTML autonome (bouton dédié sur l'écran de
  briefing) qui rattache la faille à une référence réelle — CVE, technique
  MITRE ATT&CK, outil ou incident documenté — avec la méthode d'attaque et
  la remédiation, réutilisées depuis les données du scénario.
- **Accessibilité clavier & ARIA** : modales avec piège de focus et fermeture
  à l'Échap, cartes de leçon utilisables au clavier, onglet actif annoncé
  aux lecteurs d'écran, terminal en région live.
- **Glossaire pédagogique** : 50 termes transverses (SUID, JWT, Kerberoasting,
  IAM, SSRF...) consultables et filtrables à tout moment depuis l'onglet
  Apprendre, indépendamment de tout scénario précis.
- **Autocomplétion Tab** dans le terminal : commandes et chemins de
  fichiers/dossiers, avec préfixe commun et liste des candidats au second Tab,
  comme un vrai shell.
- **Recherche et filtres dans les dossiers** : un champ de recherche libre
  (titre, catégorie, référence réelle) et des menus par famille technique et
  par statut, pour retrouver en un instant un scénario donné parmi les 74.
- **Vue diff avant/après correctif** : en phase de défense, `verify` et
  `replay` affichent un panneau repliable qui compare ligne à ligne le
  fichier de configuration d'origine (vulnérable) à son état actuel —
  pour voir concrètement ce que le correctif a changé, pas seulement
  s'il a fonctionné.
- **Mentor contextuel** : conseils socratiques par famille technique,
  jamais la commande exacte — pour s'entraîner à raisonner plutôt qu'à
  chercher un indice.
- **Difficulté adaptative** : plus votre série sans indice grandit, plus le
  mode guidé se fait discret et plus vous avez de commandes "gratuites"
  avant pénalité de score.
- **Bilan de progression** : radar de compétences par famille, temps moyen,
  taux d'indices, courbe de score dans le temps.
- **Scoring, chronomètre, classement local, succès (achievements)**,
  export d'un rapport de session en Markdown, et replay cinématique
  exportable en HTML autonome.
- **PWA installable**, jouable hors-ligne une fois visité une première fois.

Le détail complet, version par version, est dans [`roadmap.md`](roadmap.md).

## 🗂️ Structure du projet

```
index.html          Écran d'accueil, tous les onglets (parcours, bac à
                     sable, faille du jour, chaînes, Bilan, éditeur...)
duel.html            Page dédiée au mode duel (deux terminaux synchronisés)
manifest.json / sw.js  PWA (installation + cache hors-ligne)
css/style.css         Tout le style du projet
js/
  scenarios.js         Les 74 scénarios (vfs, règles d'exploit, correctifs)
  chains.js            Les scénarios chaînés multi-machines
  factsheets.js         Fiches techniques imprimables (référence réelle par
                        scénario : CVE, technique MITRE ATT&CK, incident)
  diffview.js            Vue diff avant/après correctif (comparaison ligne
                        à ligne des fichiers de configuration modifiés)
  autocomplete.js         Autocomplétion Tab du terminal (commandes, chemins)
  glossary.js             Glossaire pédagogique transverse (50 termes)
  a11y.js                 Accessibilité : piège de focus + Échap pour les modales
  engine.js             Cœur du jeu : terminal, système de fichiers simulé,
                        interpréteur de commandes, phases attaque/défense
  exam.js                Mode Examen chronométré (formats, chrono global,
                        historique local des sessions)
  progression.js         Scoring, classement, succès, faille du jour,
                        difficulté adaptative, mentor contextuel
  network-map.js         Topologie réseau interactive (SVG)
  procedural.js           Génération procédurale de scénarios
  editor.js               Éditeur de scénario sans code
  duel.js / recap.js       Mode duel / récap cinématique exportable
  ui.js / main.js / hero-fx.js   Rendu d'écran, navigation, page d'accueil
test/
  validate-scenarios.js   Script de test Node (aucune dépendance) : cohérence
                        des ids, structure du vfs simulé, invariant d'état
                        initial, solveur best-effort à partir des indices
```

## 🛠️ Stack technique

HTML, CSS et JavaScript vanilla — aucune dépendance, aucun bundler, aucune
étape de build. Tout le "système de fichiers" et l'interpréteur de
commandes simulés sont écrits à la main dans `js/engine.js`.

## 📄 Licence

Aucune licence n'est définie pour l'instant. Si vous comptez publier ou
partager ce dépôt plus largement, pensez à ajouter un fichier `LICENSE`
correspondant à l'usage que vous souhaitez en permettre.
