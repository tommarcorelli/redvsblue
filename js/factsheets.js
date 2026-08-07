/* ===================================================================
   Fiches techniques — RED vs BLUE
   ---------------------------------------------------------------
   Ce module ajoute, par-dessus les 67 scénarios existants, une fiche
   technique imprimable/exportable en HTML autonome : la faille, la
   référence réelle (CVE, technique MITRE ATT&CK, outil ou incident
   documenté) qui la rattache au monde réel, la méthode d'attaque et
   la remédiation — le tout réutilisant les données déjà présentes
   dans chaque scénario (aucune duplication de contenu).

   Volontairement séparé de scenarios.js : cette table ne modifie ni
   ne risque de casser aucune règle d'exploit ou de correctif déjà
   testée ; une entrée manquante ne bloque rien (repli générique).
   =================================================================== */

const FACTSHEET_META = {
  'suid-find': { severity:'Élevée', ref:'GTFOBins — binaire find', note:"Le projet GTFOBins catalogue depuis 2018 des dizaines de binaires SUID standards, dont find, détournables pour une élévation de privilèges — un classique de tout guide de post-exploitation Linux." },
  'cron-writable': { severity:'Élevée', ref:'Technique de post-exploitation Linux', note:"Un script exécuté périodiquement par root mais modifiable par un utilisateur non privilégié est l'une des voies d'élévation de privilèges les plus fréquemment documentées (HackTricks, PayloadsAllTheThings)." },
  'sudo-awk': { severity:'Élevée', ref:'GTFOBins — binaire awk', note:"awk autorisé sans restriction dans sudoers permet d'ouvrir un shell interactif hérité des privilèges root, référencé par GTFOBins parmi les contournements sudo les plus courants." },
  'ssh-key-exposed': { severity:'Élevée', ref:"Erreur de configuration classique", note:"Une clé privée SSH lisible par tous reste l'une des causes recensées de compromission dans les rapports d'incident cloud et CI/CD, où des dépôts ou artefacts de build exposent des clés par erreur." },
  'nfs-no-root-squash': { severity:'Élevée', ref:'Technique de post-exploitation Linux (NFS)', note:"L'absence de root_squash sur un export NFS est un classique documenté depuis les débuts de PentestMonkey/HackTricks : un client peut monter un binaire SUID root depuis n'importe quelle machine." },
  'dns-axfr': { severity:'Moyenne', ref:'Mauvaise configuration DNS historique', note:"Le transfert de zone (AXFR) non restreint est un défaut de configuration recensé depuis plus de vingt ans par les scanners de vulnérabilités (Nessus, OpenVAS) sur les serveurs DNS mal cloisonnés." },
  'ldap-anonymous-bind': { severity:'Moyenne', ref:"Audit d'annuaire LDAP/Active Directory", note:"La liaison anonyme LDAP est un point de contrôle systématique des audits Active Directory et OpenLDAP, car elle permet une énumération complète de l'annuaire sans le moindre identifiant." },
  'windows-unquoted-path': { severity:'Élevée', ref:'Élévation de privilèges Windows classique', note:"Le chemin de service Windows non entre guillemets est un défaut documenté depuis plus de quinze ans, encore systématiquement recherché par les scanners de configuration (PowerUp, WinPEAS)." },
  'docker-socket-writable': { severity:'Critique', ref:'docker.sock = accès root équivalent', note:"L'accès en écriture au socket Docker équivaut à un accès root sur l'hôte : un fait largement documenté dans la documentation officielle Docker elle-même, qui déconseille d'ajouter des utilisateurs non fiables au groupe docker." },
  'capability-setuid-python': { severity:'Élevée', ref:'GTFOBins — capacités Linux', note:"Les capacités Linux mal attribuées (cap_setuid notamment) à un interpréteur comme Python figurent dans le catalogue GTFOBins des vecteurs d'élévation de privilèges au même titre que les bits SUID classiques." },
  'path-hijack-cron': { severity:'Élevée', ref:'Détournement de $PATH — technique classique', note:"L'appel d'un binaire sans chemin absolu dans un script exécuté par root est un vecteur de détournement de $PATH documenté de longue date dans les guides de post-exploitation Linux." },
  'passwd-world-writable': { severity:'Critique', ref:'Fichier système critique mal protégé', note:"Un /etc/passwd modifiable par tous permet d'ajouter directement un compte UID 0 : une des élévations de privilèges les plus triviales et les plus anciennes documentées sur les systèmes Unix." },
  'shadow-world-readable': { severity:'Élevée', ref:'Cassage de hash hors-ligne', note:"Un /etc/shadow lisible par tous expose l'ensemble des hash de mots de passe locaux au cassage hors-ligne (John the Ripper, hashcat), un scénario classique d'audit de durcissement Linux." },
  'sudo-ld-preload': { severity:'Critique', ref:'GTFOBins — env_keep LD_PRELOAD', note:"Conserver LD_PRELOAD dans l'environnement sudo (env_keep) est un contournement bien connu, catalogué par GTFOBins, qui permet d'injecter du code arbitraire dans n'importe quel binaire exécuté via sudo." },
  'systemd-unit-writable': { severity:'Critique', ref:'Post-exploitation Linux — unités systemd', note:"Une unité systemd modifiable exécutée par root est un vecteur d'élévation de privilèges documenté au même titre que les scripts cron ou init.d modifiables, avec le même impact final." },
  'tar-wildcard-injection': { severity:'Élevée', ref:"DefenseCode — advisoire 2014 sur l'injection par caractère générique tar", note:"L'expansion non maîtrisée des caractères génériques par tar (options --checkpoint-action) a fait l'objet d'un avis de sécurité DefenseCode dès 2014, encore d'actualité dans les scripts de sauvegarde automatisés." },
  'pwnkit-cve-2021-4034': { severity:'Critique', ref:'CVE-2021-4034 « PwnKit »', note:"Découverte par Qualys en 2021 et publiée en janvier 2022, cette faille de pkexec (polkit) touchait par défaut la quasi-totalité des distributions Linux depuis 2009 — l'une des failles Linux les plus largement exploitées de son année." },
  'redis-unauthenticated': { severity:'Critique', ref:'Campagnes de cryptominage massives depuis 2018', note:"Des vers de cryptominage (dont le tristement célèbre « Redis-worm ») exploitent depuis 2018 des instances Redis exposées sans authentification pour y écrire des tâches cron malveillantes sur l'hôte." },
  'aws-imds-ssrf': { severity:'Critique', ref:'Faille exploitée lors de la fuite de données Capital One (2019)', note:"Une SSRF vers le service de métadonnées AWS (IMDSv1) a permis en 2019 le vol d'identifiants temporaires ayant conduit à l'une des plus grandes fuites de données bancaires jamais rendues publiques." },
  'git-directory-exposed': { severity:'Élevée', ref:'Défaut de configuration de serveur web récurrent', note:"Un dossier .git exposé sur un serveur web de production est un des défauts les plus fréquemment remontés par les scanners automatisés (dirsearch, gitleaks), révélant historique et secrets de commit." },
  'k8s-privileged-hostpath': { severity:'Critique', ref:'Pod Security Standards Kubernetes', note:"Les Pod Security Standards officiels de Kubernetes interdisent explicitement le montage hostPath combiné à un contexte privilégié, précisément parce que cette combinaison permet une évasion vers l'hôte." },
  'jwt-alg-none-forgery': { severity:'Critique', ref:'Faille historique des bibliothèques JWT (documentée depuis 2015)', note:"La confusion sur l'algorithme de signature (dont alg=none) a été documentée dès 2015 dans plusieurs bibliothèques JWT majeures et reste un point de contrôle systématique des audits d'API modernes." },
  'log4shell-jndi-rce': { severity:'Critique', ref:'CVE-2021-44228 « Log4Shell »', note:"Révélée en décembre 2021, cette faille de désérialisation JNDI dans Log4j 2.x a déclenché une exploitation massive à l'échelle d'Internet en quelques heures et reste l'une des CVE les plus critiques jamais publiées." },
  'capability-dac-read-search': { severity:'Élevée', ref:'GTFOBins — capacités Linux (cap_dac_read_search)', note:"Cette capacité, mal attribuée à un binaire, contourne les permissions de lecture de fichiers du noyau — un vecteur d'élévation catalogué par GTFOBins au même titre que cap_setuid." },
  's3-bucket-public': { severity:'Critique', ref:'Vague de fuites de données 2017-2019 (Verizon, Accenture, dossiers électoraux…)', note:"Des dizaines de fuites de données majeures entre 2017 et 2019 ont eu pour origine des buckets S3 rendus publics par erreur, un sujet devenu si récurrent qu'AWS a depuis renforcé les valeurs par défaut du service." },
  'terraform-state-exposed': { severity:'Élevée', ref:'Documentation officielle HashiCorp', note:"La documentation Terraform elle-même avertit que le fichier d'état peut contenir des secrets en clair et recommande un stockage distant chiffré avec contrôle d'accès strict — un point trop souvent ignoré en pratique." },
  'jenkins-script-console-open': { severity:'Critique', ref:'Console de script Groovy Jenkins non authentifiée', note:"L'endpoint /script de Jenkins, laissé accessible sans authentification, est un classique des rapports de pentest CI/CD car il offre nativement une exécution de code arbitraire sur l'agent de build." },
  'python-pickle-deserialization': { severity:'Critique', ref:'Documentation officielle Python', note:"La documentation du module pickle avertit explicitement depuis des années : « ne jamais désérialiser des données non fiables », un rappel né de multiples RCE réelles dans des applications web Python." },
  'ssti-jinja2-flask': { severity:'Critique', ref:'PortSwigger Web Security Academy — SSTI', note:"L'injection de gabarit côté serveur (SSTI) fait l'objet d'un module dédié chez PortSwigger et a donné lieu à de nombreuses CVE dans différents moteurs de templates, Jinja2 inclus, quand une entrée utilisateur atteint le moteur de rendu." },
  'elasticsearch-unauthenticated': { severity:'Critique', ref:'Vague d\'expositions massives de bases ad-tech et RH (2019)', note:"Plusieurs clusters Elasticsearch exposés sans authentification ont mené en 2019 à la découverte publique de bases de données contenant des millions d'enregistrements personnels, souvent signalées par des chercheurs indépendants." },
  'docker-registry-unauthenticated': { severity:'Élevée', ref:'Risque de chaîne d\'approvisionnement (registre de conteneurs)', note:"Un registre Docker privé exposé sans authentification est un point de contrôle des audits de sécurité cloud, car il expose potentiellement le code et les secrets embarqués dans les images de production." },
  'iam-role-overpermissive': { severity:'Élevée', ref:'CIS AWS Foundations Benchmark', note:"Le principe du moindre privilège pour les rôles IAM est l'un des contrôles fondamentaux du CIS AWS Foundations Benchmark, tant les rôles trop permissifs reviennent comme cause racine dans les incidents cloud." },
  'secret-in-public-repo': { severity:'Critique', ref:'GitHub Secret Scanning (programme lancé en 2018)', note:"GitHub a lancé son propre programme de détection automatique de secrets dans les dépôts publics précisément parce que ce problème reste l'une des causes les plus fréquentes de compromission d'identifiants cloud." },
  'oauth-token-overscope': { severity:'Élevée', ref:'OWASP API Security Top 10', note:"Le surdimensionnement des portées (scopes) OAuth est documenté dans le OWASP API Security Top 10 parmi les défauts d'autorisation les plus fréquents des API modernes." },
  'github-actions-secret-leak': { severity:'Critique', ref:'Incidents de chaîne d\'approvisionnement CI/CD (dont Codecov, 2021)', note:"L'exfiltration de secrets CI/CD via un pipeline compromis a été au cœur de plusieurs incidents de chaîne d'approvisionnement documentés, dont l'affaire Codecov de 2021." },
  'ad-asrep-roasting': { severity:'Élevée', ref:'MITRE ATT&CK T1558.004', note:"Popularisé par Tim Medin (conférence DerbyCon, 2014) sous le nom d'AS-REP Roasting, ce vecteur figure aujourd'hui dans le référentiel MITRE ATT&CK comme sous-technique documentée du vol d'identifiants Kerberos." },
  'ad-unconstrained-delegation': { severity:'Critique', ref:'MITRE ATT&CK T1558 — recherches SpecterOps/harmj0y', note:"L'abus de la délégation Kerberos sans contrainte est documenté depuis plusieurs années par les recherches de SpecterOps (harmj0y), qui l'ont popularisé comme l'un des chemins d'escalade Active Directory les plus critiques." },
  'ad-dcsync-abuse': { severity:'Critique', ref:'MITRE ATT&CK T1003.006 — mimikatz DCSync', note:"L'abus des droits de réplication du domaine (DCSync), implémenté dans mimikatz, est l'une des techniques Active Directory les plus documentées et les plus redoutées des équipes de sécurité." },
  'ad-gpo-writable': { severity:'Critique', ref:'Outil SharpGPOAbuse', note:"L'abus de stratégies de groupe modifiables est une technique bien documentée, popularisée notamment par l'outil SharpGPOAbuse, permettant de pousser une charge malveillante à tous les postes couverts par la GPO." },
  'idor-invoice-api': { severity:'Élevée', ref:'OWASP API Security Top 10 — API1:2023 BOLA', note:"La rupture du contrôle d'accès au niveau objet (Broken Object Level Authorization) occupe la première place du OWASP API Security Top 10, qui la considère comme le défaut le plus répandu des API REST." },
  'mass-assignment-signup': { severity:'Élevée', ref:'OWASP API Security Top 10 — Mass Assignment', note:"Le mass assignment a été à l'origine de plusieurs CVE réelles dans des frameworks web populaires (Rails notamment), menant OWASP à en faire une catégorie à part entière de son API Security Top 10." },
  'excessive-data-exposure-api': { severity:'Moyenne', ref:'OWASP API Security Top 10 — Excessive Data Exposure', note:"La sur-exposition de données par une API qui délègue le filtrage au client plutôt que de le faire côté serveur est une catégorie dédiée du OWASP API Security Top 10." },
  'missing-rate-limit-bruteforce': { severity:'Moyenne', ref:'OWASP API Security Top 10 — Lack of Resources & Rate Limiting', note:"L'absence de limitation de débit est documentée par l'OWASP comme facteur aggravant direct des attaques par force brute et par déni de service applicatif." },
  'k8s-rbac-clusterrolebinding-overpermissive': { severity:'Élevée', ref:'CIS Kubernetes Benchmark', note:"Le CIS Kubernetes Benchmark recommande explicitement d'auditer les ClusterRoleBinding pour éviter d'accorder par erreur des droits cluster-admin à des comptes qui n'en ont pas besoin." },
  'dependency-confusion-pip': { severity:'Critique', ref:'Recherche d\'Alex Birsan (2021)', note:"La technique de confusion de dépendances, publiée par le chercheur Alex Birsan en 2021, a permis d'exécuter du code dans les infrastructures internes de plusieurs grandes entreprises (Apple, Microsoft, Tesla…) via des primes de bug bounty bien réelles." },
  'memcached-unauthenticated': { severity:'Critique', ref:'Attaques DDoS par amplification record de 2018', note:"Des instances Memcached exposées sans authentification ont été détournées en 2018 pour des attaques DDoS par amplification record, dont celle ayant atteint 1,35 Tbit/s contre GitHub." },
  'smb-null-session': { severity:'Moyenne', ref:'Technique d\'énumération SMB classique (enum4linux, rpcclient)', note:"La session nulle SMB est une technique d'énumération documentée depuis les débuts des audits Windows/Samba, encore systématiquement testée par des outils comme enum4linux ou rpcclient." },
  'docker-pid-host-ptrace-injection': { severity:'Critique', ref:'Recherche en sécurité des conteneurs', note:"Le partage de l'espace de noms PID de l'hôte combiné à la capacité SYS_PTRACE est une technique d'évasion de conteneur documentée dans plusieurs travaux de recherche sur la sécurité de Docker/Kubernetes." },
  'k8s-missing-networkpolicy-lateral-movement': { severity:'Élevée', ref:'CIS Kubernetes Benchmark', note:"Le CIS Kubernetes Benchmark recommande explicitement la mise en place de NetworkPolicy pour limiter le trafic entre namespaces, précisément pour empêcher ce type de mouvement latéral." },
  'ad-kerberoasting-spn': { severity:'Critique', ref:'MITRE ATT&CK T1558.003 — conférence Tim Medin, DerbyCon 2014', note:"Le terme « Kerberoasting » a été inventé par Tim Medin lors de sa présentation DerbyCon de 2014, et reste depuis l'une des techniques les plus enseignées et exploitées contre Active Directory." },
  'ad-pass-the-hash-local-admin': { severity:'Critique', ref:'Technique documentée depuis la fin des années 1990', note:"Le Pass-the-Hash est connu et exploité depuis plus de vingt ans ; c'est notamment pour contrer cette technique précise que Microsoft a développé et recommande le déploiement de LAPS." },
  'k8s-etcd-unauthenticated': { severity:'Critique', ref:'Guides de durcissement Kubernetes officiels', note:"La documentation de durcissement de Kubernetes rappelle explicitement qu'etcd stocke tous les Secrets en base64 non chiffré par défaut, ce qui en fait une cible prioritaire s'il reste accessible sans authentification." },
  'docker-cgroup-release-agent-escape': { severity:'Critique', ref:'Recherche Felix Wilhelm, Google Project Zero (2019)', note:"Cette technique d'évasion via release_agent d'un cgroup v1 a été documentée publiquement par le chercheur Felix Wilhelm en 2019, popularisant l'abus de ce mécanisme comme vecteur d'évasion de conteneur." },
  'graphql-introspection-privilege-leak': { severity:'Élevée', ref:'OWASP GraphQL Cheat Sheet', note:"Le OWASP GraphQL Cheat Sheet recommande explicitement de désactiver l'introspection en production et d'appliquer une autorisation par champ, précisément pour éviter ce type de fuite." },
  'cors-reflected-origin-credentials': { severity:'Élevée', ref:'PortSwigger Web Security Academy — CORS', note:"PortSwigger consacre un laboratoire dédié à cette exacte combinaison (réflexion de l'origine + identifiants autorisés), l'un des défauts CORS les plus fréquemment rencontrés en audit d'API." },
  'llmnr-nbtns-poisoning-hash-capture': { severity:'Élevée', ref:'Outil Responder (SpiderLabs, depuis 2014)', note:"L'outil Responder, maintenu par SpiderLabs depuis 2014, a fait de l'empoisonnement LLMNR/NBT-NS l'une des techniques les plus fiables et les plus utilisées lors des tests d'intrusion internes en environnement Windows." },
  'ntlm-relay-smb-signing-disabled': { severity:'Critique', ref:'MITRE ATT&CK T1557.001 — Impacket ntlmrelayx', note:"Le relais NTLM, implémenté notamment dans l'outil ntlmrelayx de la suite Impacket, est une technique répertoriée par MITRE ATT&CK et reste l'un des chemins d'escalade réseau internes les plus redoutés." },
  'ad-silver-ticket-forgery': { severity:'Critique', ref:'MITRE ATT&CK T1558.002', note:"La forge de Silver Ticket est une sous-technique documentée du référentiel MITRE ATT&CK pour l'abus de Kerberos, appréciée des attaquants précisément parce qu'elle ne laisse aucune trace côté contrôleur de domaine." },
  'ad-acl-genericall-privesc': { severity:'Critique', ref:'Projet BloodHound', note:"Le projet BloodHound a été créé spécifiquement pour cartographier et détecter ce type de chemin d'attaque basé sur les ACL Active Directory, devenu un classique des audits AD modernes." },
  'terraform-unpinned-module-supply-chain': { severity:'Élevée', ref:'Bonnes pratiques officielles Terraform/OpenTofu', note:"La documentation Terraform recommande explicitement d'épingler les sources de modules à un commit ou une version, précisément pour éviter ce type de risque de chaîne d'approvisionnement." },
  'cloud-secretsmanager-public-resource-policy': { severity:'Critique', ref:'Règles de contrôle cloud (type AWS Config / Trusted Advisor)', note:"Les politiques de ressource trop permissives sur les services de secrets managés sont un contrôle standard des outils d'audit cloud automatisés, tant l'erreur (\"Principal\": \"*\") reste fréquente en pratique." },
  'k8s-secret-env-plaintext-exec-exposure': { severity:'Moyenne', ref:'Bonnes pratiques Kubernetes officielles', note:"La documentation Kubernetes recommande de monter les Secrets sensibles comme volumes plutôt que comme variables d'environnement, en partie pour limiter ce type d'exposition via un accès d'exécution restreint." },
  'docker-api-tcp-unauthenticated': { severity:'Critique', ref:'Campagnes de cryptominage réelles (dont « Kinsing »)', note:"Des campagnes de cryptominage documentées, dont le malware Kinsing, scannent activement Internet à la recherche de démons Docker exposés sur le port 2375 pour y déployer des conteneurs malveillants." },
  'snmp-default-community-string': { severity:'Élevée', ref:'Défaut de configuration réseau historique', note:"La chaîne de communauté SNMP par défaut « public » figure depuis des décennies dans toutes les listes de vérifications des audits réseau, tant elle reste fréquemment laissée telle quelle sur les équipements." },
  'rsync-anonymous-module-exposure': { severity:'Élevée', ref:'Défaut de configuration classique (scanners Nessus/OpenVAS)', note:"Les modules rsync sans authentification figurent depuis longtemps dans les signatures des scanners de vulnérabilités réseau comme Nessus ou OpenVAS." },
  'ad-constrained-delegation-s4u2proxy-abuse': { severity:'Critique', ref:"Recherche harmj0y — « S4U2Pwnage » (2017)", note:"L'abus de la délégation contrainte via S4U2Self/S4U2Proxy a été documenté en détail par le chercheur harmj0y dans son article de référence « S4U2Pwnage » publié en 2017." },
  'ad-gpp-cpassword-sysvol': { severity:'Critique', ref:'Bulletin de sécurité Microsoft MS14-025 (2014)', note:"Microsoft a publié en 2014 le bulletin MS14-025 documentant ce défaut : la clé AES utilisée pour chiffrer cpassword avait été rendue publique dans la documentation MSDN, rendant le déchiffrement instantané." },
  'ad-adcs-esc1-template-misuse': { severity:'Critique', ref:'ESC1 — SpecterOps, « Certified Pre-Owned » (2021)', note:"La recherche SpecterOps de 2021 sur les Active Directory Certificate Services a formalisé ESC1 comme la plus courante des mauvaises configurations de modèle de certificat, popularisée depuis par l'outil Certipy : elle reste aujourd'hui l'un des chemins d'escalade AD les plus recherchés en audit." },
  'ad-zerologon-netlogon-cve-2020-1472': { severity:'Critique', ref:'CVE-2020-1472 « Zerologon » (Secura, août 2020)', note:"Découverte par Secura et publiée en août 2020, cette faille cryptographique du protocole Netlogon permettait de prendre le contrôle total d'un domaine Active Directory sans le moindre identifiant, valant la note maximale 10.0 sur l'échelle CVSS." },
  'csrf-no-token-password-change': { severity:'Élevée', ref:'OWASP Top 10 — falsification de requête intersite (CSRF)', note:"La CSRF a figuré comme catégorie propre du OWASP Top 10 jusqu'en 2017 avant d'être absorbée par la catégorie plus large « Contrôle d'accès défaillant » en 2021 — un défaut aujourd'hui largement mitigé par le SameSite=Lax devenu la valeur par défaut des navigateurs modernes, mais toujours actif sur les cookies explicitement marqués SameSite=None." },
  'xxe-external-entity-file-disclosure': { severity:'Critique', ref:'OWASP Top 10 2017 — A4 : XML External Entities (XXE)', note:"L'injection d'entités externes XML a obtenu sa propre catégorie dans le OWASP Top 10 2017, après que plusieurs parseurs XML par défaut (dont ceux de Java et PHP) se soient révélés vulnérables à la lecture de fichiers locaux via des déclarations DTD non désactivées." },
  'mobile-hardcoded-api-key-apk': { severity:'Élevée', ref:'OWASP MASVS — M1/M9 : gestion des identifiants et code inversable', note:"Le référentiel OWASP MASVS (Mobile Application Security Verification Standard) rappelle qu'un APK publié reste entièrement décompilable : tout secret qui y est codé en dur doit être considéré comme public dès la première publication sur un store." },
  'mobile-missing-certificate-pinning': { severity:'Élevée', ref:'OWASP MASVS — réseau (MASVS-NETWORK)', note:"L'épinglage de certificat (certificate pinning) est une recommandation centrale du MASVS pour les applications mobiles manipulant des données sensibles : sans lui, la simple confiance système dans les autorités de certification laisse la porte ouverte à toute interception réseau contrôlée par l'attaquant." },
  'mobile-insecure-oauth-redirect-uri-hijack': { severity:'Élevée', ref:'IETF RFC 6819 — recommandations de sécurité OAuth 2.0', note:"Le RFC 6819, dédié aux menaces et contre-mesures OAuth 2.0, recommande explicitement une correspondance exacte du redirect_uri enregistré plutôt qu'une simple validation de domaine ou de préfixe — une négligence encore fréquente sur les intégrations mobiles." }
};

