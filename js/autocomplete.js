/* =========================================================
   RED vs BLUE — v4.7 : autocomplétion Tab du terminal
   ---------------------------------------------------------------
   Complète soit un nom de commande (premier mot de la ligne), soit
   un chemin de fichier/dossier dans le VFS courant (arguments
   suivants) — comme un vrai shell. Module en lecture seule sur
   l'état du jeu (game.vfs/game.cwd/game.user/game.isRoot) : aucune
   règle d'exploit ni aucun scénario n'est modifié ou lu au-delà de
   ce qui est déjà exposé par engine.js/scenarios.js.

   Limite assumée : la complétion s'applique au dernier mot de la
   ligne (la position du curseur n'est pas prise en compte), ce qui
   couvre l'immense majorité d'un usage réel au clavier et reste
   cohérent avec le reste de l'interpréteur, déjà volontairement
   simplifié par rapport à un vrai shell POSIX.
   ========================================================= */

// Dictionnaire des noms de commande complétables : les commandes
// génériques du moteur (dispatchBuiltin, engine.js) + les verbes
// d'exploitation spécifiques aux scénarios (extraits des `pattern`
// de exploitRules dans scenarios.js/chains.js). Liste statique et
// volontairement plate : aucune dépendance au scénario en cours,
// donc aucun risque de désynchronisation avec les règles d'exploit
// qui, elles, gardent la priorité absolue dans runCommand().
const COMMAND_WORDS = [
  // commandes génériques (dispatchBuiltin + pipes/filtres v0.3)
  'help','clear','pwd','whoami','history','reset','env','export','echo','id',
  'cd','ls','cat','find','chmod','chown','ps','crontab','sudo','nano','vi','vim',
  'verify','replay','touch','dig','ldapsearch','showmount','mount',
  'restart-service','net','sc','getcap','setcap','docker','python3','su','systemctl',
  'grep','wc','sort','uniq','head','tail','cut',
  // verbes spécifiques à un ou plusieurs scénarios
  'apt-get','asrep-roast','attendre-cron','attendre-deploiement','aws','curl',
  'curl-bruteforce','dcsync','dcsync-check','dsacls','etcdctl','gh','git',
  'git-dump','gpp-decrypt','gpupdate','hashcat','inject-ticket','jenkins-groovy',
  'jwt-forge','kerberoast','klist','kubectl','memcached-cli','mimikatz','mysql',
  'ntlmrelayx','pickle-forge','pkexec','printbug','pth','redis-cli','responder',
  'rsync','s4u2proxy','s4u2self','silver-forge','smbclient','snmpwalk','ssh',
  'sshpass','ssti-shell','terraform','terraform-module-publish','upgrade-log4j',
  'whoami-shell','Get-ADUser'
].sort();

function longestCommonPrefix(strings){
  if(!strings.length) return '';
  let prefix = strings[0];
  for(let i=1;i<strings.length;i++){
    while(!strings[i].startsWith(prefix)){
      prefix = prefix.slice(0,-1);
      if(!prefix) return '';
    }
  }
  return prefix;
}

// Calcule les candidats de complétion pour la valeur courante du champ,
// en ne considérant que le dernier mot (délimité par un espace) de la ligne.
function completionCandidates(value){
  const m = /(\S*)$/.exec(value);
  const partial = m ? m[1] : '';
  const wordStart = value.length - partial.length;
  const isFirstWord = value.slice(0, wordStart).trim() === '';

  if(isFirstWord){
    const matches = COMMAND_WORDS.filter(w=> w.startsWith(partial));
    return { partial, wordStart, matches, isPath:false };
  }

  // Complétion de chemin : sépare le dossier déjà tapé du préfixe de nom
  let dirPart = '', filePart = partial;
  const slashIdx = partial.lastIndexOf('/');
  if(slashIdx !== -1){ dirPart = partial.slice(0, slashIdx) || '/'; filePart = partial.slice(slashIdx+1); }

  if(typeof game === 'undefined' || !game.vfs) return { partial, wordStart, matches:[], isPath:true };

  const resolvedDir = resolvePath(game.cwd, dirPart || '.');
  const dirNode = nodeAt(resolvedDir);
  if(!dirNode || dirNode.type !== 'dir' || !canRead(dirNode, game)){
    return { partial, wordStart, matches:[], isPath:true };
  }

  const matches = dirNode.children
    .filter(name => name.startsWith(filePart))
    .map(name=>{
      const childPath = (resolvedDir === '/' ? '' : resolvedDir) + '/' + name;
      const child = nodeAt(childPath);
      const isDir = child && child.type === 'dir';
      const prefix = dirPart === '' ? '' : (dirPart === '/' ? '/' : dirPart + '/');
      return prefix + name + (isDir ? '/' : '');
    })
    .sort();
  return { partial, wordStart, matches, isPath:true };
}

// Petit état pour détecter un « double Tab » (afficher la liste des
// candidats quand aucune progression de préfixe n'est plus possible),
// remis à zéro dès qu'une autre touche est pressée dans le terminal.
let tabState = { value:null, matches:null };
function resetTabState(){ tabState = { value:null, matches:null }; }

function handleTabCompletion(){
  const input = document.getElementById('term-input');
  if(!input) return;
  const val = input.value;
  const { partial, wordStart, matches } = completionCandidates(val);
  if(!matches.length) return;

  if(matches.length === 1){
    const suffix = matches[0].endsWith('/') ? '' : ' ';
    input.value = val.slice(0, wordStart) + matches[0] + suffix;
    resetTabState();
    return;
  }

  const lcp = longestCommonPrefix(matches);
  if(lcp.length > partial.length){
    input.value = val.slice(0, wordStart) + lcp;
    tabState = { value: input.value, matches };
    return;
  }

  // Aucune progression possible via le préfixe commun : un second Tab
  // consécutif (valeur inchangée depuis le Tab précédent) affiche la
  // liste des candidats dans le terminal, comme un vrai shell.
  if(tabState.value === val && tabState.matches && typeof print === 'function'){
    print(matches.join('   '), 'out');
  }
  tabState = { value: val, matches };
}
window.handleTabCompletion = handleTabCompletion;
window.resetTabState = resetTabState;
