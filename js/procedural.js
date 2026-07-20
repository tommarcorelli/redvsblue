/* =========================================================
   RED vs BLUE — v2.0 : génération procédurale de scénarios
   Permutation de failles connues (fuite de secret par
   permissions trop larges, binaire SUID oublié) avec des noms
   d'hôtes, de comptes, de chemins et de jetons de drapeau
   tirés au hasard à chaque partie. Mode isolé de la
   progression principale, sur le même modèle que le bac à
   sable / la faille du jour / le duel.
   ========================================================= */

/* ---------- Utilitaire partagé : construit un VFS complet à
   partir d'une simple liste plate {path,type,perm,owner,content}
   en générant automatiquement les dossiers parents manquants.
   Réutilisé par l'éditeur de scénarios (v2.0). ---------- */
function buildVfsFromEntries(entries){
  const vfs = {};
  function ensureDir(path){
    if(!vfs[path]) vfs[path] = {type:'dir', perm:'755', owner:'root', children:[]};
  }
  ensureDir('/');
  function ensureParents(path){
    const parts = path.split('/').filter(Boolean);
    let cur = '';
    for(let i=0;i<parts.length-1;i++){ cur += '/'+parts[i]; ensureDir(cur); }
  }
  entries.forEach(e=> ensureParents(e.path));
  entries.forEach(e=>{
    if(e.type === 'dir'){
      vfs[e.path] = {type:'dir', perm:e.perm||'755', owner:e.owner||'root', children:[]};
    } else {
      const content = e.content || '';
      vfs[e.path] = {
        type:'file', perm:e.perm||'644', owner:e.owner||'root',
        size: e.size!==undefined ? e.size : content.length, content
      };
      if(e.suid !== undefined) vfs[e.path].suid = !!e.suid;
    }
  });
  Object.keys(vfs).forEach(p=>{
    if(vfs[p].type !== 'dir') return;
    vfs[p].children = Object.keys(vfs).filter(q=>{
      if(q === p) return false;
      const parent = q.substring(0, q.lastIndexOf('/')) || '/';
      return parent === p;
    }).map(q=> q.substring(q.lastIndexOf('/')+1));
  });
  return vfs;
}

function attackCheckFlagRevealed(flagContent){
  return function(state){
    return state.transcript.some(l => l.text && l.text.indexOf(flagContent) !== -1);
  };
}
function defenseCheckPermission(path, targetPerm){
  return function(state){
    const n = state.vfs[path];
    return !!n && n.perm === targetPerm;
  };
}
function escapeRegexLiteral(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ---------- Générateurs procéduraux ---------- */
const PROC_COMPANIES = ['Nimbus Corp','Vertex Systems','Argon Labs','Halcyon Retail','Cobalt Freight','Marbleway Bank','Orbit Média','Fenwick Santé'];
const PROC_USERS = ['deploy','svc-app','backup','ops','integr'];
const PROC_SECRET_PATHS = ['/var/backups/config.bak','/opt/app/.env.old','/srv/www/config.php.save','/etc/app/secrets.cfg'];
const PROC_SUID_NAMES = ['sysdiag','netcheck','logrotate-helper','backupctl'];

function procPick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function procRandHex(len){ let s=''; const c='0123456789abcdef'; for(let i=0;i<len;i++) s+=c[Math.floor(Math.random()*16)]; return s; }
function procSlug(s){ return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''); }

function genLeakedSecretScenario(){
  const company = procPick(PROC_COMPANIES);
  const secretUser = procPick(PROC_USERS);
  const path = procPick(PROC_SECRET_PATHS);
  const password = procRandHex(10);
  const flag = `FLAG{${procSlug(company)}_${secretUser}_${procRandHex(6)}}`;
  const entries = [
    {path:'/var/www/html', type:'dir', perm:'755', owner:'www-data'},
    {path:'/var/www/html/index.html', type:'file', perm:'644', owner:'www-data', content:`<!-- vitrine ${company} -->\n`},
    {path, type:'file', perm:'644', owner:'root', content:`# sauvegarde de configuration — ${company}\nservice_user=${secretUser}\nservice_password=${password}\n${flag}\n`}
  ];
  return {
    title:`${company} — configuration de sauvegarde exposée`,
    category:'Généré · Permissions',
    startUserAttack:'www-data', startCwdAttack:'/var/www/html',
    makeVfs(){ return buildVfsFromEntries(entries); },
    attackCheck: attackCheckFlagRevealed(flag),
    defenseCheck: defenseCheckPermission(path, '600'),
    attack:{
      who:'Vous incarnez www-data, le compte du serveur web.',
      desc:`Un ancien fichier de configuration a été oublié sur le serveur de ${company}, lisible par n'importe quel utilisateur alors qu'il contient un secret. Localisez-le et lisez-le pour révéler le drapeau.`,
      hints:[
        "Cherchez les fichiers de configuration oubliés sous /var/, /opt/, /srv/ et /etc/ avec `ls`.",
        `Lisez le fichier trouvé, par exemple \`cat ${path}\`.`
      ]
    },
    defense:{
      who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
      desc:`Corrigez les permissions de ${path}, lisible par tout le monde alors qu'il contient un secret.`,
      hints:[
        `Le fichier ${path} est lisible par tout le monde (644) alors qu'il contient un secret.`,
        `\`chmod 600 ${path}\``
      ]
    }
  };
}

