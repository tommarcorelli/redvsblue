/* =========================================================
   RED vs BLUE — moteur de jeu (état, progression, commandes)
   ========================================================= */

const STORAGE_KEY = 'redvsblue_progress_v1';

function loadProgress(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) return JSON.parse(raw);
  }catch(e){}
  const p = {};
  SCENARIOS.forEach(s=> p[s.id] = {attack:false, defense:false});
  return p;
}
function saveProgress(p){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }catch(e){}
}
function resetProgress(){
  progress = {};
  SCENARIOS.forEach(s=> progress[s.id] = {attack:false, defense:false});
  saveProgress(progress);
}

let progress = loadProgress();

let game = {
  scenarioIndex: 0,
  phase: 'attack', // 'attack' | 'defense'
  vfs: null,
  user: '',
  cwd: '',
  isRoot: false,
  flags: {},
  hintIndex: 0,
  history: [],
  env: {},
  sandbox: false,       // v0.7 : mode bac à sable (défi aléatoire, hors progression)
  sandboxWon: false,
  guided: false,        // mode guidé : affiche la marche à suivre + commandes cliquables
  chain: null,          // scénario chaîné en cours (attaque multi-étapes)
  chainIndex: 0,
  chainStage: 0,
  chainView: null,      // "scénario" synthétique reflétant l'étape courante
  chainDone: false,
  phaseStartTime: 0,     // v0.4 : chronométrage de la phase en cours
  duel: null,            // v0.9 : 'red' (attaque) | 'blue' (défense) | null hors mode duel
  duelDone: false,
  host: 'target-lab',    // v1.0 : hôte courant (utile pour les chaînes multi-machines)
  hosts: null,           // v1.0 : {hostname: vfs} pour une chaîne à plusieurs machines, sinon null
  daily: false,          // v1.2 : mode faille du jour (hors progression principale)
  dailyDone: false,
  transcript: [],        // v1.3 : historique complet des lignes affichées, pour le récap cinématique
  procedural: false,     // v2.0 : mode scénario généré procéduralement
  proceduralDone: false,
  proceduralScenario: null,
  custom: false,         // v2.0 : mode scénario créé via l'éditeur (test en direct)
  customDone: false,
  customScenario: null,
  mentorIndex: 0         // v2.2 : nombre de conseils du mentor déjà demandés sur cette phase
};

/* Remet à zéro tous les indicateurs de "mode" (bac à sable, faille du jour,
   duel, généré procéduralement, éditeur) avant d'en activer un seul.
   v0.7/v0.9/v1.2/v2.0 partagent ce point d'entrée commun. */
function resetModeFlags(){
  game.sandbox = false;
  game.daily = false;
  game.duel = null;
  game.procedural = false;
  game.custom = false;
}

function currentScenario(){
  if(game.chain) return game.chainView;
  if(game.procedural) return game.proceduralScenario;
  if(game.custom) return game.customScenario;
  return SCENARIOS[game.scenarioIndex];
}

function isScenarioUnlocked(i){
  if(i===0) return true;
  return progress[SCENARIOS[i-1].id].defense === true;
}
function isDefenseUnlocked(i){
  return progress[SCENARIOS[i].id].attack === true;
}

function findFirstAvailable(){
  for(let i=0;i<SCENARIOS.length;i++){
    const p = progress[SCENARIOS[i].id];
    if(!p.attack) return {index:i, phase:'attack'};
    if(!p.defense) return {index:i, phase:'defense'};
  }
  return {index: SCENARIOS.length-1, phase:'defense'};
}

function applyScenarioState(scn, phase){
  game.chain = null; game.chainView = null; game.chainDone = false;
  game.host = 'target-lab';
  game.hosts = null;
  game.phase = phase;
  game.vfs = scn.makeVfs();
  game.flags = {};
  game.hintIndex = 0;
  game.mentorIndex = 0;
  game.history = [];
  game.transcript = [];
  game.phaseStartTime = Date.now();
  game.sandboxWon = false;
  game.duelDone = false;
  game.dailyDone = false;
  game.proceduralDone = false;
  game.customDone = false;
  if(phase === 'attack'){
    game.user = scn.startUserAttack;
    game.cwd = scn.startCwdAttack;
    game.isRoot = false;
  } else {
    game.user = 'root';
    game.cwd = '/root';
    if(!game.vfs['/root']) game.vfs['/root'] = {type:'dir',perm:'700',owner:'root',children:[]};
    game.isRoot = true;
  }
  game.env = {
    HOME: game.isRoot ? '/root' : ('/home/'+game.user),
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    USER: game.user,
    SHELL: '/bin/bash'
  };
  renderAll();
  clearTerminal();
  printWelcome();
}

