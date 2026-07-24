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

### v2.3 — Pack « identité & secrets cloud » 🔴
**Statut : fait** (4 scénarios supplémentaires, portant le total à 35)
- Rôle IAM trop permissif attaché à une fonction serverless publique (`iam:*` au lieu du strict `s3:GetObject`), exploité pour créer un utilisateur IAM administrateur persistant
- Clé API de paiement codée en dur dans un dépôt public (`git clone` + `grep`), au lieu d'être chargée depuis une variable d'environnement
- Jeton OAuth intégré avec une portée `repo:admin` alors que l'usage prévu ne nécessitait que `profile:read`, détourné pour supprimer un dépôt de production
- Secret de dépôt (`DEPLOY_TOKEN`) exfiltré via un workflow GitHub Actions déclenché sur `pull_request_target` et exécutant le code d'une pull request externe avec accès aux secrets

Les 4 nouveaux scénarios rejoignent la famille technique « Cloud & Infrastructure as Code » de la topologie réseau (v0.6) et héritent donc automatiquement de sa banque de conseils du mentor contextuel (v2.2), sans qu'aucune nouvelle famille n'ait été nécessaire.

### v2.4 — Bilan : statistiques de progression détaillées 🟡
**Statut : fait**
- Un écran **📊 Bilan**, avec tuiles de synthèse (systèmes sécurisés/compromis, chaînes réussies, score cumulé, domaine le plus fort), un **radar de compétences** en SVG (attaqué vs sécurisé par famille technique) et une carte par famille (barre de progression, rang, temps moyen, taux d'indices)
- Nouveau : **temps moyen par famille technique** et **taux d'indices** (part des phases résolues avec au moins un indice) sur chaque carte famille — les deux métriques manquaient encore à l'implémentation existante
- Nouveau : **courbe de score dans le temps**, un graphique SVG en ligne traçant chaque phase notée dans l'ordre chronologique réel de résolution (nouveaux champs `atAttack` / `atDefense` horodatés à la complétion de chaque phase)
- **Deux corrections d'intégrité découvertes en auditant cet écran, non liées au thème v2.4 mais bloquantes pour lui** :
  1. `loadProgress()` ne complétait jamais les scénarios manquants d'une sauvegarde `localStorage` déjà existante lors de l'ajout d'un nouveau pack — un joueur ayant progressé avant un pack aurait vu planter la topologie réseau, l'écran d'accueil et ce Bilan. Le chargement comble désormais automatiquement les ids absents (et persiste le complément).
  2. La table `SKILL_FAMILIES` utilisée par ce Bilan n'avait pas été mise à jour lors de l'ajout de la v2.3 : les 4 scénarios « identité & secrets cloud » étaient invisibles du radar et de la carte « Cloud & IaC ». Corrigé en même temps.
- Point d'histoire : l'écran Bilan (structure HTML, CSS, radar et cartes famille) existait déjà dans le dépôt sans jamais avoir été consigné dans cette roadmap — vraisemblablement introduit lors d'une fusion antérieure (`js/ui.js` l'appelait déjà via `renderDashboard()`). Cette session comble ce trou de documentation en même temps qu'elle complète la fonctionnalité jusqu'au niveau décrit par la piste v2.4 d'origine.

### v2.5 — Mode revanche 🟡
**Statut : fait**
- Nouvelle section **🔁 Mode revanche** dans l'onglet Bilan : liste les scénarios déjà bouclés (attaque + défense) mais résolus avec un score combiné sous 750/1000 ou au moins un indice utilisé — le score (v0.4) capture déjà à la fois le temps et les indices, donc sert directement de critère de repérage, sans nouvelle mécanique de suivi
- Chaque point faible affiche son score moyen et le nombre d'indices utilisés, avec un bouton **🔁 Revanche** qui relance directement ce scénario en bac à sable ciblé (`startSandboxChallenge(index)`, déjà existant depuis v0.7) — sans toucher à la progression du parcours principal
- La modale de fin de parcours complet met désormais en avant le pire point faible et invite à consulter le Bilan pour la revanche, conformément à l'idée « une fois le parcours principal terminé » de la piste d'origine
- **Volet défense ajouté dans la foulée** : chaque carte propose aussi un bouton *🛡️ Revanche défense*, qui relance directement la phase de défense du scénario (`startPhase(idx, 'defense')`). Le garde-fou déjà présent dans la commande `replay` (`if(!progress[scn.id].defense) completeDefense()`) empêche tout écrasement du score enregistré, donc aucune nouvelle mécanique de bac à sable n'a été nécessaire pour ce volet — seulement un point d'entrée dédié.

