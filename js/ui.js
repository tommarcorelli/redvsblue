/* =========================================================
   RED vs BLUE — interface : navigation, rendu, terminal
   ========================================================= */

/* ---------- Navigation entre écrans ---------- */

let pendingMission = null; // {index, phase} en attente de briefing

function showScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-'+name).classList.add('active');
}

function goHome(){
  renderHome();
  showScreen('home');
  switchHomeTab('accueil');
  if(window.playBootLog) window.playBootLog();
}

/* ---------- Onglets de l'écran d'accueil ---------- */
function switchHomeTab(name){
  document.querySelectorAll('.home-tab').forEach(b=> b.classList.toggle('active', b.dataset.tab===name));
  document.querySelectorAll('.tab-panel').forEach(p=> p.classList.toggle('active', p.dataset.panel===name));
  const screen = document.getElementById('screen-home');
  if(screen) screen.scrollTo({top:0, behavior:'auto'});
}
window.switchHomeTab = switchHomeTab;

function renderHome(){
  const total = SCENARIOS.length;
  const done = SCENARIOS.filter(s=>progress[s.id].attack && progress[s.id].defense).length;
  document.getElementById('home-progress-label').textContent = `${done} / ${total} systèmes sécurisés`;
  document.getElementById('home-progress-fill').style.width = (done/total*100)+'%';

  const grid = document.getElementById('home-mission-grid');
  grid.innerHTML = '';
  SCENARIOS.forEach((s,i)=>{
    const unlocked = isScenarioUnlocked(i);
    const defUnlocked = isDefenseUnlocked(i);
    const p = progress[s.id];
    const statusClass = !unlocked ? 'locked' : (p.attack && p.defense) ? 'secured' : 'progress';
    const statusText = !unlocked ? 'Verrouillé' : (p.attack && p.defense) ? 'Sécurisé' : 'En cours';
    const card = document.createElement('div');
    card.className = 'mission-card ' + statusClass;
    card.innerHTML = `
      <div class="mc-head">
        <span class="mc-num">Paire ${String(i+1).padStart(2,'0')} · ${s.category}</span>
        <span class="mc-status ${statusClass}">${statusText}</span>
      </div>
      <div class="mc-title">${s.title}</div>
      <div class="mc-row">
        <button class="phase-btn attack-btn ${p.attack?'done':''}" ${!unlocked?'disabled':''}>Attaque</button>
        <button class="phase-btn defense-btn ${p.defense?'done':''}" ${(!unlocked||!defUnlocked)?'disabled':''}>Défense</button>
      </div>`;
    if(unlocked){
      card.querySelector('.attack-btn').addEventListener('click', ()=> openBriefing(i,'attack'));
      if(defUnlocked) card.querySelector('.defense-btn').addEventListener('click', ()=> openBriefing(i,'defense'));
    }
    grid.appendChild(card);
  });

  if(window.renderNetworkMap) renderNetworkMap();
  renderAchievements();
  renderLeaderboard();
  renderSandboxPanel();
  renderDailyPanel();
  renderLearnCatalog();
  renderDashboard();
  renderChainsCatalog();
  if(window.updateSoundToggleUI) updateSoundToggleUI();
}

function openBriefing(index, phase){
  if(!isScenarioUnlocked(index)) return;
  if(phase === 'defense' && !isDefenseUnlocked(index)) return;
  pendingMission = {index, phase};
  renderBriefing(index, phase);
  showScreen('briefing');
}

function launchGame(){
  if(!pendingMission) return;
  game.sandbox = false;
  game.daily = false;
  startPhase(pendingMission.index, pendingMission.phase);
  showScreen('game');
  document.getElementById('term-input').focus();
}

/* ---------- Écran de briefing ---------- */

function renderBriefing(index, phase){
  const scn = SCENARIOS[index];
  const info = scn[phase];
  const card = document.getElementById('briefing-card');
  card.className = 'briefing-card ' + phase;
  const eyebrow = document.getElementById('briefing-eyebrow');
  eyebrow.className = 'briefing-eyebrow ' + phase;
  eyebrow.textContent = (phase==='attack' ? '🎯 Phase attaque — ' : '🛡️ Phase défense — ') + scn.category;
  document.getElementById('briefing-title').textContent = scn.title;
  document.getElementById('briefing-who').textContent = info.who;
  document.getElementById('briefing-desc').textContent = info.desc;
}

/* ---------- Écran de jeu : rendu ---------- */

const missionListEl = document.getElementById('mission-list');
const objPanel = document.getElementById('objective-panel');
const objTitle = document.getElementById('obj-title');
const objWho = document.getElementById('obj-who');
const objDesc = document.getElementById('obj-desc');
const hintsList = document.getElementById('hints-list');
const verdictSlot = document.getElementById('verdict-slot');
const phasePill = document.getElementById('phase-pill');
const promptLabel = document.getElementById('prompt-label');
const termHost = document.getElementById('term-host');
const progressTag = document.getElementById('progress-tag');