function startPhase(scenarioIndex, phase){
  const scn = SCENARIOS[scenarioIndex];
  game.scenarioIndex = scenarioIndex;
  game.procedural = false;
  game.custom = false;
  applyScenarioState(scn, phase);
}

/* ---------- Scénarios chaînés (attaque multi-étapes) ---------- */

function updateChainView(){
  const stage = game.chain.stages[game.chainStage];
  game.chainView = {
    id: game.chain.id,
    title: game.chain.title,
    category: game.chain.category,
    exploitRules: stage.exploitRules,
    attackCheck: (state)=> stage.check(state)
  };
}

function startChain(chainIndex){
  const chain = CHAIN_SCENARIOS[chainIndex];
  game.sandbox = false;
  game.daily = false;
  game.chain = chain;
  game.chainIndex = chainIndex;
  game.chainStage = 0;
  game.chainDone = false;
  game.phase = 'attack';
  if(chain.makeHosts){
    game.hosts = chain.makeHosts();
    game.host = chain.startHost;
    game.vfs = game.hosts[game.host];
  } else {
    game.hosts = null;
    game.host = 'target-lab';
    game.vfs = chain.makeVfs();
  }
  game.flags = {};
  game.hintIndex = 0;
  game.mentorIndex = 0;
  game.history = [];
  game.transcript = [];
  game.phaseStartTime = Date.now();
  game.user = chain.startUser;
  game.cwd = chain.startCwd;
  game.isRoot = false;
  game.env = {
    HOME: '/home/'+chain.startUser, USER: chain.startUser,
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', SHELL: '/bin/bash'
  };
  updateChainView();
  renderAll();
  clearTerminal();
  printChainWelcome();
}

function printChainWelcome(){
  const chain = game.chain;
  print(`=== CHAÎNE : ${chain.title} ===`, 'info');
  print(chain.intro, 'info');
  if(game.hosts) print(`Réseau simulé : ${Object.keys(game.hosts).join(' → ')}. Hôte de départ : ${game.host}.`, 'info');
  print(`Objectif : enchaîner ${chain.stages.length} étapes jusqu'à root. Tapez 'help' pour la liste des commandes.`, 'info');
  print('', 'out');
  print(`▶ Étape 1/${chain.stages.length} : ${chain.stages[0].title}`, 'info');
}

function advanceChainStage(){
  const chain = game.chain;
  const stage = chain.stages[game.chainStage];
  playSound('success');
  print('', 'out');
  print(`✓ Étape ${game.chainStage+1}/${chain.stages.length} réussie — ${stage.title}.`, 'ok');
  if(stage.onComplete) stage.onComplete(game, print);

  if(game.chainStage >= chain.stages.length - 1){
    completeChain();
    return;
  }
  game.chainStage++;
  game.hintIndex = 0;
  game.mentorIndex = 0;
  updateChainView();
  const next = chain.stages[game.chainStage];
  print('', 'out');
  print('════════════════════════════════════════', 'info');
  print(`▶ ÉTAPE ${game.chainStage+1}/${chain.stages.length} — ${next.title}`, 'info');
  print('════════════════════════════════════════', 'info');
  renderObjective();
  renderSidebar();
  renderTopbar();
  renderPrompt();
}