function getFactsheetMeta(scenarioId){
  return FACTSHEET_META[scenarioId] || { severity:'Moyenne', ref:null, note:null };
}

function factsheetSeverityColor(sev){
  if(sev === 'Critique') return '#dc2626';
  if(sev === 'Élevée') return '#ea580c';
  return '#ca8a04';
}

function extractFlagExample(scenario){
  try{
    for(const rule of scenario.exploitRules){
      const src = rule.run.toString();
      const m = src.match(/FLAG\{[^}"'`]+\}/);
      if(m) return m[0];
    }
  }catch(e){}
  try{
    const vfs = scenario.makeVfs();
    for(const path in vfs){
      const entry = vfs[path];
      if(entry && entry.type === 'file' && typeof entry.content === 'string'){
        const m = entry.content.match(/FLAG\{[^}"'`\s]+\}/);
        if(m) return m[0];
      }
    }
  }catch(e){}
  return null;
}

function buildFactsheetHTML(scenario){
  const meta = getFactsheetMeta(scenario.id);
  const flag = extractFlagExample(scenario);
  const sevColor = factsheetSeverityColor(meta.severity);
  const attackHints = (scenario.attack.hints||[]).map(h => `<li>${escapeHtml(h)}</li>`).join('');
  const defenseHints = (scenario.defense.hints||[]).map(h => `<li>${escapeHtml(h)}</li>`).join('');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Fiche technique — ${escapeHtml(scenario.title)}</title>
<style>
  @media print { .no-print { display:none !important; } body { padding:0 !important; } }
  body{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width:840px; margin:0 auto; padding:40px 32px 60px; color:#1a1a1a; line-height:1.55; }
  h1{ font-size:22px; margin:0 0 6px; }
  .eyebrow{ font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:#666; margin-bottom:14px; }
  .sev{ display:inline-block; padding:3px 10px; border-radius:20px; font-size:12px; font-weight:600; color:#fff; background:${sevColor}; }
  .meta-row{ display:flex; gap:24px; flex-wrap:wrap; margin:18px 0; padding:14px 16px; background:#f6f6f7; border-radius:10px; font-size:13px; }
  .meta-row div b{ display:block; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#777; margin-bottom:3px; font-weight:600; }
  h2{ font-size:15px; margin:28px 0 8px; border-bottom:2px solid #eee; padding-bottom:6px; }
  p{ margin:8px 0; font-size:14px; }
  ul{ margin:8px 0; padding-left:22px; font-size:14px; }
  li{ margin:6px 0; }
  code{ background:#f0f0f0; padding:1px 6px; border-radius:4px; font-size:12.5px; }
  .flag-box{ font-family:'Courier New', monospace; background:#1a1a1a; color:#4ade80; padding:10px 14px; border-radius:8px; display:inline-block; margin-top:6px; font-size:13px; }
  .realworld{ background:#fff7ed; border-left:3px solid #ea580c; padding:12px 16px; border-radius:0 8px 8px 0; font-size:13.5px; }
  .footer{ margin-top:40px; padding-top:16px; border-top:1px solid #eee; font-size:11.5px; color:#999; }
  .no-print{ text-align:center; margin-bottom:24px; }
  .no-print button{ font-size:14px; padding:9px 18px; border-radius:8px; border:none; background:#1a1a1a; color:#fff; cursor:pointer; margin:0 6px; }
</style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">🖨️ Imprimer / Exporter en PDF</button><button onclick="window.close()">Fermer</button></div>
  <div class="eyebrow">Fiche technique — RED vs BLUE — ${escapeHtml(scenario.category)}</div>
  <h1>${escapeHtml(scenario.title)}</h1>
  <span class="sev">Sévérité : ${escapeHtml(meta.severity)}</span>

  <div class="meta-row">
    <div><b>Référence réelle</b>${meta.ref ? escapeHtml(meta.ref) : '—'}</div>
    <div><b>Flag de validation</b>${flag ? `<span class="flag-box">${escapeHtml(flag)}</span>` : '—'}</div>
  </div>

  ${meta.note ? `<h2>Ancrage réel</h2><div class="realworld">${escapeHtml(meta.note)}</div>` : ''}

  <h2>🎯 Scénario d'attaque</h2>
  <p><i>${escapeHtml(scenario.attack.who)}</i></p>
  <p>${escapeHtml(scenario.attack.desc)}</p>
  <h2>Méthode (indices progressifs du jeu)</h2>
  <ul>${attackHints}</ul>

  <h2>🛡️ Remédiation</h2>
  <p><i>${escapeHtml(scenario.defense.who)}</i></p>
  <p>${escapeHtml(scenario.defense.desc)}</p>
  <h2>Étapes de correction (indices progressifs du jeu)</h2>
  <ul>${defenseHints}</ul>

  <div class="footer">Fiche générée depuis RED vs BLUE — simulation pédagogique en environnement isolé. Les identifiants, noms d'hôtes et adresses figurant dans les extraits de terminal sont fictifs.</div>
</body>
</html>`;
}

function openFactsheet(scenarioId){
  const scenario = SCENARIOS.find(s => s.id === scenarioId);
  if(!scenario) return;
  const html = buildFactsheetHTML(scenario);
  const blob = new Blob([html], {type:'text/html'});
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if(!win){
    // Popup bloqué : repli en téléchargement direct
    const a = document.createElement('a');
    a.href = url;
    a.download = `fiche-technique-${scenarioId}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(()=> URL.revokeObjectURL(url), 30000);
}