function renderSandboxSidebar(){
  const stats = loadSandboxStats();
  missionListEl.innerHTML = `
    <div class="sandbox-side">
      <div class="sandbox-side-title">🎲 Mode bac à sable</div>
      <div class="sandbox-side-desc">Système et faille tirés au hasard parmi les ${SCENARIOS.length} scénarios. Aucune progression du parcours guidé n'est affectée.</div>
      <div class="sandbox-side-stat"><b>${stats.solved}</b> défi(s) résolu(s)</div>
      <div class="sandbox-side-stat">${stats.bestTimeMs!==null ? '🏅 record : ' + formatDuration(stats.bestTimeMs/1000) : 'Aucun record pour l\'instant'}</div>
      <button class="ghost" id="btn-sandbox-reroll">🎲 Nouveau défi aléatoire</button>
      <button class="ghost" id="btn-sandbox-quit">← Quitter le bac à sable</button>
    </div>`;
  document.getElementById('btn-sandbox-reroll').addEventListener('click', ()=> startSandboxChallenge());
  document.getElementById('btn-sandbox-quit').addEventListener('click', goHome);
}

function renderChainSidebar(){
  const chain = game.chain;
  missionListEl.innerHTML = `
    <div class="chain-side">
      <div class="chain-side-title">🔗 ${escapeHtml(chain.title)}</div>
      <div class="chain-side-sub">${escapeHtml(chain.subtitle)}</div>
      <div class="chain-steps">
        ${chain.stages.map((s,i)=>{
          const st = i < game.chainStage ? 'done' : (i === game.chainStage ? 'current' : 'todo');
          const ic = st==='done' ? '✓' : (st==='current' ? '▶' : (i+1));
          return `<div class="chain-step ${st}"><span class="cs-ic">${ic}</span><span class="cs-tt">${escapeHtml(s.title)}</span></div>`;
        }).join('')}
      </div>
      <button class="ghost" id="btn-chain-quit">← Quitter la chaîne</button>
    </div>`;
  const q = document.getElementById('btn-chain-quit');
  if(q) q.onclick = ()=>{ endChain(); goHome(); };
}

function renderSidebar(){
  if(game.chain){ renderChainSidebar(); return; }
  if(game.sandbox){ renderSandboxSidebar(); return; }
  missionListEl.innerHTML = '';
  SCENARIOS.forEach((s, i)=>{
    const unlocked = isScenarioUnlocked(i);
    const p = progress[s.id];
    const div = document.createElement('div');
    div.className = 'mission' + (!unlocked ? ' locked' : '') + (i===game.scenarioIndex ? ' current' : '');
    div.innerHTML = `
      <div class="mission-num">PAIRE ${String(i+1).padStart(2,'0')} — ${s.category}</div>
      <div class="mission-title">${s.title}</div>
      <div class="mission-badges">
        <span class="badge ${p.attack?'a-done':''} ${i===game.scenarioIndex && game.phase==='attack'?'active':''}">Attaque</span>
        <span class="badge ${p.defense?'d-done':''} ${i===game.scenarioIndex && game.phase==='defense'?'active':''}">Défense</span>
      </div>`;
    if(unlocked){
      div.addEventListener('click', ()=>{
        const phase = (p.attack && !p.defense) ? 'defense' : 'attack';
        if(phase === 'defense' && !isDefenseUnlocked(i)) return;
        openBriefing(i, phase);
      });
    }
    missionListEl.appendChild(div);
  });
}