function completeChain(){
  const chain = game.chain;
  game.chainDone = true;
  const elapsedSec = (Date.now() - game.phaseStartTime) / 1000;
  markChainDone(chain.id);
  saveChainTime(chain.id, Math.round(elapsedSec));
  playSound('success');
  if(window.registerPhaseOutcome) registerPhaseOutcome(game.hintIndex);
  if(window.checkAchievements) checkAchievements({});
  const flagNode = game.vfs['/root/flag.txt'];
  const flag = flagNode ? flagNode.content.trim() : null;
  if(flag) print('🏁 ' + flag, 'flagline');
  renderTopbar();
  renderSidebar();
  const stats = loadChainStats();
  const best = stats[chain.id] ? stats[chain.id].bestTime : Math.round(elapsedSec);
  showModal({
    kind:'attack',
    title:'🏆 Chaîne complète — root obtenu',
    body:`Vous avez enchaîné les ${chain.stages.length} étapes de « ${chain.title} » jusqu'à un shell root complet. Bien joué.`
      + `<br><span class="chain-win-stat">⏱ ${formatDuration(elapsedSec)} · ⌨ ${game.history.length} commande(s) · 🏅 record ${formatDuration(best)}</span>`,
    flag: flag,
    primaryLabel:'Retour au menu',
    onPrimary(){ endChain(); goHome(); },
    closeLabel:'Rester dans le terminal',
    onClose(){}
  });
}

function endChain(){
  game.chain = null;
  game.chainView = null;
  game.chainStage = 0;
  game.chainDone = false;
}

function pivotHost(state, hostName){
  if(!state.hosts || !state.hosts[hostName]) return false;
  state.host = hostName;
  state.vfs = state.hosts[hostName];
  return true;
}

function nodeAt(path){ return game.vfs[path]; }

function listDir(path, showAll){
  const node = nodeAt(path);
  if(!node){ print(`ls: impossible d'accéder à '${path}': Aucun fichier ou dossier de ce type`, 'err'); return; }
  if(node.type==='file'){
    if(!canRead(node, game)){ print(`ls: impossible d'accéder à '${path}': Permission non accordée`, 'err'); return; }
    const name = path.substring(path.lastIndexOf('/')+1);
    print(showAll ? (formatLs(node) + name) : name, 'out');
    return;
  }
  if(!canRead(node, game)){ print(`ls: impossible d'ouvrir le répertoire '${path}': Permission non accordée`, 'err'); return; }
  if(!node.children.length){ return; }
  node.children.forEach(name=>{
    const childPath = (path==='/'? '' : path) + '/' + name;
    const child = nodeAt(childPath);
    if(!child) return;
    if(showAll){
      print(formatLs(child) + name, 'out');
    } else {
      print(name, 'out');
    }
  });
}

function checkAutoWin(){
  if(game.chain){
    if(game.chainDone) return;
    const stage = game.chain.stages[game.chainStage];
    if(stage.check(game)) advanceChainStage();
    return;
  }
  const scn = currentScenario();
  if(game.phase==='attack'){
    if(!scn.attackCheck(game)) return;
    if(game.duel){
      if(!game.duelDone){ game.duelDone = true; completeDuelAttack(); }
    } else if(game.daily){
      if(!game.dailyDone){ game.dailyDone = true; completeDailyChallenge(); }
    } else if(game.procedural){
      if(!game.proceduralDone){ game.proceduralDone = true; completeProceduralAttack(); }
    } else if(game.custom){
      if(!game.customDone){ game.customDone = true; completeCustomAttack(); }
    } else if(game.sandbox){
      if(!game.sandboxWon){ game.sandboxWon = true; completeSandboxAttack(); }
    } else if(!progress[scn.id].attack){
      completeAttack();
    }
  } else {
    if(!scn.defenseCheck(game)) return;
    if(game.duel){
      if(!game.duelDone){ game.duelDone = true; completeDuelDefense(); }
    } else if(game.procedural){
      if(!game.proceduralDone){ game.proceduralDone = true; completeProceduralDefense(); }
    } else if(game.custom){
      if(!game.customDone){ game.customDone = true; completeCustomDefense(); }
    } else {
      showDefenseReadyBanner();
    }
  }
}

function tokenize(str){
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  const out = [];
  let m;
  while((m = re.exec(str)) !== null){
    out.push(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]));
  }
  return out;
}