### v2.1 (volet supplémentaire) — Commandes gratuites variables selon la série 🟡
**Statut : fait**
- Le nombre de commandes "gratuites" avant pénalité de score (`computeScore`, v0.4) n'était plus figé à 3 : il augmente désormais avec la série sans indice en cours (v2.1) — `+1 commande gratuite tous les 2 crans de série, plafonné à +5` (8 commandes gratuites maximum au lieu de 3), pour ne pas rendre le score trivial à haute série
- Le badge de série dans le HUD affiche maintenant aussi le nombre de commandes gratuites en cours (`🎯 4 sans indice · 5 cmd gratuites`), et l'estimation de score en direct pendant la partie applique la même règle que le score final
- Choix de conception assumé pour cette session, faute de retour utilisateur préalable sur les seuils exacts : à ajuster si l'usage réel montre que la progression est trop lente/rapide

### v2.7 — Pack « sécurité des API » 🔴
**Statut : fait** (2 scénarios supplémentaires, portant le total à 41)
- **IDOR sur une API de facturation** (*Broken Object Level Authorization*) : un identifiant de facture purement numérique et séquentiel, sans aucune vérification que la ressource demandée appartient bien au client authentifié — l'attaque consiste simplement à changer l'identifiant dans l'URL pour lire la facture d'un autre client (en l'occurrence celle du compte administrateur)
- **Affectation de masse (mass assignment) à l'inscription** : le point d'entrée de création de compte construit l'utilisateur depuis l'objet JSON complet de la requête (`User(**request.json)`) sans filtrer les champs autorisés, permettant de glisser un champ `role: admin` non prévu par le formulaire officiel pour obtenir un compte administrateur dès l'inscription
- Les deux scénarios rejoignent la famille technique « Applications web » déjà existante (topologie réseau v0.6 et Bilan de compétences v2.4), et héritent donc automatiquement de sa banque de conseils du mentor contextuel (v2.2) sans qu'aucune nouvelle famille n'ait été nécessaire — sur le même principe que le pack v2.3
- Choix de ces deux failles en priorité car elles couvrent deux classes très fréquentes dans le Top 10 API Security de l'OWASP (autorisation au niveau objet, affectation de propriétés non filtrées) et qui n'étaient pas encore représentées dans le pack applicatif existant (SSTI, JWT, désérialisation, Log4Shell, dépôt Git exposé)

### v2.8 — Pack « sécurité des API », 2ᵉ vague 🔴
**Statut : fait** (2 scénarios supplémentaires, portant le total à 43)
- **Exposition excessive de données** (*Excessive Data Exposure*) : un point d'entrée d'annuaire censé n'exposer que des champs publics (nom, identifiant) renvoie en réalité l'objet base de données complet de chaque utilisateur, y compris le jeton de réinitialisation de mot de passe de l'administrateur — réutilisé pour réinitialiser son mot de passe puis se connecter à sa place
- **Absence de limitation de débit** (*Missing Rate Limiting* / brute force) : le point d'entrée de connexion n'impose aucun verrouillage ni ralentissement après des tentatives échouées répétées, permettant de deviner le mot de passe administrateur par un dictionnaire de mots de passe courants
- Complète la 1ʳᵉ vague (v2.7 — IDOR, mass assignment) avec deux autres classes majeures du Top 10 API Security de l'OWASP qui n'étaient pas encore couvertes : fuite de données par sur-sérialisation côté serveur, et consommation de ressources non restreinte côté authentification
- Les deux scénarios rejoignent eux aussi la famille technique « Applications web » déjà existante, sans nouvelle famille ni modification du mentor contextuel nécessaire — même principe que la 1ʳᵉ vague

### v2.9 — RBAC Kubernetes trop permissif & confusion de dépendances 🔴
**Statut : fait** (2 scénarios supplémentaires, portant le total à 45)
- **RBAC Kubernetes trop permissif** : un `ClusterRoleBinding` accorde par erreur le rôle `cluster-admin` au compte de service par défaut d'un simple namespace applicatif — depuis un pod compromis, le jeton monté automatiquement suffit à lister les secrets de l'ensemble du cluster, tous namespaces confondus. Rejoint la famille « Conteneurs & orchestration » (jusqu'ici la plus petite, avec seulement 3 scénarios), aux côtés de l'évasion par hostPath privilégié déjà existante — un mécanisme d'abus RBAC distinct de l'évasion par pod privilégié déjà couverte
- **Confusion de dépendances** (*dependency confusion*) : la configuration `pip` du pipeline CI interroge à la fois un index privé et l'index public PyPI sans jamais restreindre la résolution des paquets internes au seul index privé — publier un paquet public homonyme avec un numéro de version plus élevé suffit à détourner l'installation, dont le script post-installation s'exécute avec les privilèges du pipeline. Rejoint la famille « Cloud & Infrastructure as Code », aux côtés du registre Docker non authentifié déjà existant, sur le même thème de la chaîne d'approvisionnement logicielle
- Aucune nouvelle famille technique nécessaire ; le mentor contextuel (v2.2) et le Bilan de compétences (v2.4) héritent automatiquement des deux nouveaux scénarios via les familles existantes

### v3.0 — Pack « réseau » — Memcached & session nulle SMB 🔵
**Statut : fait** (2 scénarios supplémentaires, portant le total à 47)
- **Memcached non authentifié** : le service écoute sur toutes les interfaces sans authentification SASL, et met en cache des sessions web en clair — y compris celle d'un administrateur, directement lisible par clé puis rejouable comme cookie de session
- **Session nulle SMB** : le serveur Samba autorise les connexions anonymes (`restrict anonymous = 0`), permettant de lister ses partages et d'en télécharger le contenu sans le moindre identifiant — un partage de sauvegardes y expose des identifiants de compte de service en clair
- Rejoint la famille « Réseau & annuaires », jusqu'ici la plus petite avec seulement 5 scénarios (aux côtés de NFS, transfert de zone DNS, bind LDAP anonyme, Redis et Elasticsearch non authentifiés) — même logique de service réseau mal configuré, deux protocoles supplémentaires (cache mémoire, partage de fichiers Windows) qui n'étaient pas encore couverts
- Aucune nouvelle famille technique nécessaire ; le mentor contextuel et le Bilan de compétences héritent automatiquement des deux nouveaux scénarios via la famille existante

### v3.1 — Polish visuel des cartes dossier 🟣
**Statut : fait**
- **Apparition échelonnée** : les cartes de l'onglet Dossiers apparaissent désormais en fondu-montant, décalées de 22 ms l'une après l'autre (plafonné aux 20 premières pour ne pas allonger l'attente sur la grille complète de 47 cartes) — un geste d'ouverture plutôt qu'un affichage instantané, entièrement désactivé sous `prefers-reduced-motion`
- **Liseré de famille technique** : un fin trait dégradé apparaît en haut de chaque carte, teinté selon la couleur de sa famille technique (les mêmes couleurs que la topologie réseau et le radar du Bilan de compétences) — sans jamais concurrencer la bordure gauche, qui reste dédiée au statut de la carte (verrouillé / en cours / sécurisé). Un utilisateur qui a déjà mémorisé le code couleur du radar reconnaît directement la famille d'une carte sans lire sa catégorie en toutes lettres
- Nouvelle fonction `familyColorForScenario(id)` dans `js/ui.js`, qui réutilise directement `NETWORK_CLUSTERS` (v0.6) — aucune duplication de mapping catégorie → couleur

### v3.2 — Structuration visuelle de la barre de navigation 🟣
**Statut : fait**
- **Icônes cohérentes sur tous les onglets** : jusqu'ici seuls 4 des 13 onglets (Faille du jour, Généré, Éditeur, Duel) portaient une icône — les 9 autres (Accueil, Dossiers, Chaînes, Apprendre, Réseau, Bac à sable, Succès, Bilan, Classement) en reçoivent désormais une, cohérente avec leur contenu, pour un repérage visuel plus rapide dans une barre assez dense
- **Séparateurs de groupe** : 4 fines lignes verticales découpent la barre en groupes qui ont un sens (Accueil seul · catalogue de contenu : Dossiers/Chaînes/Apprendre/Réseau · modes de jeu : Bac à sable/Faille du jour/Généré/Éditeur · suivi de progression : Succès/Bilan/Classement · Duel à part, seul lien qui quitte la page) — la structure, jusqu'ici purement plate, encode maintenant une hiérarchie déjà présente dans la tête de l'utilisateur mais jamais visible
- Implémentation en CSS pur (`.nav-divider`), sans impact sur la logique de bascule d'onglet (`switchHomeTab`) ni sur les boucles JS qui itèrent déjà sur `.home-tab` par sélecteur de classe

### v3.3 — Célébration cinématique à la capture d'un flag 🟡
**Statut : fait**
- Jusqu'ici, capturer un flag ne changeait presque rien visuellement : une ligne dorée de plus dans le terminal, identique à n'importe quelle autre sortie de commande — pourtant c'est le moment le plus gratifiant de chaque scénario
- **Flash plein écran** : un halo doré radial traverse tout l'écran en fondu (0,9 s), centré légèrement au-dessus du terminal
- **Secousse du terminal** : le cadre du terminal tremble brièvement (0,45 s) et se pare d'un halo doré, comme un impact
- **Texte du flag pulsé** : la ligne `FLAG{...}` elle-même s'illumine puis retombe à un éclat résiduel, au lieu d'apparaître statique
- Déclenché une seule fois, au bon endroit : directement dans la fonction `print()` de `js/ui.js` dès qu'une ligne de classe `flagline` est affichée — donc pour tous les scénarios (dont les chaînes multi-machines), le mode Duel (qui charge la même page en iframe) et le mode généré, sans dupliquer la logique nulle part
- Entièrement désactivé sous `prefers-reduced-motion`, comme le reste des animations du site
- Choix délibéré de concentrer l'audace ici plutôt que de saupoudrer des effets un peu partout : c'est le seul moment du jeu qui mérite un vrai coup d'éclat

### v3.4 — Pack « conteneurs » — PID host partagé & NetworkPolicy absente 🔴
**Statut : fait** (2 scénarios supplémentaires, portant le total à 49)
- **Espace de noms PID partagé avec l'hôte** (`--pid=host` + `SYS_PTRACE`) : depuis un conteneur autorisé à partager l'espace de noms PID de l'hôte, tous ses processus deviennent visibles et injectables — y compris un agent de sauvegarde tournant en root, dans lequel un débogueur injecte une commande arbitraire
- **NetworkPolicy Kubernetes absente** : sans politique réseau isolant un namespace applicatif exposé publiquement, rien n'empêche un pod compromis d'atteindre directement un service interne d'un autre namespace, censé rester inaccessible depuis l'extérieur — mouvement latéral jusqu'à un jeton d'administration
- Rejoint la famille « Conteneurs & orchestration », qui passe ainsi de 4 à 6 scénarios (elle restait la plus petite depuis la création du projet) — deux mécanismes d'évasion/mouvement latéral distincts des trois scénarios déjà présents (socket Docker, hostPath privilégié, RBAC cluster-admin)
- Aucune nouvelle famille technique nécessaire ; le mentor contextuel et le Bilan de compétences héritent automatiquement des deux nouveaux scénarios via la famille existante

### v3.5 — Pack « Active Directory » — Kerberoasting & Pass-the-Hash 🔴
**Statut : fait** (2 scénarios supplémentaires, portant le total à 51)
- **Kerberoasting** : un compte de service `svc-sql` porte un SPN enregistré pour un serveur SQL, exposant de facto un ticket de service (TGS) chiffré avec son hash NTLM à n'importe quel utilisateur authentifié du domaine — mot de passe faible cassé hors-ligne (`hashcat --mode 13100`), donnant un accès administrateur local sur le serveur SQL. Correctif : renforcer le mot de passe du compte de service plutôt que de retirer le SPN (nécessaire au fonctionnement du service)
- **Pass-the-Hash** : le mot de passe du compte Administrateur local est identique sur tout le parc faute de solution LAPS déployée — un hash NTLM dumpé sur un poste déjà compromis (`mimikatz sekurlsa::logonpasswords`) suffit à s'authentifier comme administrateur local sur une autre machine (`pth --user ... --hash ...`), sans jamais connaître le mot de passe en clair. Correctif : déployer LAPS pour un mot de passe unique par poste
- Ces deux scénarios rejoignent la famille « Active Directory / Windows » créée en v2.6, qui passait ainsi de 5 à 7 scénarios (elle redevenait la plus petite depuis l'ajout du pack conteneurs en v3.4) — deux mécanismes distincts des quatre scénarios déjà présents (AS-REP Roasting, délégation sans contrainte, DCSync, GPO modifiable) : l'un exploite un SPN plutôt qu'un attribut de pré-authentification, l'autre un mot de passe local partagé plutôt qu'une relation de confiance du domaine
- Aucune nouvelle famille technique nécessaire ; le mentor contextuel (v2.2) et le Bilan de compétences (v2.4) héritent automatiquement des deux nouveaux scénarios via la famille existante, et la topologie réseau (v0.6) affiche désormais 7 nœuds pour cette famille

### v3.6 — Pack « conteneurs », 2ᵉ vague — etcd non authentifié & évasion cgroup release_agent 🔴
**Statut : fait** (2 scénarios supplémentaires, portant le total à 53)
- **etcd non authentifié** : le magasin clé-valeur du plan de contrôle Kubernetes écoute sans authentification par certificat client — n'importe qui peut y lire directement les Secrets (simplement encodés en base64, jamais chiffrés par défaut), en contournant entièrement le RBAC de l'API Kubernetes puisque etcd ne le vérifie jamais lui-même
- **Évasion via cgroup release_agent** : un conteneur lancé avec la capacité SYS_ADMIN et son cgroupfs (v1, contrôleur memory) monté en écriture permet de détourner le mécanisme `release_agent`, exécuté par l'hôte avec ses propres privilèges à la libération du cgroup — un vecteur d'évasion distinct des trois déjà présents (socket Docker exposé, hostPath privilégié, PID namespace partagé), qui ne dépend d'aucun processus hôte préexistant à cibler
- Ces deux scénarios rejoignent la famille « Conteneurs & orchestration », qui passe ainsi de 6 à 8 scénarios — elle n'est plus la plus petite famille du projet (Active Directory / Windows et Réseau & annuaires en comptent chacune 7)
- Aucune nouvelle famille technique nécessaire ; le mentor contextuel et le Bilan de compétences héritent automatiquement des deux nouveaux scénarios via la famille existante

### v3.7 — Pack « web », 2ᵉ vague — introspection GraphQL & CORS reflété 🔴
**Statut : fait** (2 scénarios supplémentaires, portant le total à 55)
- **Introspection GraphQL & champ non protégé** : l'introspection GraphQL activée en production révèle un champ `resetToken` non documenté, accessible sans la moindre vérification d'autorisation au niveau du champ — un rappel que l'autorisation doit être vérifiée par champ (field-level), pas seulement par endpoint ou par opération
- **CORS reflétant l'origine avec identifiants** : l'API reflète dynamiquement l'en-tête `Origin` reçu au lieu d'une liste blanche, tout en autorisant les identifiants (cookies de session) — n'importe quel site tiers peut alors lire une réponse authentifiée, contournant la Same-Origin Policy
- Ces deux scénarios rejoignent la famille « Applications web », qui passe ainsi de 9 à 11 scénarios (elle reste la plus grande après Linux) — deux mécanismes distincts des sept scénarios déjà présents : ni l'un ni l'autre n'implique de désérialisation, d'injection de gabarit, de RCE via une bibliothèque tierce, ou d'un contrôle d'accès au niveau ressource/objet comme l'IDOR déjà couvert
- Aucune nouvelle famille technique nécessaire ; le mentor contextuel et le Bilan de compétences héritent automatiquement des deux nouveaux scénarios via la famille existante

### v3.8 — Pack « réseau », 2ᵉ vague — LLMNR/NBT-NS & relais NTLM 🔵
**Statut : fait** (2 scénarios supplémentaires, portant le total à 57)
- **Empoisonnement LLMNR/NBT-NS** : LLMNR et NBT-NS restant actifs, l'échec d'une résolution DNS (partage mal orthographié) se traduit par une diffusion en broadcast qu'un attaquant du même segment peut usurper — capturant un challenge-response NetNTLMv2 cassable hors-ligne, sans jamais s'authentifier au préalable
- **Relais NTLM faute de signature SMB** : plutôt que de casser hors-ligne une authentification NTLM interceptée, la rejouer directement (relais) vers un second serveur qui n'exige pas la signature SMB suffit à ouvrir une session avec les privilèges du compte intercepté — un complément naturel au scénario précédent (l'un capture puis casse, l'autre capture puis relaie sans jamais casser), qui illustre pourquoi la signature SMB doit être exigée même quand les mots de passe sont robustes
- Ces deux scénarios rejoignent la famille « Réseau & annuaires », qui passe ainsi de 7 à 9 scénarios
- Aucune nouvelle famille technique nécessaire ; le mentor contextuel et le Bilan de compétences héritent automatiquement des deux nouveaux scénarios via la famille existante

---

## Idées non planifiées (à discuter)

### Déjà réalisées hors roadmap initiale
- **Easter egg dans le code source** : un flag caché dans les fichiers du projet (ex. commentaire encodé dans `scenarios.js`) pour les curieux qui inspectent le code. **Statut : fait** — un commentaire encodé en base64 a été ajouté en tête de `js/scenarios.js`.
- **Succès (achievements)** : badges débloqués en jouant (premier système compromis, premier correctif, phase réussie sans indice, speedrun < 45 s, mi-parcours, parcours complet, paliers du bac à sable, tireur d'élite), avec toast de notification et grille récapitulative sur l'écran d'accueil. **Statut : fait** — ajouté en même temps que le scoring, hors roadmap initiale, puis complété au fil des sessions suivantes (v2.1 notamment).
- **Bilan (tableau de bord de compétences)** : voir v2.4 ci-dessus — la base (radar, cartes famille, chaînes) était déjà présente hors roadmap ; cette session l'a documentée et complétée.

### Pistes ouvertes (nécessitent un backend)
- **Mini classement partagé de la faille du jour** : nécessiterait un backend léger (actuellement hors périmètre du projet, qui reste 100 % statique/local) — laissé de côté pour l'instant, comme noté dès v1.2.
- **Mentor contextuel — génération dynamique** : si un jour le projet accepte une dépendance à un backend, remplacer ou compléter la banque de questions écrites à la main (v2.2) par un vrai modèle de langage contextualisé sur le scénario en cours, capable de répondre à une question libre du joueur plutôt qu'à une banque figée.

Ces deux dernières pistes nécessitent un backend, hors du périmètre 100 % statique assumé par le projet — elles restent en suspens jusqu'à décision contraire.

### Mini classement de la faille du jour — version simulée localement 🟡
**Statut : fait** (alternative choisie explicitement, plutôt qu'un vrai backend)
- Un classement du jour apparaît maintenant sous les statistiques de la faille du jour : 12 profils fictifs dont le temps est généré de façon **déterministe par date** (même graine pseudo-aléatoire pour tout le monde ce jour-là, via `mulberry32` seedé par un hachage de la date + du pseudo + du scénario du jour) — donc reproductible, mais **pas réellement partagé entre joueurs**, ce qui est clairement indiqué dans l'interface (« simulé localement — pas de serveur partagé »)
- Le score du joueur (si résolu aujourd'hui) est inséré au bon rang dans ce classement fictif, et son rang est aussi rappelé dans la modale de fin de faille du jour
- Choix assumé par l'utilisateur du projet plutôt que d'ajouter une dépendance à un service tiers (JSONBin, Supabase...) à un projet 100 % statique

### Mentor contextuel — enrichissement de la banque 🟡
**Statut : fait** (alternative choisie explicitement, plutôt qu'une intégration LLM avec clé API)
- Chaque famille technique (Linux, Réseau, Conteneurs, Cloud & IaC, Web) passe de 3 à **5 conseils socratiques** par phase (attaque et défense), la banque générique de secours également — soit +67 % de contenu sans jamais révéler la commande exacte
- Les deux nouveaux conseils par phase sont volontairement plus concrets que les trois premiers (ex. : nommer les 2-3 familles de causes possibles plutôt qu'une piste unique, ou pointer vers la méthode plutôt que vers la commande) — pour accompagner un joueur qui clique plusieurs fois sur le mentor sans jamais lui donner la réponse
- La famille « Cloud & Infrastructure as Code » a été enrichie en priorité, car c'est elle qui couvre les 4 scénarios ajoutés en v2.3 (identité & secrets cloud)
- Aucune modification de `getMentorTips`/`nextMentorTip` n'a été nécessaire : la logique de cyclage (`tips[index % tips.length]`) s'adapte déjà dynamiquement à la taille de chaque banque

---

### v2.6 — Pack « Active Directory / Windows » 🔴
**Statut : fait** (4 scénarios supplémentaires, portant le total à 39)
- **AS-REP Roasting** : un compte de service dont la pré-authentification Kerberos est désactivée, permettant de récupérer un ticket AS-REP cassable hors-ligne sans jamais s'authentifier au préalable
- **Délégation Kerberos sans contrainte** : un compte machine configuré en délégation sans contrainte, dont le cache de tickets est détourné (via un abus du service Print Spooler) pour usurper l'identité d'un contrôleur de domaine
- **Abus DCSync** : un compte de service disposant à tort des droits de réplication du domaine, exploité pour extraire le hash de `krbtgt` et ouvrir la voie à la falsification de tickets (Golden Ticket)
- **GPO modifiable par tous les utilisateurs** : une stratégie de groupe appliquée aux postes administrateurs, dont l'ACL autorise en écriture le groupe « Utilisateurs du domaine » au lieu des seuls administrateurs, détournée pour déployer un compte administrateur local via son script de démarrage
- **Nouvelle famille technique dédiée « Active Directory / Windows »**, dans la topologie réseau (v0.6) et le Bilan de compétences (v2.4) — elle absorbe au passage l'unique scénario Windows déjà présent (`windows-unquoted-path`), auparavant mal classé dans « Réseau & annuaires »
- Banque de conseils du mentor contextuel (v2.2) enrichie avec cette nouvelle famille, à 5 conseils par phase comme les autres

---

*Dernière mise à jour : implémentation de v0.4 (scoring, chrono, classement local), v0.5 (rapport de session Markdown), v0.6 (topologie réseau interactive), v0.7 (bac à sable), v0.8 (ambiance sonore), v0.9 (mode face-à-face local par iframes synchronisées), v1.0 (chaîne à mouvement latéral sur 3 machines distinctes), v1.1 (thèmes clair/contraste élevé), v1.2 (faille du jour avec série façon Wordle, puis complétée cette session par un classement simulé localement), v1.3 (récap cinématique + export HTML autonome), v2.0 (génération procédurale à 2 modèles + éditeur de scénario sans code), v2.1 (difficulté adaptative : série sans indice + mode guidé progressivement moins bavard, puis complétée par des commandes gratuites variables selon la série), v2.2 (mentor contextuel : conseils socratiques par famille technique, puis enrichis de 3 à 5 conseils par phase), v2.3 (pack « identité & secrets cloud » — total 35 scénarios), v2.4 (Bilan : temps moyen et taux d'indices par famille, courbe de score chronologique, plus deux correctifs d'intégrité de la progression sauvegardée), v2.5 (mode revanche : repérage des points faibles par score combiné, relance ciblée en bac à sable pour l'attaque *et* pour la défense) et v2.6 (pack « Active Directory / Windows » — AS-REP Roasting, délégation sans contrainte, abus DCSync, GPO modifiable — total 39 scénarios, nouvelle famille technique dédiée) et v2.7 (pack « sécurité des API » — IDOR sur une API de facturation, affectation de masse à l'inscription — total 41 scénarios, famille « Applications web » existante) et v2.8 (pack « sécurité des API », 2ᵉ vague — exposition excessive de données, absence de limitation de débit — total 43 scénarios) et v2.9 (RBAC Kubernetes trop permissif, confusion de dépendances pip — total 45 scénarios) et v3.0 (pack « réseau » — Memcached non authentifié, session nulle SMB — total 47 scénarios) et v3.1 (polish visuel : apparition échelonnée des cartes dossier, liseré de couleur par famille technique) et v3.2 (structuration visuelle de la nav : icônes sur tous les onglets, séparateurs de groupe) et v3.3 (célébration cinématique à la capture d'un flag : flash plein écran, secousse du terminal, texte pulsé) et v3.4 (pack « conteneurs » — PID host partagé, NetworkPolicy absente — total 49 scénarios) et v3.5 (pack « Active Directory » — Kerberoasting, Pass-the-Hash — total 51 scénarios, famille AD/Windows portée de 5 à 7) et v3.6 (pack « conteneurs », 2ᵉ vague — etcd non authentifié, évasion cgroup release_agent — total 53 scénarios, famille Conteneurs portée de 6 à 8) et v3.7 (pack « web », 2ᵉ vague — introspection GraphQL, CORS reflété — total 55 scénarios, famille Applications web portée de 9 à 11) et v3.8 (pack « réseau », 2ᵉ vague — empoisonnement LLMNR/NBT-NS, relais NTLM faute de signature SMB — total 57 scénarios, famille Réseau & annuaires portée de 7 à 9), plus un système de succès non planifié initialement — sans modifier la mécanique des scénarios existants. À cette occasion, la timeline condensée de la page d'accueil (`js/hero-fx.js`) a également été resynchronisée avec ce fichier détaillé.*

*Maintenance additionnelle (hors roadmap fonctionnelle) : le dépôt n'avait jamais eu de `README.md` malgré l'hébergement GitHub Pages déjà en place — ajouté. Le service worker (`sw.js`) précachait une liste d'écrans figée depuis sa création et n'avait jamais été mise à jour au fil des ajouts : `duel.html`, `js/duel.js`, `js/recap.js`, `js/procedural.js` et `js/editor.js` en étaient absents, ce qui pouvait faire échouer ces écrans hors-ligne au tout premier lancement de la PWA avant une première visite en ligne. Corrigé, version de cache incrémentée.*