function guidedAttrEsc(s){
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function renderGuidedSteps(info){
  const head = `<div class="guided-head">🧭 Marche à suivre — cliquez une commande pour l'insérer dans le terminal, puis appuyez sur Entrée.</div>`;
  const steps = info.hints.map((h,k)=>{
    const cmds = (h.match(/`([^`]+)`/g) || []).map(x=> x.slice(1,-1));
    const btns = cmds.map(c=> `<button class="cmd-run" data-cmd="${guidedAttrEsc(c)}">▶ ${escapeHtml(c)}</button>`).join('');
    return `<div class="guided-step">
      <span class="gs-num">${k+1}</span>
      <div class="gs-body"><div class="gs-text">${fmtLessonText(h)}</div>${btns?`<div class="gs-cmds">${btns}</div>`:''}</div>
    </div>`;
  }).join('');
  return head + steps;
}

function renderChainObjective(){
  const chain = game.chain;
  const stage = chain.stages[game.chainStage];
  objPanel.className = 'objective attack';
  objTitle.textContent = `🔗 Étape ${game.chainStage+1}/${chain.stages.length} — ${stage.title}`;
  objWho.textContent = chain.subtitle;
  objDesc.textContent = stage.desc;
  hintsList.innerHTML = '';
  for(let k=0;k<game.hintIndex;k++){
    const d = document.createElement('div');
    d.textContent = stage.hints[k];
    hintsList.appendChild(d);
  }
  const gb = document.getElementById('btn-guided');
  const gp = document.getElementById('guided-panel');
  if(gb && gp){
    gb.style.display = '';
    gb.classList.toggle('active', !!game.guided);
    gb.textContent = game.guided ? '🧭 Mode guidé : ON' : '🧭 Mode guidé';
    gp.style.display = game.guided ? '' : 'none';
    gp.innerHTML = game.guided ? renderGuidedSteps({hints:stage.hints}) : '';
  }
  verdictSlot.innerHTML = '';
}

function renderObjective(){
  if(game.chain){ renderChainObjective(); return; }
  const scn = currentScenario();
  const info = scn[game.phase];
  objPanel.className = 'objective ' + game.phase;
  objTitle.textContent = (game.phase==='attack' ? '🎯 ' : '🛡️ ') + scn.title;
  objWho.textContent = info.who;
  objDesc.textContent = info.desc;
  hintsList.innerHTML = '';
  for(let k=0;k<game.hintIndex;k++){
    const d = document.createElement('div');
    d.textContent = info.hints[k];
    hintsList.appendChild(d);
  }

  // Mode guidé (indisponible en bac à sable pour préserver le défi libre)
  const guidedBtn = document.getElementById('btn-guided');
  const guidedPanel = document.getElementById('guided-panel');
  if(guidedBtn && guidedPanel){
    if(game.sandbox){
      guidedBtn.style.display = 'none';
      guidedPanel.style.display = 'none';
      guidedPanel.innerHTML = '';
    } else {
      guidedBtn.style.display = '';
      guidedBtn.classList.toggle('active', !!game.guided);
      guidedBtn.textContent = game.guided ? '🧭 Mode guidé : ON' : '🧭 Mode guidé';
      if(game.guided){
        guidedPanel.style.display = '';
        guidedPanel.innerHTML = renderGuidedSteps(info);
      } else {
        guidedPanel.style.display = 'none';
        guidedPanel.innerHTML = '';
      }
    }
  }

  verdictSlot.innerHTML = '';
}

function renderTopbar(){
  if(game.chain){
    phasePill.textContent = `🔗 CHAÎNE — ÉTAPE ${game.chainStage+1}/${game.chain.stages.length}`;
    phasePill.className = 'phase-pill chain';
    progressTag.textContent = game.chain.title;
    renderScoreHud();
    return;
  }
  if(game.sandbox){
    phasePill.textContent = '🎲 BAC À SABLE';
    phasePill.className = 'phase-pill sandbox';
    const stats = loadSandboxStats();
    progressTag.textContent = `${stats.solved} défi(s) résolu(s)` + (stats.bestTimeMs!==null ? ` — record ${formatDuration(stats.bestTimeMs/1000)}` : '');
  } else {
    phasePill.textContent = game.phase==='attack' ? 'PHASE ATTAQUE' : 'PHASE DÉFENSE';
    phasePill.className = 'phase-pill ' + game.phase;
    const done = SCENARIOS.filter(s=>progress[s.id].attack && progress[s.id].defense).length;
    progressTag.textContent = `${done} / ${SCENARIOS.length} systèmes sécurisés`;
  }
  renderScoreHud();
}

function renderScoreHud(){
  const timerEl = document.getElementById('hud-timer');
  const scoreEl = document.getElementById('hud-score');
  if(!timerEl || !scoreEl || !game.vfs) return;
  const elapsedSec = (Date.now() - game.phaseStartTime) / 1000;
  timerEl.textContent = '⏱ ' + formatDuration(elapsedSec);
  if(game.phase === 'attack' || game.sandbox){
    const est = computeScore(game.history.length, game.hintIndex, elapsedSec);
    scoreEl.textContent = `🧮 ~${est} pts · ⌨ ${game.history.length}`;
  } else {
    scoreEl.textContent = `⌨ ${game.history.length} commande(s)`;
  }
}
window.renderScoreHud = renderScoreHud;

function renderPrompt(){
  promptLabel.className = 'prompt-label ' + game.phase;
  const userTag = game.isRoot ? '#' : '$';
  promptLabel.textContent = `${game.user}@${game.host||'target-lab'}:${game.cwd}${userTag}`;
  termHost.textContent = `${game.host||'target-lab'} — ${currentScenario().title} — ${game.phase==='attack'?'terminal attaquant':'terminal administrateur'}`;
}

function renderAll(){
  renderSidebar();
  renderObjective();
  renderTopbar();
  renderPrompt();
}

function setVerdict(html){ verdictSlot.innerHTML = html; }

function showDefenseReadyBanner(){
  setVerdict(`<div class="verdict-banner blocked">La configuration semble durcie. Tapez <b>replay</b> pour vérifier que l'attaque est désormais bloquée.</div>`);
}

/* ---------- Terminal ---------- */

const termBody = document.getElementById('term-body');
const termInput = document.getElementById('term-input');

function clearTerminal(){ termBody.innerHTML = ''; }
function print(text, cls){
  const div = document.createElement('div');
  div.className = 'line ' + (cls||'out');
  div.textContent = text;
  termBody.appendChild(div);
  termBody.scrollTop = termBody.scrollHeight;
  if(cls === 'err') playSound('error');
}
function printPromptEcho(cmd){
  const label = promptLabel.textContent;
  print(label + ' ' + cmd, 'prompt-line');
}
function printWelcome(){
  if(game.phase==='attack'){
    print(`Connexion établie sur ${game.host||'target-lab'} en tant que ${game.user}.`, 'info');
    print(`Tapez 'help' pour la liste des commandes disponibles.`, 'info');
  } else {
    print(`Session administrateur ouverte sur ${game.host||'target-lab'}.`, 'info');
    print(`La vulnérabilité que vous venez d'exploiter est toujours active sur ce système. Corrigez-la.`, 'info');
  }
}

function extractFlagFromLog(){
  const lines = [...termBody.querySelectorAll('.flagline')];
  if(lines.length) return lines[lines.length-1].textContent;
  return null;
}

/* ---------- Éditeur nano simulé ---------- */

function openNanoEditor(path){
  const node = nodeAt(path);
  if(!node){ print(`nano: impossible d'ouvrir ${path}`, 'err'); return; }
  if(!canWrite(node, game) && !game.isRoot){
    print(`nano: [Impossible d'écrire dans ${path}] Permission non accordée`, 'err');
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="nano-head">GNU nano — édition de <b>${path}</b></div>
      <textarea id="nano-area">${node.content}</textarea>
      <div class="modal-actions">
        <button class="ghost" id="nano-cancel">Annuler (Ctrl+X sans sauver)</button>
        <button class="solid-blue" id="nano-save">Sauvegarder (Ctrl+O)</button>
      </div>
    </div>`;
  document.getElementById('modal-root').appendChild(overlay);
  document.getElementById('nano-cancel').onclick = ()=>{ overlay.remove(); };
  document.getElementById('nano-save').onclick = ()=>{
    const val = document.getElementById('nano-area').value;
    node.content = val;
    print(`[nano] fichier ${path} sauvegardé (${val.length} octets).`, 'info');
    overlay.remove();
    checkAutoWin();
  };
}

/* ---------- Modale générique de fin de phase ---------- */

function showModal({title, body, flag, scoreInfo, primaryLabel, onPrimary, closeLabel, onClose}){
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const scoreHtml = scoreInfo ? `
    <div class="score-summary">
      <div class="score-big">${scoreInfo.score}<span>pts</span></div>
      <div class="score-details">⌨ ${scoreInfo.commands} commande(s) · 💡 ${scoreInfo.hints} indice(s) · ⏱ ${formatDuration(scoreInfo.time)}</div>
    </div>` : '';
  overlay.innerHTML = `
    <div class="modal">
      <h2>${title}</h2>
      <p>${body}</p>
      ${scoreHtml}
      ${flag ? `<div class="flagbox">${flag}</div>` : ''}
      <div class="modal-actions">
        <button class="ghost" id="modal-close">${closeLabel || 'Rester ici'}</button>
        <button class="solid-${flag? 'red':'blue'}" id="modal-primary">${primaryLabel}</button>
      </div>
    </div>`;
  document.getElementById('modal-root').appendChild(overlay);
  document.getElementById('modal-close').onclick = ()=>{ overlay.remove(); if(onClose) onClose(); };
  document.getElementById('modal-primary').onclick = ()=>{ overlay.remove(); onPrimary(); };
}

/* ---------- Modale de fin de parcours complet (classement local) ---------- */

function showRunCompleteModal(){
  const total = totalScore();
  const totalTimeSec = totalPlayTimeSec();
  let lastName = '';
  try{ lastName = localStorage.getItem('redvsblue_last_name_v1') || ''; }catch(e){}
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>🏆 Parcours complet !</h2>
      <p>Bravo, vous avez sécurisé les ${SCENARIOS.length} systèmes du parcours Red vs Blue.</p>
      <div class="score-summary">
        <div class="score-big">${total}<span>pts au total</span></div>
        <div class="score-details">⏱ temps cumulé : ${formatDuration(totalTimeSec)}</div>
      </div>
      <label class="lb-name-label" for="lb-name-input">Pseudo pour le classement local :</label>
      <input id="lb-name-input" class="lb-name-input" maxlength="24" autocomplete="off" placeholder="ex : bob" value="${escapeHtml(lastName)}"/>
      <div class="modal-actions">
        <button class="ghost" id="modal-skip">Retour au menu</button>
        <button class="solid-blue" id="modal-save-score">Enregistrer mon score →</button>
      </div>
    </div>`;
  document.getElementById('modal-root').appendChild(overlay);
  document.getElementById('modal-skip').onclick = ()=>{ overlay.remove(); goHome(); };
  document.getElementById('modal-save-score').onclick = ()=>{
    const input = document.getElementById('lb-name-input');
    const name = (input.value || 'Anonyme').trim().slice(0,24) || 'Anonyme';
    try{ localStorage.setItem('redvsblue_last_name_v1', name); }catch(e){}
    saveLeaderboardEntry({name, totalScore: total, totalTimeSec, date: new Date().toISOString()});
    overlay.remove();
    goHome();
  };
}

/* ---------- Succès : toast + grille écran d'accueil ---------- */

function showAchievementToast(a){
  const root = document.getElementById('toast-root');
  if(!root) return;
  const div = document.createElement('div');
  div.className = 'toast achv-toast';
  div.innerHTML = `<div class="toast-icon">${a.icon}</div><div><div class="toast-title">Succès débloqué</div><div class="toast-desc">${escapeHtml(a.title)}</div></div>`;
  root.appendChild(div);
  requestAnimationFrame(()=> div.classList.add('show'));
  setTimeout(()=>{
    div.classList.remove('show');
    setTimeout(()=> div.remove(), 400);
  }, 4200);
}
window.showAchievementToast = showAchievementToast;

function renderAchievements(){
  const grid = document.getElementById('achv-grid');
  if(!grid) return;
  const unlocked = loadUnlockedAchievements();
  grid.innerHTML = '';
  ACHIEVEMENTS.forEach(a=>{
    const got = unlocked.includes(a.id);
    const div = document.createElement('div');
    div.className = 'achv-card' + (got ? ' unlocked' : ' locked');
    div.innerHTML = `
      <div class="achv-icon">${got ? a.icon : '🔒'}</div>
      <div class="achv-title">${got ? escapeHtml(a.title) : '???'}</div>
      <div class="achv-desc">${got ? escapeHtml(a.desc) : 'Succès verrouillé'}</div>`;
    grid.appendChild(div);
  });
}

/* ---------- Classement local : rendu écran d'accueil ---------- */

function renderLeaderboard(){
  const el = document.getElementById('leaderboard-list');
  if(!el) return;
  const list = loadLeaderboard();
  if(!list.length){
    el.innerHTML = `<div class="lb-empty">Aucun score enregistré pour l'instant — terminez le parcours complet pour apparaître ici.</div>`;
    return;
  }
  el.innerHTML = list.slice(0,10).map((e,i)=>`
    <div class="lb-row${i===0?' lb-first':''}">
      <span class="lb-rank">#${i+1}</span>
      <span class="lb-name">${escapeHtml(e.name)}</span>
      <span class="lb-score">${e.totalScore} pts</span>
      <span class="lb-time">⏱ ${formatDuration(e.totalTimeSec)}</span>
      <span class="lb-date">${new Date(e.date).toLocaleDateString('fr-FR')}</span>
    </div>`).join('');
}

/* ---------- Bac à sable : panneau écran d'accueil ---------- */

function renderSandboxPanel(){
  const el = document.getElementById('sandbox-stats');
  if(!el) return;
  const s = loadSandboxStats();
  el.innerHTML = `
    <div class="sb-stat"><b>${s.solved}</b> défi(s) résolu(s)</div>
    <div class="sb-stat">${s.bestTimeMs!==null ? '🏅 meilleur temps : ' + formatDuration(s.bestTimeMs/1000) : 'Aucun record pour l\'instant'}</div>`;
}
window.renderSandboxPanel = renderSandboxPanel;

/* ---------- Faille du jour (v1.2) ---------- */
function renderDailyPanel(){
  const cardEl = document.getElementById('daily-card');
  const statsEl = document.getElementById('daily-stats');
  if(!cardEl || !statsEl) return;
  const {date, scenario} = getDailyChallenge();
  const stats = loadDailyStats();
  const done = stats.history[date];
  cardEl.innerHTML = `
    <div class="dc-date">${date}</div>
    <div class="dc-title">${scenario.title}</div>
    <div class="dc-meta">${scenario.category}</div>
    ${done ? `<div class="dc-done">✅ Résolue aujourd'hui en ${formatDuration(done.elapsedSec)}</div>` : ''}`;
  statsEl.innerHTML = `
    <div class="sb-stat"><b>${stats.streak}</b> jour${stats.streak>1?'s':''} de série</div>
    <div class="sb-stat"><b>${Object.keys(stats.history).length}</b> faille(s) du jour résolue(s) au total</div>`;
  const btn = document.getElementById('btn-daily');
  if(btn) btn.textContent = done ? '🗓️ Rejouer pour s\'entraîner' : '🗓️ Lancer la faille du jour';
}
window.renderDailyPanel = renderDailyPanel;

/* ---------- Bilan : tableau de bord de compétences ---------- */

const SKILL_FAMILIES = [
  { name:'Privesc Linux', icon:'🐧', color:'var(--green)', ids:['suid-find','cron-writable','sudo-awk','ssh-key-exposed','capability-setuid-python','path-hijack-cron','passwd-world-writable','shadow-world-readable','sudo-ld-preload','systemd-unit-writable','tar-wildcard-injection','pwnkit-cve-2021-4034','capability-dac-read-search'] },
  { name:'Réseau & services', icon:'🌐', color:'var(--blue)', ids:['nfs-no-root-squash','dns-axfr','ldap-anonymous-bind','redis-unauthenticated','elasticsearch-unauthenticated'] },
  { name:'Web & API', icon:'🕸️', color:'var(--red)', ids:['git-directory-exposed','jwt-alg-none-forgery','log4shell-jndi-rce','python-pickle-deserialization','ssti-jinja2-flask'] },
  { name:'Cloud & IaC', icon:'☁️', color:'var(--gold)', ids:['aws-imds-ssrf','s3-bucket-public','terraform-state-exposed','jenkins-script-console-open'] },
  { name:'Conteneurs', icon:'📦', color:'var(--purple)', ids:['docker-socket-writable','k8s-privileged-hostpath','docker-registry-unauthenticated'] },
  { name:'Windows', icon:'🪟', color:'#7cb3ff', ids:['windows-unquoted-path'] }
];

function familyStat(fam){
  let attacked=0, secured=0;
  fam.ids.forEach(id=>{
    const p = progress[id]; if(!p) return;
    if(p.attack) attacked++;
    if(p.attack && p.defense) secured++;
  });
  const total = fam.ids.length;
  return {total, attacked, secured, attackedPct: total?attacked/total:0, securedPct: total?secured/total:0};
}

function buildSkillRadar(stats){
  const N = SKILL_FAMILIES.length;
  const cx=235, cy=175, R=110;
  const ang = i => (-90 + i*(360/N)) * Math.PI/180;
  const pt = (i, val)=>[cx + R*val*Math.cos(ang(i)), cy + R*val*Math.sin(ang(i))];
  const poly = (vals)=> vals.map((v,i)=> pt(i,v).map(n=>n.toFixed(1)).join(',')).join(' ');

  let grid='';
  [0.25,0.5,0.75,1].forEach(v=>{ grid += `<polygon class="rad-ring" points="${poly(SKILL_FAMILIES.map(()=>v))}"/>`; });

  let spokes='', labels='';
  SKILL_FAMILIES.forEach((f,i)=>{
    const [ex,ey]=pt(i,1);
    spokes += `<line class="rad-spoke" x1="${cx}" y1="${cy}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}"/>`;
    const [lx,ly]=pt(i,1.17);
    const anchor = Math.abs(lx-cx)<10 ? 'middle' : (lx>cx?'start':'end');
    labels += `<text class="rad-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">${f.icon} ${f.name}</text>`
            + `<text class="rad-sub" x="${lx.toFixed(1)}" y="${(ly+12).toFixed(1)}" text-anchor="${anchor}">${stats[i].secured}/${stats[i].total}</text>`;
  });

  const polyAttacked = poly(stats.map(s=>s.attackedPct));
  const polySecured  = poly(stats.map(s=>s.securedPct));
  return `<svg viewBox="0 0 470 350" class="radar-svg" role="img" aria-label="Radar des compétences par famille technique">
    ${grid}${spokes}
    <polygon class="rad-attacked" points="${polyAttacked}"/>
    <polygon class="rad-secured" points="${polySecured}"/>
    ${labels}
  </svg>`;
}

function renderDashboard(){
  const statsEl = document.getElementById('dash-stats');
  const radarEl = document.getElementById('dash-radar');
  const famEl = document.getElementById('dash-families');
  if(!statsEl || !radarEl || !famEl) return;

  const total = SCENARIOS.length;
  const secured = SCENARIOS.filter(s=>progress[s.id].attack && progress[s.id].defense).length;
  const attacked = SCENARIOS.filter(s=>progress[s.id].attack).length;
  const fstats = SKILL_FAMILIES.map(f=> familyStat(f));
  const withF = SKILL_FAMILIES.map((f,i)=>({f, st:fstats[i]}));
  const strong = [...withF].sort((a,b)=> b.st.securedPct - a.st.securedPct)[0];
  const rank = (pct)=> pct>=1?'Maîtrisé':pct>=0.5?'Confirmé':pct>0?'Initié':'Novice';

  const chainsDone = (typeof loadDoneChains === 'function') ? loadDoneChains() : [];
  const chainStats = (typeof loadChainStats === 'function') ? loadChainStats() : {};
  const chainTotal = (typeof CHAIN_SCENARIOS !== 'undefined') ? CHAIN_SCENARIOS.length : 0;
  const chainDoneCount = chainTotal ? CHAIN_SCENARIOS.filter(c=>chainsDone.includes(c.id)).length : 0;

  statsEl.innerHTML = `
    <div class="dash-tile"><div class="dt-val">${secured}<span>/${total}</span></div><div class="dt-lab">Systèmes sécurisés</div></div>
    <div class="dash-tile"><div class="dt-val">${attacked}<span>/${total}</span></div><div class="dt-lab">Systèmes compromis</div></div>
    <div class="dash-tile"><div class="dt-val">${chainDoneCount}<span>/${chainTotal}</span></div><div class="dt-lab">Chaînes réussies</div></div>
    <div class="dash-tile"><div class="dt-val">${totalScore()}<span>pts</span></div><div class="dt-lab">Score cumulé</div></div>
    <div class="dash-tile"><div class="dt-val dt-small">${strong.st.secured ? strong.f.icon+' '+strong.f.name : '—'}</div><div class="dt-lab">Domaine le plus fort</div></div>`;

  radarEl.innerHTML = buildSkillRadar(fstats);

  const dc = document.getElementById('dash-chains');
  if(dc && chainTotal){
    dc.innerHTML = `
      <h3 class="dash-sub-label">🔗 Chaînes d'attaque</h3>
      <div class="dash-chain-list">
        ${CHAIN_SCENARIOS.map(c=>{
          const done = chainsDone.includes(c.id);
          const bt = chainStats[c.id] ? chainStats[c.id].bestTime : null;
          return `<div class="dchain-row${done ? ' done' : ''}">
            <span class="dchain-ic">${done ? '✓' : '○'}</span>
            <span class="dchain-name">${escapeHtml(c.title)}</span>
            <span class="dchain-meta">${done ? (bt!==null ? '🏅 '+formatDuration(bt) : 'réussie') : 'à faire'}</span>
          </div>`;
        }).join('')}
      </div>`;
  }

  famEl.innerHTML = withF.map(({f,st})=>{
    const pct = Math.round(st.securedPct*100);
    return `<div class="dfam-card">
      <div class="dfam-head"><span class="dfam-icon">${f.icon}</span><span class="dfam-name">${f.name}</span><span class="dfam-rank" style="color:${f.color}">${rank(st.securedPct)}</span></div>
      <div class="dfam-bar"><div class="dfam-fill" style="width:${pct}%;background:${f.color}"></div></div>
      <div class="dfam-sub">${st.secured}/${st.total} sécurisés · ${st.attacked}/${st.total} compromis</div>
    </div>`;
  }).join('');
}
window.renderDashboard = renderDashboard;

/* ---------- Chaînes d'attaque (scénarios multi-étapes) ---------- */

function renderChainsCatalog(){
  const grid = document.getElementById('chains-grid');
  if(!grid || typeof CHAIN_SCENARIOS === 'undefined') return;
  const done = (typeof loadDoneChains === 'function') ? loadDoneChains() : [];
  const stats = (typeof loadChainStats === 'function') ? loadChainStats() : {};
  grid.innerHTML = '';
  CHAIN_SCENARIOS.forEach((c,i)=>{
    const isDone = done.includes(c.id);
    const best = stats[c.id] ? stats[c.id].bestTime : null;
    const card = document.createElement('div');
    card.className = 'chain-card' + (isDone ? ' done' : '');
    card.innerHTML = `
      <div class="cc-badge">${c.stages.length} étapes${isDone ? ' · ✓ réussie' : ''}</div>
      <div class="cc-title">🔗 ${escapeHtml(c.title)}</div>
      <div class="cc-sub">${escapeHtml(c.subtitle)}</div>
      <div class="cc-desc">${escapeHtml(c.intro)}</div>
      ${best!==null ? `<div class="cc-record">🏅 Meilleur temps : ${formatDuration(best)}</div>` : ''}
      <button class="big primary cc-launch">${isDone ? '↻ Rejouer la chaîne' : '▶ Lancer la chaîne'}</button>`;
    card.querySelector('.cc-launch').addEventListener('click', ()=>{
      startChain(i);
      showScreen('game');
      document.getElementById('term-input').focus();
    });
    grid.appendChild(card);
  });
}
window.renderChainsCatalog = renderChainsCatalog;

/* ---------- Mode Apprendre (cours) ---------- */

function fmtLessonText(t){
  const esc = String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return esc.replace(/`([^`]+)`/g, '<code>$1</code>');
}

const LESSONS_READ_KEY = 'redvsblue_lessons_read_v1';
function loadReadLessons(){
  try{ return JSON.parse(localStorage.getItem(LESSONS_READ_KEY) || '[]'); }catch(e){ return []; }
}
function markLessonRead(id){
  const r = loadReadLessons();
  if(!r.includes(id)){ r.push(id); try{ localStorage.setItem(LESSONS_READ_KEY, JSON.stringify(r)); }catch(e){} }
}

function renderLearnPath(){
  const el = document.getElementById('learn-path');
  if(!el) return;
  const read = loadReadLessons();
  const total = SCENARIOS.length;
  const done = SCENARIOS.filter(s=> read.includes(s.id)).length;
  const nextIdx = SCENARIOS.findIndex(s=> !read.includes(s.id));
  const pct = Math.round(done/total*100);
  const label = done===0 ? 'Commencer le parcours' : 'Continuer le parcours';
  el.innerHTML = `
    <div class="lp-left">
      <div class="lp-title">🧭 Parcours guidé</div>
      <div class="lp-sub">${done} / ${total} leçons lues</div>
      <div class="lp-bar"><div class="lp-fill" style="width:${pct}%"></div></div>
    </div>
    ${nextIdx===-1
      ? `<div class="lp-done">✓ Parcours terminé — toutes les leçons sont lues 🎉</div>`
      : `<button class="big primary" id="lp-continue">▶ ${label}</button>`}`;
  const btn = document.getElementById('lp-continue');
  if(btn) btn.onclick = ()=> openLesson(nextIdx);
}
window.renderLearnPath = renderLearnPath;

function renderLearnCatalog(){
  const grid = document.getElementById('learn-grid');
  if(!grid) return;
  const read = loadReadLessons();
  grid.innerHTML = '';
  SCENARIOS.forEach((s,i)=>{
    const teaser = ((s.attack.desc.split('. ')[0]) || s.attack.desc).slice(0,120);
    const isRead = read.includes(s.id);
    const card = document.createElement('div');
    card.className = 'learn-card' + (isRead ? ' read' : '');
    card.innerHTML = `
      <div class="lc-num">Leçon ${String(i+1).padStart(2,'0')} · ${escapeHtml(s.category)}${isRead?' <span class="lc-read">✓ lu</span>':''}</div>
      <div class="lc-title">${escapeHtml(s.title)}</div>
      <div class="lc-teaser">${escapeHtml(teaser)}…</div>
      <div class="lc-open">${isRead ? 'Relire la leçon →' : 'Lire la leçon →'}</div>`;
    card.addEventListener('click', ()=> openLesson(i));
    grid.appendChild(card);
  });
  renderLearnPath();
}
window.renderLearnCatalog = renderLearnCatalog;

function openLesson(index){
  const s = SCENARIOS[index];
  const unlocked = isScenarioUnlocked(index);
  const next = (index+1 < SCENARIOS.length) ? index+1 : null;
  markLessonRead(s.id);
  if(window.checkAchievements) checkAchievements({});
  renderLearnCatalog();
  renderAchievements();
  const steps = (arr)=> arr.map((h,k)=>
    `<li><span class="ls-num">${k+1}</span><span>${fmtLessonText(h)}</span></li>`).join('');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal lesson-modal">
      <div class="lesson-eyebrow">🎓 Leçon ${String(index+1).padStart(2,'0')} · ${escapeHtml(s.category)}</div>
      <h2>${escapeHtml(s.title)}</h2>

      <div class="lesson-sec concept">
        <div class="lesson-sec-h">🧠 Le concept</div>
        <p>${fmtLessonText(s.attack.desc)}</p>
      </div>

      <div class="lesson-sec attack">
        <div class="lesson-sec-h">⚔️ L'attaque, étape par étape</div>
        <ol class="lesson-steps">${steps(s.attack.hints)}</ol>
      </div>

      <div class="lesson-sec defense">
        <div class="lesson-sec-h">🛡️ La défense</div>
        <p>${fmtLessonText(s.defense.desc)}</p>
        <ol class="lesson-steps">${steps(s.defense.hints)}</ol>
      </div>

      <div class="modal-actions">
        <button class="ghost" id="lesson-close">Fermer</button>
        ${unlocked
          ? `<button class="ghost" id="lesson-practice">🎯 S'entraîner</button>`
          : `<span class="lesson-locked">🔒 Dossier verrouillé pour l'instant</span>`}
        ${next!==null
          ? `<button class="big primary" id="lesson-next">Leçon suivante →</button>`
          : `<button class="big primary" id="lesson-finish">✓ Terminer le parcours</button>`}
      </div>
    </div>`;
  document.getElementById('modal-root').appendChild(overlay);
  overlay.querySelector('.lesson-modal').scrollTop = 0;
  document.getElementById('lesson-close').onclick = ()=> overlay.remove();
  const pr = document.getElementById('lesson-practice');
  if(pr) pr.onclick = ()=>{ overlay.remove(); openBriefing(index,'attack'); };
  const nx = document.getElementById('lesson-next');
  if(nx) nx.onclick = ()=>{ overlay.remove(); openLesson(next); };
  const fn = document.getElementById('lesson-finish');
  if(fn) fn.onclick = ()=> overlay.remove();
}
window.openLesson = openLesson;

/* ---------- Bascule du son ---------- */

function updateSoundToggleUI(){
  const icon = isSoundEnabled() ? '🔊' : '🔇';
  ['btn-sound-toggle','btn-sound-toggle-home'].forEach(id=>{
    const btn = document.getElementById(id);
    if(btn) btn.textContent = icon;
  });
}
window.updateSoundToggleUI = updateSoundToggleUI;