function help(){
  print("Commandes disponibles :", 'out');
  print("  ls [-la] [chemin]      cd <chemin>        pwd", 'out');
  print("  cat <fichier>          whoami             id", 'out');
  print("  touch <fichier>        chmod <mode> <chemin>  chown <user> <chemin>", 'out');
  print("  find / -perm -4000     ps aux", 'out');
  print("  sudo -l                sudo <commande>", 'out');
  print("  crontab -l             nano <fichier>  (éditeur)", 'out');
  print("  echo <texte>           env                export NOM=valeur", 'out');
  print("  clear                  history            reset", 'out');
  print("  pipes : cmd | grep <motif> | wc -l | sort [-r] | uniq | head -n <N> | tail -n <N> | cut -d<sep> -f<N>", 'out');
  print("  redirections : cmd > fichier (écrase)   cmd >> fichier (ajoute)", 'out');
  print("  variables : $HOME $PATH $USER — flèches ↑ ↓ pour naviguer dans l'historique", 'out');
  print("  selon le scénario : showmount, mount, dig axfr, ldapsearch, restart-service, docker, getcap/setcap, su, systemctl,", 'out');
  print("                      attendre-cron, pkexec, redis-cli, curl, aws, git-dump, mysql, ssh, kubectl, apt-get,", 'out');
  print("                      jwt-forge, whoami-shell, upgrade-log4j, python3, find, jenkins-groovy, pickle-forge,", 'out');
  print("                      ssti-shell, attendre-deploiement...", 'out');
  if(game.phase==='defense'){
    print("  verify                 vérifie si la configuration est durcie", 'ok');
    print("  replay                 rejoue l'attaque précédente sur la config actuelle", 'ok');
  }
}

/* ---------- v0.3 : variables d'environnement, pipes, redirections ---------- */

function substituteEnv(str){
  let out = '';
  let i = 0;
  let inSingle = false, inDouble = false;
  while(i < str.length){
    const ch = str[i];
    if(ch === "'" && !inDouble){ inSingle = !inSingle; out += ch; i++; continue; }
    if(ch === '"' && !inSingle){ inDouble = !inDouble; out += ch; i++; continue; }
    if(ch === '$' && !inSingle){
      if(str[i+1] === '{'){
        const end = str.indexOf('}', i+2);
        if(end !== -1){
          const name = str.slice(i+2, end);
          out += (game.env[name] !== undefined ? game.env[name] : '');
          i = end+1;
          continue;
        }
      } else {
        const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(str.slice(i+1));
        if(m){
          out += (game.env[m[0]] !== undefined ? game.env[m[0]] : '');
          i += 1 + m[0].length;
          continue;
        }
      }
    }
    out += ch;
    i++;
  }
  return out;
}