function genSuidScenario(){
  const company = procPick(PROC_COMPANIES);
  const binName = procPick(PROC_SUID_NAMES);
  const binPath = `/usr/local/bin/${binName}`;
  const flag = `FLAG{${procSlug(company)}_suid_${procRandHex(6)}}`;
  const entries = [
    {path:'/home/operateur', type:'dir', perm:'750', owner:'operateur'},
    {path:'/usr/local/bin', type:'dir', perm:'755', owner:'root'},
    {path:binPath, type:'file', perm:'755', owner:'root', suid:true, content:`[binaire interne — ${binName}]`},
    {path:'/root/flag.txt', type:'file', perm:'600', owner:'root', content:flag+'\n'}
  ];
  const runPattern = new RegExp('^'+escapeRegexLiteral(binPath)+'(\\s+.*)?$', 'i');
  return {
    title:`${company} — binaire SUID oublié`,
    category:'Généré · Élévation de privilèges',
    startUserAttack:'operateur', startCwdAttack:'/home/operateur',
    makeVfs(){ return buildVfsFromEntries(entries); },
    exploitRules:[
      { pattern: runPattern, run(state, print){
          const node = state.vfs[binPath];
          if(!node || !node.suid){ print(`${binName}: permission non accordée.`, 'err'); return; }
          state.isRoot = true; state.user = 'root';
          print('[+] Le binaire est SUID root : exécution avec privilèges élevés.', 'ok');
          print('[+] Shell root obtenu.', 'ok');
        }
      }
    ],
    attackCheck(state){ return state.isRoot === true; },
    defenseCheck(state){ return state.vfs[binPath].suid !== true; },
    attack:{
      who:'Vous incarnez operateur, un utilisateur standard sans privilège particulier.',
      desc:`Un script de diagnostic interne (${binName}) a été laissé avec le bit SUID root sur le serveur de ${company}. Localisez-le et exploitez-le pour obtenir un shell root.`,
      hints:[
        "Repérez les binaires SUID inhabituels : `ls -la /usr/local/bin/`.",
        `Un binaire SUID root peut être exécuté directement pour obtenir un shell root : \`${binPath}\`.`,
        "Une fois root, le drapeau est dans /root/flag.txt (`cat /root/flag.txt`)."
      ]
    },
    defense:{
      who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
      desc:`Retirez le bit SUID inutile sur ${binPath}.`,
      hints:[
        `Le bit SUID sur ${binPath} est inutile et dangereux.`,
        `\`chmod u-s ${binPath}\``
      ]
    }
  };
}

const PROCEDURAL_GENERATORS = [genLeakedSecretScenario, genSuidScenario];
function generateProceduralScenario(){ return procPick(PROCEDURAL_GENERATORS)(); }

/* ---------- Cycle de jeu du mode généré ---------- */
function startProceduralChallenge(){
  game.proceduralScenario = generateProceduralScenario();
  game.procedural = true;
  game.custom = false;
  game.sandbox = false;
  game.daily = false;
  applyScenarioState(game.proceduralScenario, 'attack');
  showScreen('game');
  document.getElementById('term-input').focus();
}

function completeProceduralAttack(){
  const elapsedSec = (Date.now() - game.phaseStartTime) / 1000;
  playSound('success');
  checkAchievements({hints: game.hintIndex, elapsedSec, phase:'attack', procedural:true});
  showModal({
    title:'🎲 Cible générée compromise !',
    body:`Vous avez exploité « ${game.proceduralScenario.title} » (scénario généré) en ${formatDuration(elapsedSec)}.`,
    flag: extractFlagFromLog(),
    primaryLabel:'Passer à la défense →',
    closeLabel:'Nouveau scénario généré',
    onPrimary(){
      applyScenarioState(game.proceduralScenario, 'defense');
      game.procedural = true;
      showScreen('game');
      document.getElementById('term-input').focus();
    },
    onClose(){ startProceduralChallenge(); }
  });
}

function completeProceduralDefense(){
  const elapsedSec = (Date.now() - game.phaseStartTime) / 1000;
  playSound('hardened');
  checkAchievements({hints: game.hintIndex, elapsedSec, phase:'defense', procedural:true});
  showModal({
    title:'🎲 Système généré durci !',
    body:`Correctif appliqué sur « ${game.proceduralScenario.title} » en ${formatDuration(elapsedSec)}.`,
    primaryLabel:'Nouveau scénario généré →',
    closeLabel:'Quitter',
    onPrimary(){ startProceduralChallenge(); },
    onClose(){ goHome(); }
  });
}
