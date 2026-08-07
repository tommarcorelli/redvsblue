/* =========================================================
   RED vs BLUE — v0.4 + v0.7 (+ bonus) : scoring, chrono,
   classement local, bac à sable, succès, ambiance sonore
   ========================================================= */

/* ---------- Utilitaires ---------- */

function formatDuration(seconds){
  seconds = Math.max(0, Math.round(seconds));
  const m = Math.floor(seconds/60);
  const s = seconds % 60;
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------- Scoring ---------- */
// Base 1000 points par phase, 3 commandes "gratuites" par défaut (davantage
// si le joueur a une série sans indice en cours — voir adaptiveFreeCommands
// ci-dessous), puis pénalités progressives par commande, par indice et par
// tranche de temps écoulée.
function computeScore(commands, hints, elapsedSec, freeCommands){
  const free = (typeof freeCommands === 'number') ? freeCommands : 3;
  let score = 1000;
  score -= Math.max(0, commands - free) * 12;
  score -= hints * 70;
  score -= Math.min(300, Math.floor(elapsedSec / 5) * 3);
  return Math.max(50, Math.round(score));
}

function totalScore(){
  return SCENARIOS.reduce((sum,s)=> sum + (progress[s.id].scoreAttack||0) + (progress[s.id].scoreDefense||0), 0);
}
function totalPlayTimeSec(){
  return SCENARIOS.reduce((sum,s)=> sum + (progress[s.id].timeAttack||0) + (progress[s.id].timeDefense||0), 0);
}

/* ---------- Classement local ---------- */

const LEADERBOARD_KEY = 'redvsblue_leaderboard_v1';

function loadLeaderboard(){
  try{
    const raw = JSON.parse(localStorage.getItem(LEADERBOARD_KEY));
    return Array.isArray(raw) ? raw : [];
  }catch(e){ return []; }
}
function saveLeaderboardEntry(entry){
  const list = loadLeaderboard();
  list.push(entry);
  list.sort((a,b)=> b.totalScore - a.totalScore);
  try{ localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list.slice(0,50))); }catch(e){}
}
function clearLeaderboard(){
  try{ localStorage.removeItem(LEADERBOARD_KEY); }catch(e){}
}
function exportLeaderboard(){
  const data = JSON.stringify(loadLeaderboard(), null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'redvsblue-classement.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 2000);
}

/* ---------- Bac à sable (v0.7) ---------- */

const SANDBOX_KEY = 'redvsblue_sandbox_v1';

function loadSandboxStats(){
  try{
    const raw = JSON.parse(localStorage.getItem(SANDBOX_KEY));
    if(raw && typeof raw === 'object') return Object.assign({solved:0, bestTimeMs:null}, raw);
  }catch(e){}
  return {solved:0, bestTimeMs:null};
}
function saveSandboxStats(stats){
  try{ localStorage.setItem(SANDBOX_KEY, JSON.stringify(stats)); }catch(e){}
}

function startSandboxChallenge(forceIndex){
  const idx = (forceIndex !== undefined) ? forceIndex : Math.floor(Math.random() * SCENARIOS.length);
  game.sandbox = true;
  game.daily = false;
  startPhase(idx, 'attack');
  showScreen('game');
  document.getElementById('term-input').focus();
}

// Revanche ciblée sur la phase de défense (comble le manque noté en v2.5 :
// le bac à sable historique — v0.7 — ne couvrait que l'attaque). Comme
// progress[scn.id].defense est déjà true pour un scénario déjà sécurisé, le
// garde-fou existant dans la commande `replay` (js/engine.js) empêche déjà
// tout écrasement du score enregistré : aucun nouveau mode « sandbox » n'est
// nécessaire, il suffit de rejouer la phase de défense normalement.
function startDefenseRevanche(idx){
  game.sandbox = false;
  game.daily = false;
  startPhase(idx, 'defense');
  showScreen('game');
  document.getElementById('term-input').focus();
}
window.startDefenseRevanche = startDefenseRevanche;

function completeSandboxAttack(){
  const elapsedSec = (Date.now() - game.phaseStartTime) / 1000;
  const stats = loadSandboxStats();
  stats.solved = (stats.solved||0) + 1;
  if(stats.bestTimeMs === null || elapsedSec*1000 < stats.bestTimeMs) stats.bestTimeMs = Math.round(elapsedSec*1000);
  saveSandboxStats(stats);
  playSound('success');
  checkAchievements({hints: game.hintIndex, elapsedSec, phase:'attack', sandbox:true});
  if(window.renderSandboxPanel) renderSandboxPanel();
  showModal({
    title:'🎲 Cible compromise !',
    body:`Défi bac à sable résolu en ${formatDuration(elapsedSec)} — faille exploitée : « ${currentScenario().title} ».`,
    flag: extractFlagFromLog(),
    primaryLabel:'Nouveau défi aléatoire →',
    closeLabel:'Quitter le bac à sable',
    onPrimary(){ startSandboxChallenge(); },
    onClose(){ goHome(); }
  });
}

/* ---------- Faille du jour (v1.2) ---------- */

const DAILY_KEY = 'redvsblue_daily_v1';

function todayDateStr(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function hashDateStr(str){
  let h = 0;
  for(let i=0; i<str.length; i++){ h = (h * 31 + str.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

function getDailyChallenge(){
  const date = todayDateStr();
  const idx = hashDateStr(date) % SCENARIOS.length;
  return { date, idx, scenario: SCENARIOS[idx] };
}

// ---------- Classement du jour simulé localement ----------
// Choix assumé (pas de backend pour ce projet 100% statique) : un
// classement fictif, mais déterministe par date — même pseudo-aléatoire
// pour tout le monde ce jour-là plutôt qu'un tirage différent à chaque
// rechargement. Clairement labellisé "simulé" dans l'UI pour ne pas
// laisser croire à un vrai classement partagé entre joueurs.
const DAILY_FAKE_NAMES = [
  'r00tkid','byte_ninja','pkt_sniffer','nullPointer','sudo_sam','h4shcat',
  'blueTeamBea','cipherFox','packetPanda','shellphie','defcon_dana','w1r3shark'
];
function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function dailyFakeCohort(date){
  const {scenario} = getDailyChallenge();
  return DAILY_FAKE_NAMES.map(name=>{
    const rnd = mulberry32(hashDateStr(date + '::' + name + '::' + scenario.id));
    // Temps plausible entre ~35s et ~260s, biaisé vers le milieu (moyenne de 2 tirages).
    const t = 35 + Math.round(((rnd() + rnd()) / 2) * 225);
    return { name, elapsedSec: t };
  }).sort((a,b)=> a.elapsedSec - b.elapsedSec);
}
function dailyLeaderboardRank(date, playerElapsedSec){
  const cohort = dailyFakeCohort(date);
  const place = 1 + cohort.filter(r=> r.elapsedSec < playerElapsedSec).length;
  return { place, total: cohort.length + 1 };
}
function dailyLeaderboardWithPlayer(date){
  const cohort = dailyFakeCohort(date);
  const stats = loadDailyStats();
  const done = stats.history[date];
  const rows = cohort.map(r=> ({name:r.name, elapsedSec:r.elapsedSec, you:false}));
  if(done) rows.push({name:'vous', elapsedSec: done.elapsedSec, you:true});
  rows.sort((a,b)=> a.elapsedSec - b.elapsedSec);
  return rows;
}

function loadDailyStats(){
  try{
    const raw = JSON.parse(localStorage.getItem(DAILY_KEY));
    if(raw && typeof raw === 'object') return Object.assign({streak:0, lastDate:null, history:{}}, raw);
  }catch(e){}
  return {streak:0, lastDate:null, history:{}};
}
function saveDailyStats(stats){
  try{ localStorage.setItem(DAILY_KEY, JSON.stringify(stats)); }catch(e){}
}

function startDailyChallenge(){
  const {idx} = getDailyChallenge();
  game.daily = true;
  game.sandbox = false;
  startPhase(idx, 'attack');
  showScreen('game');
  document.getElementById('term-input').focus();
}

function completeDailyChallenge(){
  const {date} = getDailyChallenge();
  const elapsedSec = (Date.now() - game.phaseStartTime) / 1000;
  const stats = loadDailyStats();
  const alreadyDone = !!stats.history[date];

  if(!alreadyDone){
    if(stats.lastDate){
      const diffDays = Math.round((new Date(date) - new Date(stats.lastDate)) / 86400000);
      stats.streak = (diffDays === 1) ? stats.streak + 1 : 1;
    } else {
      stats.streak = 1;
    }
    stats.lastDate = date;
    stats.history[date] = { idx: getDailyChallenge().idx, elapsedSec: Math.round(elapsedSec) };
    saveDailyStats(stats);
    playSound('success');
  }

  if(window.renderDailyPanel) renderDailyPanel();
  const rank = dailyLeaderboardRank(date, stats.history[date].elapsedSec);
  showModal({
    title: alreadyDone ? '🗓️ Entraînement — déjà résolu aujourd\'hui' : '🗓️ Faille du jour résolue !',
    body: (alreadyDone
      ? `Vous aviez déjà validé la faille du ${date} en ${formatDuration(stats.history[date].elapsedSec)}. Cette tentative ne modifie pas votre série (elle sert juste à s'entraîner).`
      : `Faille du ${date} résolue en ${formatDuration(elapsedSec)} — « ${currentScenario().title} ». Série actuelle : ${stats.streak} jour${stats.streak>1?'s':''} consécutif${stats.streak>1?'s':''}.`)
      + ` Classement simulé du jour : ${rank.place}ᵉ sur ${rank.total} profils fictifs.`,
    flag: extractFlagFromLog(),
    primaryLabel:'Fermer',
    closeLabel:'Retour à l\'accueil',
    onPrimary(){},
    onClose(){ goHome(); }
  });
}

/* ---------- Difficulté adaptative (v2.1) ---------- */
// Idée reprise de la roadmap ("moins d'indices proposés automatiquement si le
// joueur enchaîne les scénarios sans en demander") : on suit une série de
// phases terminées sans le moindre indice. À partir d'un certain seuil, le
// mode guidé devient moins bavard (étapes repliées, à révéler une par une)
// plutôt que de tout étaler d'un coup — le joueur garde la main sur le
// niveau d'aide qu'il souhaite. La série est réinitialisée dès qu'un indice
// est demandé, où que ce soit dans le parcours.

const ADAPTIVE_KEY = 'redvsblue_adaptive_v1';
const ADAPTIVE_THRESHOLD = 3;

function loadAdaptiveStats(){
  try{
    const raw = JSON.parse(localStorage.getItem(ADAPTIVE_KEY));
    if(raw && typeof raw === 'object') return Object.assign({streak:0, best:0}, raw);
  }catch(e){}
  return {streak:0, best:0};
}
function saveAdaptiveStats(s){
  try{ localStorage.setItem(ADAPTIVE_KEY, JSON.stringify(s)); }catch(e){}
}
function adaptiveStreak(){ return loadAdaptiveStats().streak; }
function isAdaptiveModeActive(){ return adaptiveStreak() >= ADAPTIVE_THRESHOLD; }

// v2.1 volet supplémentaire : la série sans indice ne se contente plus
// d'assouplir le mode guidé, elle élargit aussi le nombre de commandes
// "gratuites" avant pénalité de score en computeScore() — +1 tous les 2
// crans de série, plafonné à +5 (soit 8 commandes gratuites max au lieu de
// 3), pour ne pas non plus rendre le score trivial à haute série.
function adaptiveFreeCommands(){
  return 3 + Math.min(5, Math.floor(adaptiveStreak() / 2));
}

function registerPhaseOutcome(hintsUsed){
  const s = loadAdaptiveStats();
  if(hintsUsed === 0){
    s.streak += 1;
    if(s.streak > s.best) s.best = s.streak;
  } else {
    s.streak = 0;
  }
  saveAdaptiveStats(s);
  if(window.renderAdaptiveBadge) window.renderAdaptiveBadge();
}
function breakAdaptiveStreak(){
  const s = loadAdaptiveStats();
  if(s.streak !== 0){
    s.streak = 0;
    saveAdaptiveStats(s);
    if(window.renderAdaptiveBadge) window.renderAdaptiveBadge();
  }
}

/* ---------- Mentor contextuel (v2.2) ---------- */
// Reprise de l'idée « Mentor IA contextuel » de la roadmap, adaptée aux
// contraintes du projet (aucun backend, aucune clé API à exposer sur une
// page statique GitHub Pages) : une banque de questions socratiques par
// famille technique (les 5 familles déjà utilisées par la topologie réseau
// de v0.6), qui pousse à réfléchir sans jamais donner la commande exacte —
// contrairement au bouton "💡 Indice", classique et pénalisé au score.

const MENTOR_TIPS = {
  'Linux — élévation locale': {
    attack: [
      "Sur une machine Linux, l'énumération commence toujours pareil : qui suis-je, quels binaires puis-je exécuter avec plus de droits que prévu, quels fichiers me sont accessibles en écriture ?",
      "Une élévation locale vient presque toujours d'un écart entre l'intention (« seul root peut faire ça ») et la réalité (une permission, une capacité ou une tâche planifiée qui contourne cet écart). Qu'est-ce qui, ici, a un droit qu'il ne devrait pas avoir ?",
      "Une fois un point d'entrée repéré, demandez-vous : qu'exécute-t-il, avec quels droits, et puis-je influencer ce qu'il exécute ?",
      "Pensez aux trois familles classiques d'élévation Linux : un binaire SUID/sudo mal configuré, une capacité Linux (`getcap`) accordée en trop, ou une tâche planifiée (cron) qui manipule un fichier modifiable par vous. Laquelle correspond à ce que vous observez ?",
      "Si vous hésitez encore entre plusieurs pistes, listez d'abord systématiquement ce qui tourne avec des droits élevés (`ps`, `sudo -l`, `find ... -perm`) avant de choisir laquelle creuser — c'est plus rapide que de deviner."
    ],
    defense: [
      "Corriger une élévation locale, c'est retirer le droit ou la capacité en trop — jamais cacher le fichier ou le service.",
      "Quel est le principe du moindre privilège applicable ici, et quelle commande permet d'y revenir précisément ?",
      "Après votre correctif, rejouez l'attaque avec `replay` : un correctif partiel laisse souvent un chemin alternatif ouvert.",
      "Demandez-vous précisément : qui (utilisateur, groupe, capacité) avait ce droit en trop, et quelle est la valeur minimale à laquelle il faut le ramener plutôt que de tout supprimer en bloc ?",
      "Si vous ne savez pas quel fichier éditer, repensez à celui que vous avez examiné en phase d'attaque pour repérer la faille — c'est généralement le même qu'il faut corriger."
    ]
  },
  'Réseau & annuaires': {
    attack: [
      "Un service réseau mal configuré expose souvent plus que prévu à qui sait interroger le bon protocole. Quel service est en jeu, et quelle commande permet de l'interroger sans authentification ?",
      "Demandez-vous ce que ce service était censé exposer uniquement en interne, et ce qu'un attaquant externe peut en tirer sans identifiants.",
      "Une fois les informations obtenues, quel accès direct (montage, connexion, requête) permettent-elles d'obtenir sur la cible ?",
      "Identifiez d'abord le protocole exact en jeu (partage de fichiers, annuaire, cache clé-valeur, base de données...) : chacun a sa propre commande d'énumération anonyme, et c'est elle qu'il faut trouver en premier.",
      "Si l'énumération anonyme ne révèle rien d'exploitable directement, cherchez ce qu'elle révèle indirectement (nom d'utilisateur, chemin, version) et qui pourrait servir à l'étape suivante."
    ],
    defense: [
      "La plupart de ces failles réseau se corrigent en restreignant l'accès anonyme ou l'exposition par défaut du service, pas en le désactivant entièrement.",
      "Quelle option de configuration du service permet de forcer une authentification ou de restreindre les hôtes autorisés ?",
      "Vérifiez avec `replay` que la même requête, une fois le service durci, échoue bien.",
      "Cherchez dans le fichier de configuration du service la ligne qui autorise l'accès anonyme ou sans restriction — c'est presque toujours une seule directive à changer, pas une refonte complète.",
      "Si plusieurs réglages semblent liés, corrigez d'abord celui qui correspond exactement à la commande que vous avez utilisée en attaque : c'est le chemin le plus court vers un `replay` réussi."
    ]
  },
  'Conteneurs & orchestration': {
    attack: [
      "Dans un environnement conteneurisé, la question centrale est : qu'est-ce qui relie ce conteneur (ou ce pod) à la machine hôte de façon plus large que nécessaire ?",
      "Un socket, un volume ou un privilège mal scopé permet souvent de sortir du conteneur plutôt que d'y rester enfermé. Qu'est-ce qui, ici, franchit cette frontière ?",
      "Une fois sorti du conteneur, quel accès obtenez-vous réellement sur l'hôte ou le nœud ?",
      "Vérifiez systématiquement trois points : le conteneur tourne-t-il en mode privilégié ou avec des capacités étendues, un socket ou un volume sensible de l'hôte est-il monté à l'intérieur, et une API d'orchestration est-elle joignable sans authentification ?",
      "Si vous avez trouvé un accès en lecture à un socket ou une API, la question suivante est : quelle commande de ce même outil permet d'exécuter du code plutôt que juste de lister des informations ?"
    ],
    defense: [
      "Le correctif consiste presque toujours à retirer l'accès privilégié ou le montage superflu, pas à supprimer le conteneur.",
      "Quel paramètre (capacité, volume, contrôleur d'admission, authentification du registre) aurait dû empêcher cette évasion ?",
      "Confirmez avec `replay` que l'évasion échoue désormais.",
      "Repérez précisément quelle option de lancement (drapeau de privilège, montage, capacité ajoutée) a permis la sortie du conteneur — c'est celle-là qu'il faut retirer, sans toucher au reste de la configuration.",
      "Si le correctif touche à l'authentification d'un registre ou d'une API d'orchestration, vérifiez que vous exigez bien une authentification plutôt que de simplement masquer l'endpoint."
    ]
  },
  'Cloud & Infrastructure as Code': {
    attack: [
      "Dans le cloud, les secrets fuient rarement par piratage : ils sont souvent simplement mal exposés (stockage public, état d'infrastructure non protégé, API interne joignable). Qu'est-ce qui est accessible ici sans authentification ?",
      "Une fois une ressource cloud repérée, que contient-elle qui pourrait servir à aller plus loin (identifiants, jetons, configuration) ?",
      "Réfléchissez à la différence entre ce qui est censé être privé par défaut sur ce service cloud, et ce qui l'est réellement dans ce scénario.",
      "Le cloud ajoute une dimension supplémentaire au « qui a accès à quoi » classique : un rôle, une clé ou un jeton peut porter une portée bien plus large que son usage réel. Comparez ce que l'identité utilisée est censée faire et ce qu'elle peut réellement faire.",
      "Une fois un identifiant ou un jeton trouvé, la question devient : quelle action de l'API du service (créer, supprimer, lister) confirme que la sur-permission est bien exploitable, pas seulement théorique ?"
    ],
    defense: [
      "Le correctif porte presque toujours sur la visibilité de la ressource (accès public → privé) ou sur la rotation d'un secret exposé.",
      "Quelle commande ou quel paramètre restreint l'accès à la ressource cloud concernée au strict nécessaire ?",
      "Vérifiez avec `replay` que l'accès public initial n'est plus possible.",
      "Pour un rôle, une clé ou un jeton trop permissif, la correction consiste à réduire la portée déclarée (l'action ou le service autorisé) au strict usage réel constaté — pas à révoquer l'identité entière si elle reste nécessaire.",
      "Si le secret lui-même a fuité (codé en dur, poussé par erreur), corriger l'endroit où il est stocké ne suffit pas toujours en pratique : ici, dans ce scénario simulé, retirez-le du code et faites-le lire depuis une variable d'environnement."
    ]
  },
  'Applications web': {
    attack: [
      "Une application web vulnérable laisse souvent une trace de son fonctionnement interne (code source, jeton, journal) accessible depuis l'extérieur. Que peut-on lire ici qui ne devrait pas l'être ?",
      "Si l'application traite une entrée utilisateur sans la valider (jeton, gabarit, objet sérialisé), que se passe-t-il si vous la falsifiez ou l'enrichissez ?",
      "Une fois une faille identifiée côté web, quel niveau d'accès obtenez-vous réellement sur le serveur applicatif ?",
      "Distinguez les deux grandes familles de failles web : celles où l'application fait trop confiance à une donnée qu'elle reçoit (jeton, objet sérialisé, gabarit), et celles où elle expose par erreur quelque chose qui devrait rester interne (fichier, journal, endpoint). Laquelle correspond à ce scénario ?",
      "Si vous avez trouvé une entrée non validée, cherchez la syntaxe précise que ce composant (bibliothèque de gabarits, format de jeton, désérialiseur) accepte et qui n'était pas censée être atteignable par un utilisateur externe."
    ],
    defense: [
      "Le correctif consiste à valider ou signer correctement ce que l'application faisait confiance sans vérification.",
      "Quel mécanisme (validation d'entrée, vérification de signature, retrait de l'exposition publique) manquait ici ?",
      "Confirmez avec `replay` que la falsification ou la fuite initiale ne fonctionne plus.",
      "Si la faille vient d'une entrée non validée, le correctif porte sur le point de validation exact (algorithme accepté, format attendu, échappement) — pas sur un filtrage générique en périphérie qui laisserait d'autres variantes passer.",
      "Si la faille vient d'une exposition (fichier, endpoint, journal), vérifiez que le correctif retire l'accès public plutôt que de simplement renommer ou déplacer la ressource exposée."
    ]
  },
  'Active Directory / Windows': {
    attack: [
      "Dans un domaine Active Directory, la question centrale est toujours : quel compte ou quel objet a plus de droits, plus de confiance, ou moins de protection que ce que son rôle affiché laisse penser ?",
      "Les attaques AD classiques exploitent presque toujours un attribut de configuration mal réglé (pré-authentification désactivée, délégation trop permissive, droit de réplication accordé à tort, ACL trop large) plutôt qu'une vraie faille logicielle. Lequel correspond à ce scénario ?",
      "Une fois un identifiant, un hash ou un ticket obtenu, quelle est la prochaine étape logique pour le transformer en accès plus large sur le domaine ?",
      "Distinguez ce qui s'attaque directement à un compte (mot de passe, hash récupérable hors-ligne) de ce qui s'attaque à une relation de confiance entre objets du domaine (délégation, réplication, permission sur un objet de stratégie). Laquelle est en jeu ici ?",
      "Si vous avez trouvé un attribut ou un droit anormal, la commande suivante est presque toujours celle qui interroge spécifiquement ce mécanisme Kerberos ou cette ACL — pas une commande d'énumération générique déjà utilisée."
    ],
    defense: [
      "Le correctif consiste à retirer l'attribut ou le droit accordé à tort, jamais à cacher le compte ou l'objet concerné.",
      "Quel est le réglage par défaut, sécurisé, auquel il faut revenir précisément sur ce compte ou cet objet ?",
      "Vérifiez avec `replay` que la même chaîne d'attaque échoue bien une fois le correctif appliqué.",
      "Demandez-vous quel est le champ exact (booléen, liste de groupes, droit ACL) qui porte la sur-permission, plutôt que de modifier l'objet entier.",
      "Si le correctif touche une GPO ou une délégation, vérifiez bien que seul le groupe légitime (administrateurs du domaine) garde le droit concerné — pas qu'il soit simplement ajouté en plus du groupe trop large."
    ]
  },
  'Mobile & API embarquées': {
    attack: [
      "Un binaire mobile publié — APK, IPA — doit toujours être considéré comme entièrement lisible par l'attaquant, une fois décompilé. Qu'est-ce qui, dans ce scénario, aurait dû rester uniquement côté serveur ?",
      "La confiance d'une application mobile envers son propre réseau ou son propre backend est-elle vérifiée activement (épinglage, portée précise d'une clé, correspondance exacte d'une redirection), ou seulement supposée ?",
      "Distinguez ce qui fuit directement depuis le code de l'application (un secret codé en dur) de ce qui se produit seulement lors d'une interaction réseau (interception, redirection détournée). Laquelle est en jeu ici ?",
      "Une fois un identifiant, une clé ou un jeton obtenu côté mobile, la question suivante est toujours : quelle portée exacte le backend lui accorde-t-il réellement, au-delà de ce que l'application prévoyait ?",
      "Si l'énumération du code décompilé ne révèle rien directement exploitable, cherchez plutôt du côté de ce que l'application fait confiance sans vérifier au moment de la connexion réseau."
    ],
    defense: [
      "Le correctif ne consiste presque jamais à retirer une fonctionnalité mobile légitime, mais à en restreindre strictement la portée ou la vérification.",
      "Quelle valeur, une fois comparée précisément (empreinte de certificat, portée de clé, URL de redirection exacte) plutôt que simplement acceptée, referme la faille ?",
      "Vérifiez avec `replay` que la même interaction, une fois le réglage corrigé, est désormais rejetée.",
      "Si la faille vient d'un secret partagé entre deux usages (mobile public et accès interne), le correctif porte sur la séparation des portées, pas sur la rotation seule du secret — qui resterait aussi large qu'avant.",
      "Si la faille vient d'une vérification réseau absente (certificat, redirection), assurez-vous que le correctif compare une valeur exacte et non un simple format ou une simple présence."
    ]
  }
};

const MENTOR_GENERIC = {
  attack: [
    "Avant de taper une commande, formulez l'hypothèse que vous testez : que cherchez-vous exactement à confirmer ?",
    "Qu'est-ce qui, dans ce système, a plus de droits ou plus de visibilité que ce que son rôle affiché laisse penser ?",
    "Une fois un indice trouvé, quelle est la prochaine étape logique pour transformer cette information en accès ?",
    "Si vous êtes bloqué, revenez à l'énumération de base : qui êtes-vous, où êtes-vous, et qu'est-ce qui est accessible en écriture ou en exécution que vous n'attendriez pas ?",
    "Relisez le titre et la catégorie du scénario : ils désignent souvent directement la classe de faille en jeu, ce qui réduit beaucoup l'espace de recherche."
  ],
  defense: [
    "Le correctif le plus solide retire la cause profonde (permission, configuration, absence de validation), pas seulement le symptôme observé.",
    "Quelle commande permet de vérifier l'état actuel avant de le corriger, pour être sûr de cibler le bon réglage ?",
    "Une fois le correctif appliqué, `replay` est le meilleur moyen de vérifier qu'il tient réellement la route.",
    "Si `replay` échoue encore après votre correctif, demandez-vous si vous avez corrigé exactement ce que l'attaque exploitait, ou seulement une variante proche.",
    "Le fichier ou paramètre à modifier est presque toujours celui que vous avez examiné ou exploité pendant la phase d'attaque — reprenez cette piste avant d'en chercher une nouvelle."
  ]
};

function scenarioClusterName(scenarioId){
  if(typeof NETWORK_CLUSTERS === 'undefined' || !scenarioId) return null;
  const cluster = NETWORK_CLUSTERS.find(c=> c.ids.includes(scenarioId));
  return cluster ? cluster.name : null;
}

function getMentorTips(scn, phase){
  const clusterName = scn ? scenarioClusterName(scn.id) : null;
  const bank = (clusterName && MENTOR_TIPS[clusterName]) ? MENTOR_TIPS[clusterName][phase] : null;
  return (bank && bank.length) ? bank : MENTOR_GENERIC[phase];
}

function nextMentorTip(scn, phase, index){
  const tips = getMentorTips(scn, phase);
  return tips[index % tips.length];
}

/* ---------- Succès (achievements) ---------- */

const ACHIEVEMENTS = [
  {id:'first-blood',     icon:'🩸', title:'Premier sang',            desc:"Compromettre votre premier système."},
  {id:'blue-team',       icon:'🛡️', title:'Bleu de méthode',         desc:"Durcir votre première configuration."},
  {id:'no-hints',        icon:'🧠', title:'Sans filet',              desc:"Réussir une phase sans le moindre indice."},
  {id:'speedrunner',     icon:'⚡', title:'Speedrunner',             desc:"Compromettre un système en moins de 45 secondes."},
  {id:'halfway',         icon:'🏁', title:'À mi-parcours',           desc:"Sécuriser la moitié des systèmes du parcours."},
  {id:'full-clear',      icon:'🏆', title:'Parcours complet',        desc:`Sécuriser les ${SCENARIOS.length} systèmes du parcours Red vs Blue.`},
  {id:'sandbox-rookie',  icon:'🎲', title:'Apprenti du hasard',      desc:"Résoudre 3 défis en bac à sable."},
  {id:'sandbox-veteran', icon:'🎯', title:'Vétéran du bac à sable',  desc:"Résoudre 10 défis en bac à sable."},
  {id:'first-lesson',    icon:'📖', title:'Curieux',                 desc:"Lire votre première leçon dans le mode Apprendre."},
  {id:'scholar',         icon:'📚', title:'Studieux',                desc:`Lire la moitié des ${SCENARIOS.length} leçons du mode Apprendre.`},
  {id:'theorist',        icon:'🎓', title:'Théoricien',              desc:"Lire l'intégralité des leçons du mode Apprendre."},
  {id:'chain-master',    icon:'🔗', title:'Enchaîneur',              desc:"Terminer une chaîne d'attaque complète, du premier accès au root."},
  {id:'sharpshooter',    icon:'🎯', title:'Tireur d\'élite',          desc:`Enchaîner ${ADAPTIVE_THRESHOLD} phases réussies sans le moindre indice.`},
  {id:'exam-taker',      icon:'🎓', title:'Candidat',                desc:"Terminer une première session d'examen chronométré, dans les temps ou non."},
  {id:'exam-ace',        icon:'🥇', title:'Major de promotion',      desc:"Traiter tous les systèmes d'une session d'examen (attaque + défense) avant l'expiration du temps."}
];

const ACH_KEY = 'redvsblue_achievements_v1';

function loadUnlockedAchievements(){
  try{
    const raw = JSON.parse(localStorage.getItem(ACH_KEY));
    return Array.isArray(raw) ? raw : [];
  }catch(e){ return []; }
}
function saveUnlockedAchievements(list){
  try{ localStorage.setItem(ACH_KEY, JSON.stringify(list)); }catch(e){}
}
function unlockAchievement(id){
  const list = loadUnlockedAchievements();
  if(list.includes(id)) return false;
  list.push(id);
  saveUnlockedAchievements(list);
  return true;
}

function checkAchievements(ctx){
  ctx = ctx || {};
  const unlocked = loadUnlockedAchievements();
  const newly = [];
  function tryUnlock(id, cond){
    if(unlocked.includes(id) || !cond) return;
    if(unlockAchievement(id)) newly.push(id);
  }

  const doneCount = SCENARIOS.filter(s=>progress[s.id].attack && progress[s.id].defense).length;
  tryUnlock('first-blood', SCENARIOS.some(s=>progress[s.id].attack));
  tryUnlock('blue-team', SCENARIOS.some(s=>progress[s.id].defense));
  tryUnlock('halfway', doneCount >= Math.ceil(SCENARIOS.length/2));
  tryUnlock('full-clear', doneCount === SCENARIOS.length);
  if(ctx.hints === 0) tryUnlock('no-hints', true);
  if(ctx.phase === 'attack' && typeof ctx.elapsedSec === 'number') tryUnlock('speedrunner', ctx.elapsedSec < 45);
  const sb = loadSandboxStats();
  tryUnlock('sandbox-rookie', sb.solved >= 3);
  tryUnlock('sandbox-veteran', sb.solved >= 10);

  const readCount = (typeof loadReadLessons === 'function') ? loadReadLessons().length : 0;
  tryUnlock('first-lesson', readCount >= 1);
  tryUnlock('scholar', readCount >= Math.ceil(SCENARIOS.length/2));
  tryUnlock('theorist', readCount >= SCENARIOS.length);

  const chainsDone = (typeof loadDoneChains === 'function') ? loadDoneChains().length : 0;
  tryUnlock('chain-master', chainsDone >= 1);

  tryUnlock('sharpshooter', adaptiveStreak() >= ADAPTIVE_THRESHOLD);

  if(ctx.exam){
    tryUnlock('exam-taker', true);
    tryUnlock('exam-ace', !ctx.examTimedOut && ctx.examFullyDone === ctx.examSystems);
  }

  newly.forEach(id=>{
    const a = ACHIEVEMENTS.find(x=>x.id===id);
    if(!a) return;
    playSound('achievement');
    if(window.showAchievementToast) window.showAchievementToast(a);
  });
}

/* ---------- Rapport de session (v0.5) ---------- */
// Export Markdown du parcours : failles trouvées, correctifs appliqués,
// verdicts de replay — pensé pour être joint à une soutenance BTS.

function generateSessionReportMarkdown(){
  const now = new Date();
  const doneCount = SCENARIOS.filter(s=>progress[s.id].attack && progress[s.id].defense).length;
  const attackedCount = SCENARIOS.filter(s=>progress[s.id].attack).length;
  const lines = [];

  lines.push('# Rapport de session — Red vs Blue');
  lines.push('');
  lines.push(`Généré le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR')}.`);
  lines.push('');
  lines.push('## Synthèse');
  lines.push('');
  lines.push(`- Systèmes compromis (phase attaque) : **${attackedCount} / ${SCENARIOS.length}**`);
  lines.push(`- Systèmes intégralement sécurisés (attaque + défense) : **${doneCount} / ${SCENARIOS.length}**`);
  lines.push(`- Score cumulé : **${totalScore()} pts**`);
  lines.push(`- Temps de jeu cumulé : **${formatDuration(totalPlayTimeSec())}**`);
  const unlockedIds = loadUnlockedAchievements();
  lines.push(`- Succès débloqués : **${unlockedIds.length} / ${ACHIEVEMENTS.length}**` +
    (unlockedIds.length ? ' — ' + unlockedIds.map(id=>{
      const a = ACHIEVEMENTS.find(x=>x.id===id);
      return a ? a.title : id;
    }).join(', ') : ''));
  const readLessons = (typeof loadReadLessons === 'function') ? loadReadLessons() : [];
  lines.push(`- Leçons étudiées (mode Apprendre) : **${readLessons.length} / ${SCENARIOS.length}**`);
  lines.push('');

  if(readLessons.length){
    lines.push('## Progression pédagogique (mode Apprendre)');
    lines.push('');
    lines.push('Vulnérabilités dont la théorie a été étudiée (concept, attaque, défense) :');
    lines.push('');
    SCENARIOS.forEach((s,i)=>{
      if(readLessons.includes(s.id)){
        lines.push(`- ✅ Leçon ${String(i+1).padStart(2,'0')} — ${s.title} _(${s.category})_`);
      }
    });
    lines.push('');
  }

  lines.push('## Détail par système');
  lines.push('');
  lines.push('| # | Système | Catégorie | Attaque | Score att. | Indices att. | Défense | Score déf. | Indices déf. | Verdict `replay` |');
  lines.push('|---|---------|-----------|:-------:|:----------:|:-------------:|:-------:|:----------:|:-------------:|:-----------------:|');

  SCENARIOS.forEach((s, i)=>{
    const p = progress[s.id];
    const attackDone = !!p.attack;
    const defenseDone = !!p.defense;
    const attackCell = attackDone ? '🚩 compromis' : (isScenarioUnlocked(i) ? '⏳ non tenté' : '🔒 verrouillé');
    const defenseCell = defenseDone ? '🛡️ corrigé' : (attackDone ? '⏳ non tenté' : '—');
    const verdictCell = defenseDone ? '✅ attaque bloquée' : (attackDone ? '❌ faille toujours ouverte' : '—');
    lines.push(`| ${String(i+1).padStart(2,'0')} | ${s.title} | ${s.category} | ${attackCell} | ${attackDone ? p.scoreAttack : '—'} | ${attackDone ? (p.hintsAttack||0) : '—'} | ${defenseCell} | ${defenseDone ? p.scoreDefense : '—'} | ${defenseDone ? (p.hintsDefense||0) : '—'} | ${verdictCell} |`);
  });

  lines.push('');
  lines.push('## Classement local (cet appareil)');
  lines.push('');
  const lb = loadLeaderboard();
  if(!lb.length){
    lines.push('_Aucun parcours complet enregistré au classement pour l\'instant._');
  } else {
    lines.push('| Rang | Pseudo | Score | Temps cumulé | Date |');
    lines.push('|------|--------|:-----:|:-------------:|------|');
    lb.slice(0,10).forEach((e,i)=>{
      lines.push(`| ${i+1} | ${e.name} | ${e.totalScore} pts | ${formatDuration(e.totalTimeSec)} | ${new Date(e.date).toLocaleDateString('fr-FR')} |`);
    });
  }
  lines.push('');
  lines.push('---');
  lines.push('_Rapport généré localement par le simulateur Red vs Blue — aucune donnée n\'a quitté le navigateur._');

  return lines.join('\n');
}

function downloadSessionReport(){
  const md = generateSessionReportMarkdown();
  const blob = new Blob([md], {type:'text/markdown'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `redvsblue-rapport-session-${stamp}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 2000);
}
// Synthétisée via WebAudio, aucun fichier son requis.
// Désactivée par défaut (respect des salles de classe / casque).

const SOUND_KEY = 'redvsblue_sound_v1';
let soundEnabled = false;
try{ soundEnabled = localStorage.getItem(SOUND_KEY) === '1'; }catch(e){}
let audioCtx = null;

function ensureAudioCtx(){
  if(!audioCtx){
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(Ctx) audioCtx = new Ctx();
  }
  if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function isSoundEnabled(){ return soundEnabled; }
function setSoundEnabled(v){
  soundEnabled = !!v;
  try{ localStorage.setItem(SOUND_KEY, soundEnabled ? '1' : '0'); }catch(e){}
  if(soundEnabled) ensureAudioCtx();
}

function playTone(freq, duration, type, vol){
  if(!soundEnabled) return;
  try{
    const ctx = ensureAudioCtx();
    if(!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.value = vol !== undefined ? vol : 0.05;
    osc.connect(gain).connect(ctx.destination);
    const t0 = ctx.currentTime;
    osc.start(t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.stop(t0 + duration + 0.02);
  }catch(e){ /* silencieux si l'audio n'est pas disponible */ }
}

function playSound(kind){
  if(!soundEnabled) return;
  switch(kind){
    case 'key': playTone(560 + Math.random()*90, 0.02, 'square', 0.018); break;
    case 'error': playTone(180, 0.16, 'sawtooth', 0.05); break;
    case 'hint': playTone(440, 0.09, 'triangle', 0.04); break;
    case 'success':
      playTone(880, 0.12, 'sine', 0.06);
      setTimeout(()=>playTone(1320, 0.18, 'sine', 0.06), 110);
      break;
    case 'hardened':
      playTone(660, 0.1, 'sine', 0.06);
      setTimeout(()=>playTone(990, 0.1, 'sine', 0.06), 90);
      setTimeout(()=>playTone(1320, 0.22, 'sine', 0.06), 180);
      break;
    case 'achievement':
      playTone(523.25, 0.1, 'triangle', 0.06);
      setTimeout(()=>playTone(659.25, 0.1, 'triangle', 0.06), 100);
      setTimeout(()=>playTone(783.99, 0.22, 'triangle', 0.06), 200);
      break;
  }
}