function splitTopLevel(str, delim){
  const parts = [];
  let cur = '';
  let inSingle = false, inDouble = false;
  for(let i=0;i<str.length;i++){
    const ch = str[i];
    if(ch === "'" && !inDouble){ inSingle = !inSingle; cur += ch; continue; }
    if(ch === '"' && !inSingle){ inDouble = !inDouble; cur += ch; continue; }
    if(ch === delim && !inSingle && !inDouble){ parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

function detectRedirect(cmd){
  let inSingle = false, inDouble = false;
  for(let i=0;i<cmd.length;i++){
    const ch = cmd[i];
    if(ch === "'" && !inDouble){ inSingle = !inSingle; continue; }
    if(ch === '"' && !inSingle){ inDouble = !inDouble; continue; }
    if(ch === '>' && !inSingle && !inDouble){
      const prev = cmd[i-1];
      if(prev && /[0-9]/.test(prev)){ continue; } // ex: 2>/dev/null -> redirection de descripteur, ignorée
      const append = cmd[i+1] === '>';
      const left = cmd.slice(0, i).trim();
      const rest = cmd.slice(i + (append?2:1)).trim();
      if(!left || !rest) return null;
      return {cmd:left, target:rest, append};
    }
  }
  return null;
}

function withCapture(fn){
  const originalPrint = print;
  const buf = [];
  print = function(t, c){ buf.push({t:String(t), c:c||'out'}); };
  try{ fn(); } finally { print = originalPrint; }
  return buf;
}

function applyFilter(segment, buf){
  const parts = tokenize(segment);
  const c0 = parts[0];
  switch(c0){
    case 'grep': {
      let args = parts.slice(1);
      let invert = false;
      args = args.filter(a=>{ if(a==='-v'){ invert = true; return false; } return true; });
      const pattern = args[0] || '';
      let re;
      try{ re = new RegExp(pattern); }
      catch(e){ re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')); }
      return buf.filter(l => invert ? !re.test(l.t) : re.test(l.t));
    }
    case 'wc': {
      if(parts.includes('-l')) return [{t:String(buf.length), c:'out'}];
      const words = buf.reduce((n,l)=> n + l.t.split(/\s+/).filter(Boolean).length, 0);
      return [{t:`${buf.length} ${words}`, c:'out'}];
    }
    case 'sort': {
      const copy = buf.slice().sort((a,b)=> a.t.localeCompare(b.t));
      if(parts.includes('-r')) copy.reverse();
      return copy;
    }
    case 'uniq': {
      const out = []; let prev = null;
      buf.forEach(l=>{ if(l.t !== prev) out.push(l); prev = l.t; });
      return out;
    }
    case 'head': {
      const nIdx = parts.indexOf('-n');
      const n = nIdx!==-1 ? parseInt(parts[nIdx+1],10) : 10;
      return buf.slice(0, n);
    }
    case 'tail': {
      const nIdx = parts.indexOf('-n');
      const n = nIdx!==-1 ? parseInt(parts[nIdx+1],10) : 10;
      return buf.slice(-n);
    }
    case 'cut': {
      const dIdx = parts.indexOf('-d');
      const fIdx = parts.indexOf('-f');
      const delim = dIdx!==-1 ? parts[dIdx+1] : '\t';
      const field = fIdx!==-1 ? parseInt(parts[fIdx+1],10) : 1;
      return buf.map(l=>({t:(l.t.split(delim)[field-1] ?? ''), c:l.c}));
    }
    default:
      return null;
  }
}

function runPiped(segments){
  let buf = withCapture(()=> dispatchBuiltin(segments[0]));
  for(let s=1;s<segments.length;s++){
    const next = applyFilter(segments[s], buf);
    if(next === null){
      print(`bash: ${tokenize(segments[s])[0]}: commande introuvable dans un pipe`, 'err');
      return;
    }
    buf = next;
  }
  buf.forEach(l=> print(l.t, l.c));
  checkAutoWin();
}

function runRedirected(leftCmd, targetPath, append){
  const buf = withCapture(()=> dispatchBuiltin(leftCmd));
  const target = resolvePath(game.cwd, targetPath);
  let node = nodeAt(target);
  if(!node){
    const parentPath = target.substring(0, target.lastIndexOf('/')) || '/';
    const parent = nodeAt(parentPath);
    if(!parent || parent.type!=='dir'){ print(`bash: ${targetPath}: Aucun fichier ou dossier de ce type`, 'err'); return; }
    if(!canWrite(parent, game)){ print(`bash: ${targetPath}: Permission non accordée`, 'err'); return; }
    const name = target.substring(target.lastIndexOf('/')+1);
    game.vfs[target] = {type:'file', perm:'644', owner: game.isRoot?'root':game.user, size:0, content:''};
    if(!parent.children.includes(name)) parent.children.push(name);
    node = game.vfs[target];
  } else if(!game.isRoot && node.owner !== game.user && !canWrite(node, game)){
    print(`bash: ${targetPath}: Permission non accordée`, 'err'); return;
  }
  const text = buf.map(l=>l.t).join('\n') + (buf.length ? '\n' : '');
  node.content = append ? ((node.content||'') + text) : text;
  checkAutoWin();
}

function runCommand(raw){
  const cmdRaw = raw.trim();
  if(cmdRaw === '') return;
  printPromptEcho(cmdRaw);
  game.history.push(cmdRaw);
  playSound('key');

  try{
    const scn = currentScenario();
    const cmd = substituteEnv(cmdRaw);

    // Priorité absolue et inchangée : les règles d'exploit du scénario en cours.
    if(scn.exploitRules){
      for(const rule of scn.exploitRules){
        if(rule.pattern.test(cmd)){
          rule.run(game, print, openNanoEditor);
          checkAutoWin();
          return;
        }
      }
    }

    const pipeSegs = splitTopLevel(cmd, '|');
    if(pipeSegs.length > 1 && pipeSegs.every(s=>s.length>0)){
      runPiped(pipeSegs);
      return;
    }

    const redir = detectRedirect(cmd);
    if(redir){
      runRedirected(redir.cmd, redir.target, redir.append);
      return;
    }

    dispatchBuiltin(cmd);
  } finally {
    if(window.renderScoreHud) renderScoreHud();
  }
}

function dispatchBuiltin(cmd){
  const scn = currentScenario();
  const parts = tokenize(cmd);
  const c0 = parts[0];

  switch(c0){
    case 'help': help(); return;
    case 'clear': clearTerminal(); return;
    case 'pwd': print(game.cwd, 'out'); return;
    case 'whoami': print(game.user, 'out'); return;
    case 'history': game.history.forEach((h,i)=>print(`${i+1}  ${h}`,'out')); return;
    case 'reset':
      if(game.chain) startChain(game.chainIndex); else startPhase(game.scenarioIndex, game.phase);
      return;
    case 'env': Object.keys(game.env).forEach(k=> print(`${k}=${game.env[k]}`, 'out')); return;
    case 'export': {
      const arg = parts.slice(1).join(' ');
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(arg);
      if(!m){ print('export: syntaxe attendue : export NOM=valeur', 'err'); return; }
      game.env[m[1]] = m[2];
      print(`[export] ${m[1]}=${m[2]}`, 'info');
      return;
    }
    case 'echo': {
      print(parts.slice(1).join(' '), 'out');
      return;
    }
    case 'id':
      print(`uid=${game.isRoot?'0(root)':'1000('+game.user+')'} gid=${game.isRoot?'0(root)':'1000('+game.user+')'}`, 'out');
      return;
    case 'cd': {
      const target = resolvePath(game.cwd, parts[1] || '/'+(game.isRoot?'root':'home/'+game.user));
      const node = nodeAt(target);
      if(!node || node.type!=='dir'){ print(`cd: ${parts[1]}: Aucun fichier ou dossier de ce type`, 'err'); return; }
      if(!canRead(node, game)){ print(`cd: ${parts[1]}: Permission non accordée`, 'err'); return; }
      game.cwd = target; renderPrompt(); return;
    }
    case 'ls': {
      let args = parts.slice(1);
      let showAll = false;
      args = args.filter(a=>{ if(a==='-la'||a==='-al'||a==='-a'||a==='-l'){ showAll = showAll || a.includes('l'); return false; } return true; });
      const target = resolvePath(game.cwd, args[0]);
      listDir(target, showAll);
      return;
    }
    case 'cat': {
      if(!parts[1]){ print('cat: opérande manquant', 'err'); return; }
      const target = resolvePath(game.cwd, parts[1]);
      const node = nodeAt(target);
      if(!node || node.type!=='file'){ print(`cat: ${parts[1]}: Aucun fichier ou dossier de ce type`, 'err'); return; }
      if(!canRead(node, game)){ print(`cat: ${parts[1]}: Permission non accordée`, 'err'); return; }
      print(node.content.replace(/\n$/,''), 'out');
      if(scn.onCat) scn.onCat(game, node, target, print);
      checkAutoWin();
      return;
    }
    case 'find': {
      if(cmd.includes('-perm') && cmd.includes('4000')){
        Object.keys(game.vfs).forEach(p=>{
          const n = game.vfs[p];
          if(n.type==='file' && n.suid) print(p, 'out');
        });
        return;
      }
      print('find: utilisation: find <chemin> -perm -4000   ou   find <chemin> -exec /bin/sh -p \\;', 'err');
      return;
    }
    case 'chmod': {
      if(parts.length < 3){ print('chmod: opérandes manquants', 'err'); return; }
      const target = resolvePath(game.cwd, parts[2]);
      const node = nodeAt(target);
      if(!node){ print(`chmod: ${parts[2]}: Aucun fichier ou dossier de ce type`, 'err'); return; }
      if(!game.isRoot && node.owner !== game.user){ print(`chmod: modification du propriétaire refusée pour '${parts[2]}'`, 'err'); return; }
      const mode = parts[1];
      if(mode === 'u-s'){ node.suid = false; print(`[chmod] bit SUID retiré sur ${parts[2]}`, 'info'); }
      else if(mode === 'u+s'){ node.suid = true; print(`[chmod] bit SUID ajouté sur ${parts[2]}`, 'info'); }
      else if(/^\d{3,4}$/.test(mode)){
        if(mode.length===4){ node.suid = mode[0]==='4'; node.perm = mode.slice(1); }
        else { node.perm = mode; }
        print(`[chmod] permissions de ${parts[2]} réglées sur ${mode}`, 'info');
      } else {
        print(`chmod: mode invalide : '${mode}'`, 'err'); return;
      }
      checkAutoWin();
      return;
    }
    case 'chown': {
      if(parts.length < 3){ print('chown: opérandes manquants', 'err'); return; }
      const target = resolvePath(game.cwd, parts[2]);
      const node = nodeAt(target);
      if(!node){ print(`chown: ${parts[2]}: Aucun fichier ou dossier de ce type`, 'err'); return; }
      if(!game.isRoot){ print(`chown: modification du propriétaire refusée`, 'err'); return; }
      node.owner = parts[1].split(':')[0];
      print(`[chown] propriétaire de ${parts[2]} réglé sur ${node.owner}`, 'info');
      checkAutoWin();
      return;
    }
    case 'ps':
      print('USER   PID  COMMAND', 'out');
      print('root     1  /sbin/init', 'out');
      print(`${game.user}   842  -bash`, 'out');
      return;
    case 'crontab': {
      if(parts[1] === '-l'){ print(`Utiliser 'cat /etc/cron.d/backup' pour ce système.`, 'info'); return; }
      print('crontab: usage: crontab -l', 'err'); return;
    }
    case 'sudo': {
      print(`Sorry, user ${game.user} is not allowed to execute '${parts.slice(1).join(' ')}' as root.`, 'err');
      return;
    }
    case 'nano': case 'vi': case 'vim': {
      if(!parts[1]){ print(`${c0}: aucun fichier spécifié`, 'err'); return; }
      const target = resolvePath(game.cwd, parts[1]);
      openNanoEditor(target);
      return;
    }
    case 'verify': {
      if(game.phase !== 'defense'){ print("La commande 'verify' n'est disponible qu'en phase de défense.", 'err'); return; }
      if(scn.defenseCheck(game)){
        print('[verify] Configuration correctement durcie. Lancez `replay` pour confirmer.', 'ok');
      } else {
        print('[verify] La configuration présente encore la faille exploitée précédemment.', 'err');
      }
      return;
    }
    case 'replay': {
      if(game.phase !== 'defense'){ print("La commande 'replay' n'est disponible qu'en phase de défense.", 'err'); return; }
      const result = scn.replay(game);
      result.log.forEach(l=>print(l.t, l.cls));
      if(result.success){
        setVerdict(`<div class="verdict-banner open">❌ ATTAQUE TOUJOURS POSSIBLE — la configuration doit être corrigée.</div>`);
      } else {
        setVerdict(`<div class="verdict-banner blocked">✅ ATTAQUE BLOQUÉE — le système résiste désormais à cette technique.</div>`);
        if(!progress[scn.id].defense) completeDefense();
      }
      return;
    }
    case 'touch': {
      if(!parts[1]){ print('touch: opérande manquant', 'err'); return; }
      const target = resolvePath(game.cwd, parts[1]);
      if(nodeAt(target)){ print(`[touch] horodatage de ${parts[1]} mis à jour.`, 'info'); return; }
      const parentPath = target.substring(0, target.lastIndexOf('/')) || '/';
      const parent = nodeAt(parentPath);
      if(!parent || parent.type!=='dir'){ print(`touch: impossible de créer '${parts[1]}': Aucun fichier ou dossier de ce type`, 'err'); return; }
      if(!canWrite(parent, game)){ print(`touch: impossible de créer '${parts[1]}': Permission non accordée`, 'err'); return; }
      const name = target.substring(target.lastIndexOf('/')+1);
      game.vfs[target] = {type:'file', perm:'644', owner: game.isRoot?'root':game.user, size:0, content:''};
      if(!parent.children.includes(name)) parent.children.push(name);
      print(`[touch] fichier ${parts[1]} créé.`, 'info');
      checkAutoWin();
      return;
    }
    case 'dig': print('dig: utilisation attendue : dig axfr <zone> @<serveur>', 'err'); return;
    case 'ldapsearch': print('ldapsearch: utilisation attendue : ldapsearch -x -H ldap://<host> -b "<base-dn>"', 'err'); return;
    case 'showmount': print('showmount: utilisation attendue : showmount -e <host>', 'err'); return;
    case 'mount': print('mount: utilisation attendue : mount -t nfs <host>:<export> <point-de-montage>', 'err'); return;
    case 'restart-service': case 'net': case 'sc':
      print(`${c0}: service introuvable ou syntaxe incorrecte pour ce scénario`, 'err'); return;
    case 'getcap': print('getcap: utilisation attendue : getcap -r / 2>/dev/null', 'err'); return;
    case 'setcap': print('setcap: utilisation attendue : setcap -r <binaire>', 'err'); return;
    case 'docker': print('docker: utilisation attendue : docker run -v /:/mnt --rm -it alpine chroot /mnt sh', 'err'); return;
    case 'python3': print(`python3: utilisation attendue : python3 -c '<code>'`, 'err'); return;
    case 'su': print('su: Authentification échouée', 'err'); return;
    case 'systemctl': print('systemctl: utilisation attendue : systemctl restart <service>', 'err'); return;
    default:
      print(`${c0}: commande introuvable`, 'err');
  }
}

function completeAttack(){
  const scn = currentScenario();
  const elapsedSec = (Date.now() - game.phaseStartTime) / 1000;
  const score = computeScore(game.history.length, game.hintIndex, elapsedSec);
  progress[scn.id].attack = true;
  progress[scn.id].scoreAttack = score;
  progress[scn.id].timeAttack = Math.round(elapsedSec);
  progress[scn.id].hintsAttack = game.hintIndex;
  progress[scn.id].commandsAttack = game.history.length;
  saveProgress(progress);
  playSound('success');
  registerPhaseOutcome(game.hintIndex);
  checkAchievements({hints: game.hintIndex, elapsedSec, phase:'attack'});
  renderSidebar();
  renderTopbar();
  showModal({
    kind:'attack',
    title:'🚩 Système compromis',
    body:`Vous avez exploité la faille "${scn.title}" et obtenu un accès root (ou l'accès non autorisé visé).`,
    flag: extractFlagFromLog(),
    scoreInfo:{score, commands: game.history.length, hints: game.hintIndex, time: elapsedSec},
    primaryLabel:'Passer à la phase de défense →',
    onPrimary(){ startPhase(game.scenarioIndex, 'defense'); }
  });
}

function completeDefense(){
  const scn = currentScenario();
  const elapsedSec = (Date.now() - game.phaseStartTime) / 1000;
  const score = computeScore(game.history.length, game.hintIndex, elapsedSec);
  progress[scn.id].defense = true;
  progress[scn.id].scoreDefense = score;
  progress[scn.id].timeDefense = Math.round(elapsedSec);
  progress[scn.id].hintsDefense = game.hintIndex;
  progress[scn.id].commandsDefense = game.history.length;
  saveProgress(progress);
  playSound('hardened');
  registerPhaseOutcome(game.hintIndex);
  checkAchievements({hints: game.hintIndex, elapsedSec, phase:'defense'});
  renderSidebar();
  renderTopbar();
  const isLast = game.scenarioIndex === SCENARIOS.length - 1;
  if(isLast){
    showRunCompleteModal();
    return;
  }
  showModal({
    kind:'defense',
    title:'🛡️ Système durci',
    body:`La faille "${scn.title}" est corrigée et l'attaque rejouée échoue désormais.`,
    flag: null,
    scoreInfo:{score, commands: game.history.length, hints: game.hintIndex, time: elapsedSec},
    primaryLabel:'Scénario suivant (phase attaque) →',
    onPrimary(){ startPhase(game.scenarioIndex+1, 'attack'); }
  });
}
