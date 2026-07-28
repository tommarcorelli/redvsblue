/* ===================================================================
   Glossaire pédagogique — RED vs BLUE (v4.8)
   ---------------------------------------------------------------
   Dictionnaire transverse des notions rencontrées dans les 67
   scénarios (permissions Linux, Active Directory, cloud/IaC,
   conteneurs, réseau, applicatif web...), consultable indépendamment
   de tout scénario précis. Module autonome : simple liste statique +
   un filtre texte + son rendu, aucune dépendance sur scenarios.js ni
   sur l'état de progression — donc aucun risque pour le reste du jeu.
   =================================================================== */

const GLOSSARY = [
  { term:"AS-REP Roasting", def:"Attaque Active Directory contre les comptes dont la pré-authentification Kerberos est désactivée : n'importe qui peut demander un ticket AS-REP chiffré avec le hash du mot de passe du compte visé, puis le craquer hors ligne sans jamais avoir tenté d'authentification." },
  { term:"Bit SUID (Set-UID)", def:"Permission Unix qui fait qu'un binaire s'exécute avec les droits de son propriétaire (souvent root) plutôt qu'avec ceux de l'utilisateur qui le lance. Très utile pour des outils comme passwd, dangereux si posé sur un binaire qui permet une évasion (voir GTFOBins)." },
  { term:"BOLA / IDOR", def:"Broken Object Level Authorization (ou IDOR, Insecure Direct Object Reference) : une API accepte un identifiant fourni par le client (ex. /invoices/1042) sans vérifier que l'utilisateur a réellement le droit d'accéder à cette ressource précise." },
  { term:"cap_dac_read_search", def:"Capacité Linux fine-grained qui autorise à lire n'importe quel fichier ou dossier en contournant les permissions standard, sans donner tous les pouvoirs de root. Accordée par erreur à un binaire, elle permet souvent de lire /etc/shadow." },
  { term:"cgroup release_agent", def:"Mécanisme des control groups Linux permettant d'exécuter un script sur l'hôte quand un groupe de processus se vide. Dans un conteneur mal isolé et avec un accès en écriture au pseudo-système de fichiers cgroup, il permet une évasion vers l'hôte." },
  { term:"Cheminement PATH (PATH hijacking)", def:"Détournement de la variable d'environnement $PATH pour faire exécuter, à la place d'un binaire légitime, un faux exécutable placé dans un dossier scanné avant le vrai — typiquement exploité via un script privilégié qui appelle une commande sans chemin absolu." },
  { term:"CORS (Cross-Origin Resource Sharing)", def:"Mécanisme du navigateur qui autorise une page d'un domaine à appeler une API d'un autre domaine. Une configuration trop permissive (Access-Control-Allow-Origin: * combiné à Allow-Credentials) permet à un site malveillant de lire des réponses destinées à l'utilisateur authentifié." },
  { term:"Constrained delegation / S4U2Proxy", def:"Fonctionnalité Kerberos qui autorise un compte de service à s'authentifier « au nom » d'un autre utilisateur auprès d'un service précis. Mal configurée, elle permet d'usurper n'importe quel compte — y compris un administrateur — auprès du service ciblé." },
  { term:"CVE (Common Vulnerabilities and Exposures)", def:"Identifiant public normalisé attribué à une vulnérabilité connue et documentée (ex. CVE-2021-44228 pour Log4Shell), permettant de la référencer sans ambiguïté entre bases de données, éditeurs et chercheurs." },
  { term:"DCSync", def:"Abus d'une réplication Active Directory légitime : un compte disposant des droits de réplication (souvent obtenus par erreur de délégation) peut demander au contrôleur de domaine de lui envoyer les hashes de n'importe quel compte, y compris ceux de tous les administrateurs." },
  { term:"Docker (évasion de conteneur)", def:"Sortie du périmètre normalement isolé d'un conteneur pour agir directement sur la machine hôte — par exemple via un socket Docker exposé, un montage privilégié, ou un espace de noms partagé avec l'hôte." },
  { term:"env_keep (sudoers)", def:"Option de configuration sudo qui préserve certaines variables d'environnement (comme $PATH ou $LD_PRELOAD) lors de l'exécution d'une commande en sudo. Mal choisie, elle permet d'injecter du code exécuté avec les privilèges élevés de la commande sudo autorisée." },
  { term:"etcd", def:"Base de données clé-valeur distribuée utilisée par Kubernetes pour stocker tout l'état du cluster, y compris les secrets. Exposée sans authentification, elle donne un accès en lecture (et souvent en écriture) à l'intégralité des données sensibles du cluster." },
  { term:"GPO (Group Policy Object)", def:"Objet de stratégie de groupe Active Directory qui pousse une configuration à des machines ou utilisateurs (scripts de démarrage, restrictions, logiciels...). Une GPO modifiable par un utilisateur standard permet d'y injecter une commande exécutée avec les droits système sur toutes les machines ciblées." },
  { term:"GPP cpassword", def:"Ancien mécanisme de Group Policy Preferences qui stockait des mots de passe (comptes locaux, tâches planifiées) chiffrés avec une clé AES statique, publiée par Microsoft — donc triviale à déchiffrer une fois le fichier SYSVOL lu." },
  { term:"GraphQL (introspection)", def:"Fonctionnalité GraphQL qui permet d'interroger le schéma de l'API elle-même (types, champs, mutations disponibles). Laissée active en production, elle offre à un attaquant une cartographie complète de l'API, y compris des champs qui n'auraient jamais dû être documentés publiquement." },
  { term:"GTFOBins", def:"Projet communautaire référençant, pour des centaines de binaires Unix légitimes (find, vim, python...), les techniques permettant de détourner leurs fonctionnalités normales pour élever ses privilèges ou s'évader d'un shell restreint — notamment quand ils portent un bit SUID ou sont autorisés en sudo." },
  { term:"IAM (Identity and Access Management)", def:"Système cloud de gestion des identités et des permissions (rôles, politiques). Un rôle IAM trop permissif accorde à un composant applicatif bien plus de droits que ce dont il a réellement besoin, ce qui aggrave l'impact de toute compromission de ce composant." },
  { term:"IMDS (Instance Metadata Service)", def:"Service interne accessible depuis une machine virtuelle cloud (souvent à l'adresse 169.254.169.254) qui expose sa configuration, y compris des identifiants temporaires. Une vulnérabilité SSRF côté applicatif peut être utilisée pour forcer le serveur à interroger ce service à la place de l'attaquant." },
  { term:"JWT (JSON Web Token) — alg=none", def:"Un jeton JWT encode dans son en-tête l'algorithme de signature utilisé. Si le serveur fait confiance à cet en-tête sans le vérifier, un attaquant peut forger un jeton avec alg=none (aucune signature) et se faire passer pour n'importe quel utilisateur." },
  { term:"Kerberoasting", def:"Attaque Active Directory qui consiste à demander un ticket de service Kerberos (TGS) pour un compte de service, puis à craquer hors ligne le hash qui protège ce ticket — souvent efficace car les mots de passe de comptes de service sont rarement renouvelés ou complexes." },
  { term:"Kubernetes RBAC", def:"Système de contrôle d'accès par rôles de Kubernetes, qui définit quelles actions un compte de service ou un utilisateur peut effectuer sur quelles ressources du cluster. Une liaison de rôle trop permissive (ex. cluster-admin accordé sans nécessité) annule l'isolement voulu entre applications." },
  { term:"LAPS (Local Administrator Password Solution)", def:"Solution Microsoft qui attribue à chaque machine Windows un mot de passe administrateur local unique et le fait tourner automatiquement, stocké dans Active Directory — évite qu'un seul mot de passe administrateur local compromis ne donne accès à tout le parc." },
  { term:"LDAP (annuaire)", def:"Protocole standard d'annuaire utilisé notamment par Active Directory pour stocker utilisateurs, groupes et permissions. Un accès anonyme (bind anonyme) laissé actif permet de lire toute la structure de l'annuaire sans aucune authentification." },
  { term:"LLMNR / NBT-NS (empoisonnement)", def:"Protocoles de résolution de noms utilisés par Windows en complément du DNS. Un attaquant sur le même réseau peut répondre frauduleusement à ces requêtes de diffusion pour intercepter des tentatives d'authentification NTLM et en récupérer les hashes." },
  { term:"Log4Shell (CVE-2021-44228)", def:"Vulnérabilité critique de la bibliothèque de journalisation Java Log4j : une simple chaîne de caractères journalisée (ex. dans un en-tête HTTP) peut déclencher le chargement et l'exécution de code distant, sans aucune autre interaction." },
  { term:"Mass Assignment", def:"Vulnérabilité d'API qui accepte tel quel un objet JSON envoyé par le client et l'assigne directement à un enregistrement interne, permettant à un attaquant de fournir des champs qu'il ne devrait pas pouvoir modifier (ex. role: \"admin\") en plus des champs attendus." },
  { term:"Memcached / Redis (non authentifiés)", def:"Services de cache en mémoire conçus à l'origine pour un réseau interne de confiance, souvent démarrés sans authentification par défaut. Exposés publiquement, ils laissent lire ou écrire librement toutes les données mises en cache — parfois jusqu'à l'exécution de code via des mécanismes annexes de Redis." },
  { term:"NFS (Network File System)", def:"Protocole de partage de fichiers réseau Unix. Un export NFS mal restreint (no_root_squash notamment) peut permettre à un client distant de monter un partage avec des droits root, puis d'y déposer un binaire SUID exploité localement." },
  { term:"NTLM relay", def:"Attaque réseau qui relaie une tentative d'authentification NTLM interceptée vers un autre service, sans avoir besoin de connaître le mot de passe — rendue possible quand la signature SMB n'est pas exigée sur les machines cibles." },
  { term:"OAuth (portée de jeton trop large)", def:"Un jeton d'accès OAuth délivré à une application ne devrait porter que les portées (scopes) strictement nécessaires. Une portée trop large accordée par erreur permet à cette application — ou à qui vole son jeton — d'agir bien au-delà de son usage prévu." },
  { term:"Pass-the-Hash", def:"Technique qui consiste à s'authentifier directement avec le hash NTLM d'un mot de passe, sans jamais avoir besoin de le déchiffrer — le protocole NTLM ne demandant que ce hash pour prouver une identité." },
  { term:"Pickle (désérialisation Python)", def:"Le module pickle de Python peut reconstruire n'importe quel objet, y compris en exécutant du code arbitraire, à partir de données sérialisées. Désérialiser des données pickle venant d'une source non fiable équivaut à exécuter du code fourni par cette source." },
  { term:"PwnKit (CVE-2021-4034)", def:"Vulnérabilité critique de pkexec (composant polkit présent par défaut sur la quasi-totalité des distributions Linux) permettant à n'importe quel utilisateur local d'obtenir un shell root, via une erreur de traitement des arguments de la ligne de commande." },
  { term:"RBAC (Role-Based Access Control)", def:"Modèle de contrôle d'accès qui attribue des permissions à des rôles plutôt qu'à des utilisateurs individuels, puis assigne des rôles aux utilisateurs — utilisé aussi bien pour des API applicatives que pour Kubernetes." },
  { term:"Rate limiting (absence de)", def:"Le fait de ne pas limiter le nombre de requêtes qu'un client peut envoyer dans un temps donné. Son absence sur un point d'authentification ou de récupération de compte permet une attaque par force brute automatisée sans aucune contrainte." },
  { term:"Silver Ticket", def:"Falsification d'un ticket de service Kerberos (TGS) directement à partir du hash du compte de service ciblé, sans passer par le contrôleur de domaine — donne un accès total au service concerné, avec les droits que l'attaquant choisit d'y inscrire." },
  { term:"SMB (session nulle / signature absente)", def:"Protocole de partage de fichiers Windows. Une session nulle laisse lister utilisateurs et partages sans identifiants ; l'absence d'exigence de signature des messages SMB ouvre la voie à un relais NTLM." },
  { term:"SNMP (chaîne de communauté par défaut)", def:"Protocole de supervision réseau qui utilise une « chaîne de communauté » comme mot de passe simplifié. Laissée à sa valeur par défaut (souvent public), elle permet de lire — voire parfois modifier — la configuration de l'équipement interrogé." },
  { term:"S3 (compartiment public)", def:"Service de stockage objet cloud (Amazon S3 et équivalents). Un compartiment (bucket) rendu public par erreur de configuration expose son contenu à quiconque en connaît ou devine le nom, sans authentification." },
  { term:"SSRF (Server-Side Request Forgery)", def:"Vulnérabilité qui force un serveur à effectuer, pour le compte de l'attaquant, une requête réseau vers une destination qu'il ne devrait pas pouvoir choisir — typiquement utilisée pour atteindre des services internes autrement inaccessibles, comme l'IMDS cloud." },
  { term:"SSTI (Server-Side Template Injection)", def:"Injection de code dans un moteur de gabarit (template) exécuté côté serveur (ex. Jinja2). Si une entrée utilisateur est passée telle quelle au moteur de rendu au lieu d'être uniquement une valeur affichée, elle peut déclencher l'exécution de code arbitraire." },
  { term:"Sudoers", def:"Fichier de configuration qui définit quelles commandes un utilisateur peut exécuter avec les privilèges d'un autre (généralement root) via sudo, avec ou sans mot de passe. Une règle trop large ou une commande autorisée détournable (voir GTFOBins) permet une élévation de privilèges complète." },
  { term:"Tar (injection par caractère générique)", def:"Une commande tar exécutée automatiquement (ex. via cron) sur un dossier où un attaquant peut déposer des fichiers peut être détournée en nommant ces fichiers comme de fausses options tar (--checkpoint-action=exec=...), exécutées à la place d'une simple archive." },
  { term:"Terraform state (fuite)", def:"Le fichier d'état de Terraform décrit l'infrastructure provisionnée et peut contenir, en clair, des secrets générés ou référencés pendant le déploiement (mots de passe, clés). Un accès non protégé à ce fichier expose ces secrets bien au-delà de l'infrastructure elle-même." },
  { term:"Unconstrained delegation", def:"Configuration Active Directory qui autorise un serveur à réutiliser librement, auprès de n'importe quel autre service, l'identité complète de tout utilisateur qui s'y authentifie — y compris celle d'un administrateur de domaine si celui-ci vient s'y connecter." },
  { term:".git exposé (fuite de code source)", def:"Un dossier .git accessible publiquement sur un serveur web expose tout l'historique du dépôt, y compris des identifiants ou secrets qui auraient été supprimés du code actuel mais qui restent présents dans les anciens commits." }
].sort((a,b)=> a.term.localeCompare(b.term, 'fr'));

function renderGlossary(){
  const listEl = document.getElementById('glossary-list');
  const countEl = document.getElementById('glossary-count');
  if(!listEl) return;
  const q = (document.getElementById('glossary-search') || {}).value || '';
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? GLOSSARY.filter(g => g.term.toLowerCase().includes(needle) || g.def.toLowerCase().includes(needle))
    : GLOSSARY;

  listEl.innerHTML = '';
  filtered.forEach(g=>{
    const item = document.createElement('div');
    item.className = 'glossary-item';
    item.innerHTML = `<div class="gi-term">${escapeHtml(g.term)}</div><div class="gi-def">${escapeHtml(g.def)}</div>`;
    listEl.appendChild(item);
  });
  if(countEl) countEl.textContent = needle
    ? `${filtered.length} / ${GLOSSARY.length} termes`
    : `${GLOSSARY.length} termes`;
}
window.renderGlossary = renderGlossary;
