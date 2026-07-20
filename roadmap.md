# Roadmap — Red vs Blue

Backlog complet des évolutions envisagées pour le simulateur attaque/défense.
La page d'accueil du jeu affiche une version condensée (timeline `v0.2` → `v2.0`) ;
ce fichier est la version détaillée, y compris les idées plus ambitieuses pas encore engagées.

Légende des tags : 🔴 attaque · 🔵 défense · 🟡 système/UX · 🟢 grosse feature / social

---

## Court terme

### v0.2 — Nouveaux scénarios 🔴
**Statut : fait** (ajoutés dans cette session)
- Partage NFS exporté avec `no_root_squash`
- Transfert de zone DNS ouvert (AXFR)
- Bind LDAP anonyme laissé actif
- Chemin de service Windows non guillemeté (simulé via partage monté `/mnt/c`)

### v0.2bis — Extension du pack de scénarios 🔴
**Statut : fait** (7 scénarios supplémentaires, portant le total à 15)
- Socket Docker exposé en écriture (évasion de conteneur via montage de la racine hôte)
- Capacité `cap_setuid+ep` oubliée sur un interpréteur Python (alternative moderne au bit SUID, non visible via `ls`)
- Détournement de `$PATH` par une tâche cron root appelant une commande sans chemin absolu
- `/etc/passwd` modifiable par tous (ajout d'un compte UID 0)
- `/etc/shadow` lisible par tous (fuite des empreintes de mots de passe)
- Règle sudo conservant `LD_PRELOAD` (`env_keep+=LD_PRELOAD`) sur un binaire NOPASSWD
- Unité systemd exécutant un script root modifiable par tous (variante du cron writable, autre vecteur de déclenchement)

À cette occasion, un bug latent de `canWrite()` a été corrigé (le triplet de permissions vérifié pour le propriétaire d'un fichier était celui du groupe au lieu du propriétaire), et `ls -la` gère désormais le cas d'un fichier ciblé directement (et non plus seulement un dossier).

### v0.2ter — Pack « surfaces modernes » 🔴
**Statut : fait** (16 scénarios supplémentaires, portant le total à 31)
- Injection par caractère générique (`tar` wildcard / GTFOBins `--checkpoint-action`) via une tâche cron root sur un dossier world-writable
- PwnKit — CVE-2021-4034 : dépassement de l'analyse d'arguments (argc=0) de `pkexec`
- Serveur Redis exposé sans authentification, détourné pour écrire une clé SSH dans `/root/.ssh/authorized_keys`
- SSRF applicatif vers l'API de métadonnées cloud IMDSv1, vol des identifiants IAM temporaires (à la Capital One)
- Dossier `.git` exposé publiquement sur le serveur web, reconstruction de l'historique et fuite d'identifiants codés en dur
- Pod Kubernetes privilégié avec volume `hostPath` sur `/`, évasion vers le nœud faute de contrôleur d'admission
- Falsification de jeton JWT signé avec l'algorithme `none`, non vérifié côté serveur
- Log4Shell (CVE-2021-44228) : injection JNDI via un en-tête User-Agent journalisé par une version vulnérable de log4j
- Capacité Linux `cap_dac_read_search` oubliée sur l'interpréteur Python, contournant les permissions de lecture
- Bucket de stockage objet S3 accessible publiquement en lecture, sauvegarde de base de données exfiltrée
- Fichier d'état Terraform (`terraform.tfstate`) lisible par tous, secrets d'infrastructure en clair
- Console de scripts Groovy Jenkins accessible sans authentification (RCE côté CI/CD)
- Désérialisation non sécurisée d'un objet Python (`pickle.loads`) transmis dans un cookie de session
- Injection de gabarit côté serveur (SSTI) dans une application Flask/Jinja2 utilisant `render_template_string`
- Cluster Elasticsearch accessible sans authentification, exfiltration de données clients
- Registre Docker interne sans authentification, exploité pour empoisonner l'image de production (chaîne d'approvisionnement)

Ce pack élargit volontairement le périmètre au-delà des mauvaises configurations Linux classiques : service réseau non authentifié, cloud/SSRF, stockage objet, IaC, fuite de code source côté web, API et JWT, CVE applicative majeure, CI/CD, désérialisation, SSTI, chaîne d'approvisionnement, orchestrateur de conteneurs. Un easter egg (idée non planifiée ci-dessous) a également été glissé en tête de `scenarios.js`.

### v0.3 — Interpréteur renforcé 🟡
**Statut : fait**
- Pipes (`|`) entre commandes, avec un jeu de filtres façon coreutils : `grep [-v] <motif>`, `wc [-l]`, `sort [-r]`, `uniq`, `head [-n N]`, `tail [-n N]`, `cut -d<sep> -f<N>` — utilisables après `ls`, `cat`, `history`, `ps`, `env`, etc.
- Redirections `>` (écrase) et `>>` (ajoute) vers un fichier, notamment via `echo '...' > fichier` — une alternative pratique à `nano` pour injecter du contenu dans les scénarios d'écriture de script.
- Variables d'environnement (`$HOME`, `$PATH`, `$USER`, `$SHELL`) substituées dans les commandes (hors guillemets simples, comme en bash réel), plus les commandes `env` et `export NOM=valeur`.
- Historique navigable avec les flèches ↑ / ↓ dans le terminal.

Le refactoring conserve un principe strict de non-régression : les règles d'exploitation (`exploitRules`) de chaque scénario gardent la priorité absolue et sont testées avant toute interprétation de pipe ou de redirection, donc aucun des 31 scénarios existants n'est affecté par ces nouveautés (vérifié par rejeu automatisé de chacun).

### v0.4 — Scoring & chronométrage 🟡
**Statut : fait**
- Score par phase (base 1000 pts, pénalités par commande au-delà de 3, par indice utilisé et par tranche de temps écoulée), calculé et figé à la première réussite de chaque phase
- Chronomètre live affiché dans le HUD du terminal (mis à jour chaque seconde et à chaque commande)
- Classement local (`localStorage`) alimenté à la fin d'un parcours complet (pseudo saisi dans une modale dédiée), consultable et trié sur l'écran d'accueil
- Export JSON du classement (`⇩ Exporter`) et réinitialisation (`🗑 Effacer le classement`)

### v0.5 — Rapport de session 🔵
**Statut : fait**
- Export Markdown (`.md`) téléchargé côté client : synthèse (score, temps, succès), tableau détaillé des 31 systèmes (statut attaque/défense, score, indices, verdict `replay`), et classement local
- Utile pour justifier un exercice en soutenance BTS — aucune donnée n'a quitté le navigateur

---

## Moyen terme

### v0.6 — Visualisation réseau 🟡
**Statut : fait**
- Nouvelle section « Topologie du réseau cible » sur l'écran d'accueil : les 31 scénarios deviennent des nœuds SVG cliquables, regroupés en 5 familles techniques (Linux local, Réseau & annuaires, Conteneurs & orchestration, Cloud & IaC, Applications web) reliées à un cœur `target-lab`, façon Packet Tracer
- Couleur/état du nœud synchronisés avec la progression (verrouillé / non tenté / attaqué / sécurisé), panneau de détail au survol, clic pour ouvrir directement le dossier
- La sidebar textuelle du jeu est conservée telle quelle (accessibilité et lisibilité en cours de scénario) ; la topologie vient en complément sur l'accueil plutôt qu'en remplacement strict de la sidebar

### v0.7 — Mode bac à sable 🔴
**Statut : fait**
- Système et faille tirés aléatoirement parmi les 31 scénarios du pool complet
- Pas de script guidé imposé : la sidebar bascule sur un panneau dédié (statistiques + tirage suivant) et n'affecte jamais la progression du parcours principal
- Statistiques persistées (défis résolus, meilleur temps) affichées en jeu et sur l'écran d'accueil

### v0.8 — Ambiance sonore 🟡
**Statut : fait**
- Bips synthétisés à la volée (WebAudio, aucun fichier audio requis) : frappe de commande, erreur, indice, compromission, correctif appliqué, succès débloqué
- Coupée par défaut ; bascule 🔊/🔇 disponible sur l'écran d'accueil et dans le jeu, préférence mémorisée

### v0.9 — Mode face-à-face local 🟢
**Statut : fait**
- Nouvelle page `duel.html`, accessible depuis l'onglet **⚔️ Duel** de l'accueil : deux joueurs sur le même écran, un système tiré (ou choisi) en commun, l'un attaque pendant que l'autre défend, en simultané
- Techniquement : deux `<iframe>` chargent chacune une instance indépendante du jeu (`index.html?mode=duel&side=red|blue&idx=N`) avec son propre moteur, sa propre VFS et son propre terminal — aucun risque de régression sur le parcours principal
- Synchronisation par `postMessage` : les deux postes signalent leur disponibilité, la page parente lance un compte à rebours commun (3-2-1-GO) puis démarre les deux phases au même instant ; chrono partagé affiché au-dessus de chaque poste
- Première phase terminée (attaque *ou* défense) déclenche la bannière de victoire avec les deux temps ; bouton « Nouveau duel » pour relancer avec un système différent
- Mode strictement isolé : ne touche ni `localStorage` de progression, ni le classement, ni le bac à sable (nouveaux champs `game.duel` / `game.duelDone`, branches dédiées dans `checkAutoWin`)

---

## Grandes ambitions

### v1.0 — Scénarios chaînés 🔴
**Statut : fait**
- Nouvelle chaîne « Rebond de bout en bout » : 3 machines réellement distinctes (`web-frontend`, `app-internal`, `db-core`), chacune avec son propre système de fichiers — contrairement aux 3 premières chaînes (v0.6) qui simulaient le pivot sur un seul système de fichiers partagé
- Mouvement latéral réel : clé SSH oubliée → pivot vers `app-internal` (hôte non exposé) → identifiants de base en clair trouvés dans un script de sauvegarde → pivot final par `sshpass` vers `db-core` en root
- Support ajouté au moteur pour toute chaîne multi-machines : `game.host` / `game.hosts`, fonction `pivotHost()`, prompt et bannière d'accueil qui affichent l'hôte courant — rétrocompatible avec les 3 chaînes mono-machine existantes (`chain.makeVfs()` toujours supporté telle quelle)

### v1.1 — Personnalisation 🟡
**Statut : fait**
- Sélecteur de thème dans la nav d'accueil (🌑 Sombre / 🔆 Clair / ◐ Contraste élevé), choix persisté en `localStorage` et appliqué avant le premier rendu (pas de flash)
- Thème clair "rapport d'audit" : fond clair, texte sombre, accents rouge/bleu recalculés pour un bon contraste sur fond blanc
- Thème contraste élevé : noir pur / blanc pur, accents saturés, contours de focus renforcés — le terminal reste volontairement noir dans les deux thèmes (comme une vraie fenêtre de terminal)
- Repose entièrement sur les variables CSS déjà en place (`--bg`, `--text`, `--line`, etc.), donc l'ensemble de l'interface se réthème sans avoir dû retoucher chaque composant un par un

### v1.2 — Faille du jour 🟢
**Statut : fait**
- Nouvel onglet **🗓️ Faille du jour** : un système tiré au sort par hachage de la date du jour (`YYYY-MM-DD`), donc identique pour tout le monde ce jour-là, façon Wordle
- Une résolution par jour compte pour la série ; rejouer le même jour est autorisé pour s'entraîner mais ne modifie ni la série ni l'historique
- Série (jours consécutifs) et nombre total de failles du jour résolues persistés en `localStorage`, la série se réinitialise à 1 en cas de jour manqué
- Mode isolé de la progression principale (nouveaux `game.daily` / `game.dailyDone`, branche dédiée dans `checkAutoWin`, sur le même modèle que le bac à sable et le mode duel)
- *Non fait (extension future possible) : mini classement partagé du jour, qui nécessiterait un backend léger.*

### v1.3 — Replay cinématique exportable 🟢
**Statut : fait**
- Chaque ligne affichée dans le terminal (`print()`) est désormais aussi enregistrée dans `game.transcript` ; la modale de fin de phase propose un bouton **🎬 Revoir la session** dès qu'il y a de quoi rejouer — couvre attaque, défense, bac à sable, duel, faille du jour et chaînes en un seul point d'intégration
- Nouvel écran **Récap** : lecture animée ligne par ligne (effet machine à écrire), lecture/pause, retour au début, vitesse ×1/×2/×4, curseur de progression pour naviguer directement dans la session
- Export en fichier **HTML autonome** (`⇩ Télécharger (.html)`) : aucune dépendance externe ni encodage GIF/vidéo (hors contrainte "zéro dépendance" du projet), mais un fichier qui se rejoue tout seul dans n'importe quel navigateur, pratique à joindre à une soutenance ou à partager

### v2.0 — Génération procédurale & éditeur de CTF 🟢
**Statut : fait**
- Nouvel onglet **🧬 Généré** : scénarios construits à la volée par permutation de 2 modèles paramétrés (secret exposé par des permissions trop larges, binaire SUID oublié) — entreprise, compte de service, chemin de fichier et jeton de drapeau tirés au hasard à chaque partie, donc jamais deux fois le même système
- Nouvel onglet **🛠️ Éditeur** : un professeur ou un étudiant construit son propre système fichier par fichier (chemin, type, permission, propriétaire, contenu), définit un objectif attaque (« trouver un drapeau ») et un objectif défense (« corriger une permission »), sans écrire une ligne de code
- Scénarios personnalisés sauvegardés en `localStorage`, exportables/importables en JSON pour être partagés entre navigateurs (utile en classe, sans backend)
- Techniquement : `buildVfsFromEntries()` (utilitaire partagé) construit une arborescence complète à partir d'une liste plate de fichiers ; `applyScenarioState()` a été extrait de `startPhase()` pour être réutilisé par les modes généré/éditeur ; `checkAutoWin()` a gagné deux branches dédiées (`game.procedural` / `game.custom`), isolées de la progression principale sur le même modèle que le bac à sable, la faille du jour et le duel
- *Non fait (limite assumée) : la génération procédurale se limite à 2 modèles paramétrés plutôt qu'une synthèse ouverte d'exploits ; l'éditeur ne couvre que les failles de type « fuite d'information » et « permission à corriger », pas les binaires SUID ou les chaînes multi-étapes personnalisées.*

### v2.1 — Difficulté adaptative 🟡
**Statut : fait**
- Série de phases (attaque, défense ou étape de chaîne) réussies consécutivement sans le moindre indice, suivie en `localStorage` (`redvsblue_adaptive_v1`) et affichée dans le HUD (`🎯 N sans indice`, mise en évidence dorée une fois le seuil atteint)
- La série se remet à zéro dès qu'un indice est demandé, où que ce soit dans le parcours
- Au-delà de 3 phases enchaînées sans indice, le mode guidé arrête d'étaler les commandes toutes faites : chaque étape replie sa commande derrière un bouton « 👁 Afficher la commande », à révéler une par une plutôt que d'un bloc — le joueur qui n'a manifestement plus besoin d'être materné en garde la main
- Nouveau succès **🎯 Tireur d'élite** (série ≥ 3), sur le même modèle que les succès existants
- Reprend et concrétise l'idée « Difficulté adaptative » qui figurait jusqu'ici en fin de roadmap dans les idées non planifiées

### v2.2 — Mentor contextuel 🟡
**Statut : fait**
- Nouveau bouton **🧑‍🏫 Mentor**, à côté du bouton Indice existant : pose une question socratique orientée vers la réflexion (« qu'est-ce qui a plus de droits que prévu ici ? ») sans jamais révéler la commande exacte, et sans coûter au score (contrairement à un indice classique)
- Banque de conseils par famille technique — les 5 familles déjà utilisées par la topologie réseau interactive (v0.6) : Linux local, Réseau & annuaires, Conteneurs & orchestration, Cloud & IaC, Applications web — chacune avec ses propres questions côté attaque et côté défense, plus un jeu de conseils génériques en repli pour les scénarios générés/éditeur qui n'appartiennent à aucune famille répertoriée
- Reprend l'idée « Mentor IA contextuel » de la roadmap, mais volontairement **sans appel à une IA externe** : le projet reste une page statique GitHub Pages sans backend, donc pas de clé API à exposer ; le rôle d'« admin senior qui ne donne pas la réponse toute cuite » est ici assuré par une banque de questions rédigées à la main plutôt que par un modèle de langage
- Techniquement : `scenarioClusterName()` réutilise directement `NETWORK_CLUSTERS` (v0.6) pour retrouver la famille d'un scénario ; `game.mentorIndex` fait tourner la banque de conseils sans jamais la répéter tant qu'elle n'est pas épuisée ; le panneau `#mentor-list` est vidé à chaque nouvelle phase, chaîne ou étape, sur le même modèle que le panneau d'indices

---

## Idées non planifiées (à discuter)

### Déjà réalisées hors roadmap initiale
- **Easter egg dans le code source** : un flag caché dans les fichiers du projet (ex. commentaire encodé dans `scenarios.js`) pour les curieux qui inspectent le code. **Statut : fait** — un commentaire encodé en base64 a été ajouté en tête de `js/scenarios.js`.
- **Succès (achievements)** : badges débloqués en jouant (premier système compromis, premier correctif, phase réussie sans indice, speedrun < 45 s, mi-parcours, parcours complet, paliers du bac à sable, tireur d'élite), avec toast de notification et grille récapitulative sur l'écran d'accueil. **Statut : fait** — ajouté en même temps que le scoring, hors roadmap initiale, puis complété au fil des sessions suivantes (v2.1 notamment).

### Pistes ouvertes
- **Mini classement partagé de la faille du jour** : nécessiterait un backend léger (actuellement hors périmètre du projet, qui reste 100 % statique/local) — laissé de côté pour l'instant, comme noté dès v1.2.
- **Difficulté adaptative — volet supplémentaire** : au-delà du mode guidé moins bavard (v2.1), envisager de faire varier également le nombre de commandes "gratuites" avant pénalité de score selon la série en cours, une fois le premier volet éprouvé en usage réel.
- **Mentor contextuel — génération dynamique** : si un jour le projet accepte une dépendance à un backend, remplacer ou compléter la banque de questions écrites à la main (v2.2) par un vrai modèle de langage contextualisé sur le scénario en cours, capable de répondre à une question libre du joueur plutôt qu'à une banque figée.
- **v2.3 (piste) — Pack de scénarios "identité & secrets cloud" 🔴** : élargir encore le pool au-delà des 31 scénarios actuels avec des sujets encore non couverts — mauvaise configuration IAM (rôle trop permissif), secret applicatif poussé par erreur dans un dépôt public, jeton OAuth à portée trop large, GitHub Actions avec un secret de dépôt exfiltrable via un workflow détourné.
- **v2.4 (piste) — Statistiques de progression détaillées 🟡** : un écran "Bilan" séparé du rapport Markdown (v0.5), avec graphiques simples en SVG (déjà utilisés pour la topologie réseau) : temps moyen par famille technique, taux d'indices par catégorie, courbe de score dans le temps — pour visualiser ses points forts/faibles sans avoir à lire un tableau.
- **v2.5 (piste) — Mode "revanche" sur un scénario raté** : si un joueur a mis beaucoup de temps ou beaucoup d'indices sur un scénario donné, lui proposer explicitement de le retenter en bac à sable ciblé (plutôt qu'un tirage aléatoire complet) une fois le parcours principal terminé.

---

*Dernière mise à jour : implémentation de v0.4 (scoring, chrono, classement local), v0.5 (rapport de session Markdown), v0.6 (topologie réseau interactive), v0.7 (bac à sable), v0.8 (ambiance sonore), v0.9 (mode face-à-face local par iframes synchronisées), v1.0 (chaîne à mouvement latéral sur 3 machines distinctes), v1.1 (thèmes clair/contraste élevé), v1.2 (faille du jour avec série façon Wordle), v1.3 (récap cinématique + export HTML autonome), v2.0 (génération procédurale à 2 modèles + éditeur de scénario sans code), v2.1 (difficulté adaptative : série sans indice + mode guidé progressivement moins bavard) et v2.2 (mentor contextuel : conseils socratiques par famille technique, sans indice ni backend), plus un système de succès non planifié initialement — sans modifier la mécanique des scénarios existants. La roadmap est désormais entièrement implémentée jusqu'à v2.2 ; les pistes ouvertes ci-dessus restent à discuter pour une future session.*
