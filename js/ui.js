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

function familyColorForScenario(id){
  const cluster = NETWORK_CLUSTERS.find(c => c.ids.includes(id));
  return cluster ? cluster.color : 'transparent';
}

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
    card.style.setProperty('--fam-color', familyColorForScenario(s.id));
    card.style.setProperty('--reveal-delay', (Math.min(i,20)*22)+'ms');
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
  // v2.1 : au-delà d'une série de phases réussies sans indice, le mode
  // guidé arrête d'étaler les commandes toutes faites — il faut cliquer
  // "Afficher" pour les révéler une par une, une par étape.
  const redacted = (typeof isAdaptiveModeActive === 'function') && isAdaptiveModeActive();
  const head = redacted
    ? `<div class="guided-head">🧭 Marche à suivre — série sans indice en cours (${adaptiveStreak()}) : les commandes sont repliées, cliquez « Afficher » quand vous en avez besoin.</div>`
    : `<div class="guided-head">🧭 Marche à suivre — cliquez une commande pour l'insérer dans le terminal, puis appuyez sur Entrée.</div>`;
  const steps = info.hints.map((h,k)=>{
    const cmds = (h.match(/`([^`]+)`/g) || []).map(x=> x.slice(1,-1));
    const btns = cmds.map(c=> `<button class="cmd-run" data-cmd="${guidedAttrEsc(c)}">▶ ${escapeHtml(c)}</button>`).join('');
    let cmdsBlock = '';
    if(btns){
      cmdsBlock = redacted
        ? `<div class="gs-cmds gs-cmds-redacted"><button class="cmd-reveal">👁 Afficher la commande</button><div class="gs-cmds-hidden" hidden>${btns}</div></div>`
        : `<div class="gs-cmds">${btns}</div>`;
    }
    return `<div class="guided-step">
      <span class="gs-num">${k+1}</span>
      <div class="gs-body"><div class="gs-text">${fmtLessonText(h)}</div>${cmdsBlock}</div>
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
  clearMentorPanel();
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
  clearMentorPanel();

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
  } else if(game.procedural){
    phasePill.textContent = '🧬 SCÉNARIO GÉNÉRÉ';
    phasePill.className = 'phase-pill sandbox';
    progressTag.textContent = game.proceduralScenario ? game.proceduralScenario.category : '';
  } else if(game.custom){
    phasePill.textContent = '🛠️ SCÉNARIO ÉDITEUR';
    phasePill.className = 'phase-pill sandbox';
    progressTag.textContent = game.customScenario ? game.customScenario.title : '';
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
    const est = computeScore(game.history.length, game.hintIndex, elapsedSec, adaptiveFreeCommands());
    scoreEl.textContent = `🧮 ~${est} pts · ⌨ ${game.history.length}`;
  } else {
    scoreEl.textContent = `⌨ ${game.history.length} commande(s)`;
  }
  renderAdaptiveBadge();
}
window.renderScoreHud = renderScoreHud;

/* ---------- v2.2 : mentor contextuel ---------- */
function clearMentorPanel(){
  const el = document.getElementById('mentor-list');
  if(el) el.innerHTML = '';
}
function renderMentorTip(tip){
  const el = document.getElementById('mentor-list');
  if(!el) return;
  const d = document.createElement('div');
  d.className = 'mentor-tip';
  d.innerHTML = `<span class="mentor-tip-icon">🧑‍🏫</span><span>${escapeHtml(tip)}</span>`;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}
window.renderMentorTip = renderMentorTip;

/* ---------- v2.1 : badge de série sans indice ---------- */
function renderAdaptiveBadge(){
  const el = document.getElementById('hud-adaptive');
  if(!el) return;
  const n = adaptiveStreak();
  if(n <= 0){ el.textContent = ''; el.classList.remove('hot'); return; }
  const free = adaptiveFreeCommands();
  el.textContent = `🎯 ${n} sans indice · ${free} cmd gratuites`;
  el.classList.toggle('hot', n >= ADAPTIVE_THRESHOLD);
}
window.renderAdaptiveBadge = renderAdaptiveBadge;

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
  const scn = currentScenario();
  const diffHtml = renderDiffPanel(scn, game);
  setVerdict(`<div class="verdict-banner blocked">La configuration semble durcie. Tapez <b>replay</b> pour vérifier que l'attaque est désormais bloquée.</div>${diffHtml}`);
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
  if(cls === 'flagline') triggerFlagCelebration();
  if(game.transcript) game.transcript.push({text, cls: cls||'out', t: Date.now()});
}
function triggerFlagCelebration(){
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let overlay = document.getElementById('flag-flash-overlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id = 'flag-flash-overlay';
    document.body.appendChild(overlay);
  }
  overlay.classList.remove('play'); void overlay.offsetWidth; overlay.classList.add('play');
  const termWrap = document.querySelector('.term-wrap');
  if(termWrap){
    termWrap.classList.remove('flag-hit'); void termWrap.offsetWidth; termWrap.classList.add('flag-hit');
    setTimeout(()=> termWrap.classList.remove('flag-hit'), 450);
  }
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
  const hasTranscript = game.transcript && game.transcript.length > 1;
  const recapSnapshot = hasTranscript ? game.transcript.slice() : null;
  const recapLabel = (currentScenario() && currentScenario().title) || 'Session';
  overlay.innerHTML = `
    <div class="modal">
      <h2>${title}</h2>
      <p>${body}</p>
      ${scoreHtml}
      ${flag ? `<div class="flagbox">${flag}</div>` : ''}
      <div class="modal-actions">
        ${hasTranscript ? `<button class="ghost" id="modal-recap">🎬 Revoir la session</button>` : ''}
        <button class="ghost" id="modal-close">${closeLabel || 'Rester ici'}</button>
        <button class="solid-${flag? 'red':'blue'}" id="modal-primary">${primaryLabel}</button>
      </div>
    </div>`;
  document.getElementById('modal-root').appendChild(overlay);
  document.getElementById('modal-close').onclick = ()=>{ overlay.remove(); if(onClose) onClose(); };
  document.getElementById('modal-primary').onclick = ()=>{ overlay.remove(); onPrimary(); };
  if(hasTranscript){
    document.getElementById('modal-recap').onclick = ()=>{ overlay.remove(); openRecap(recapSnapshot, recapLabel); };
  }
}

/* ---------- Modale de fin de parcours complet (classement local) ---------- */

function showRunCompleteModal(){
  const total = totalScore();
  const totalTimeSec = totalPlayTimeSec();
  let lastName = '';
  try{ lastName = localStorage.getItem('redvsblue_last_name_v1') || ''; }catch(e){}
  const weak = strugglingScenarios(3);
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
      ${weak.length ? `<div class="modal-revanche-note">🔁 ${weak.length} scénario(s) résolu(s) avec beaucoup d'indices ou de temps (ex. « ${escapeHtml(weak[0].scenario.title)} ») — un mode revanche ciblé vous attend dans l'onglet Bilan.</div>` : ''}
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
    if(weak.length) switchHomeTab('bilan');
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

  const lbEl = document.getElementById('daily-leaderboard');
  if(lbEl){
    const rows = dailyLeaderboardWithPlayer(date);
    lbEl.innerHTML = `
      <div class="dlb-label">🏁 Classement du jour <span class="dlb-simulated">(simulé localement — pas de serveur partagé)</span></div>
      <div class="dlb-rows">
        ${rows.map((r,i)=>`<div class="dlb-row${r.you?' dlb-you':''}">
          <span class="dlb-rank">#${i+1}</span>
          <span class="dlb-name">${escapeHtml(r.name)}</span>
          <span class="dlb-time">${formatDuration(r.elapsedSec)}</span>
        </div>`).join('')}
      </div>`;
  }
}
window.renderDailyPanel = renderDailyPanel;

/* ---------- Mode revanche (v2.5) ---------- */
// Repère les scénarios déjà bouclés (attaque + défense) où le joueur a mis
// beaucoup de temps ou beaucoup d'indices — le score combiné (v0.4) capture
// déjà les deux à la fois, donc on l'utilise comme critère de faiblesse.
const REVANCHE_SCORE_THRESHOLD = 750; // sur 1000, score moyen des deux phases
function strugglingScenarios(limit){
  const rows = [];
  SCENARIOS.forEach((s,i)=>{
    const p = progress[s.id];
    if(!p || !p.attack || !p.defense) return;
    if(typeof p.scoreAttack !== 'number' || typeof p.scoreDefense !== 'number') return;
    const avgScore = (p.scoreAttack + p.scoreDefense) / 2;
    const hints = (p.hintsAttack||0) + (p.hintsDefense||0);
    if(avgScore < REVANCHE_SCORE_THRESHOLD || hints > 0){
      rows.push({index:i, scenario:s, avgScore, hints});
    }
  });
  rows.sort((a,b)=> a.avgScore - b.avgScore);
  return limit ? rows.slice(0, limit) : rows;
}

const SKILL_FAMILIES = [
  { name:'Privesc Linux', icon:'🐧', color:'var(--green)', ids:['suid-find','cron-writable','sudo-awk','ssh-key-exposed','capability-setuid-python','path-hijack-cron','passwd-world-writable','shadow-world-readable','sudo-ld-preload','systemd-unit-writable','tar-wildcard-injection','pwnkit-cve-2021-4034','capability-dac-read-search'] },
  { name:'Réseau & services', icon:'🌐', color:'var(--blue)', ids:['nfs-no-root-squash','dns-axfr','ldap-anonymous-bind','redis-unauthenticated','elasticsearch-unauthenticated','memcached-unauthenticated','smb-null-session','llmnr-nbtns-poisoning-hash-capture','ntlm-relay-smb-signing-disabled','snmp-default-community-string','rsync-anonymous-module-exposure'] },
  { name:'Web & API', icon:'🕸️', color:'var(--red)', ids:['git-directory-exposed','jwt-alg-none-forgery','log4shell-jndi-rce','python-pickle-deserialization','ssti-jinja2-flask','idor-invoice-api','mass-assignment-signup','excessive-data-exposure-api','missing-rate-limit-bruteforce','graphql-introspection-privilege-leak','cors-reflected-origin-credentials'] },
  { name:'Cloud & IaC', icon:'☁️', color:'var(--gold)', ids:['aws-imds-ssrf','s3-bucket-public','terraform-state-exposed','jenkins-script-console-open','iam-role-overpermissive','secret-in-public-repo','oauth-token-overscope','github-actions-secret-leak','dependency-confusion-pip','terraform-unpinned-module-supply-chain','cloud-secretsmanager-public-resource-policy'] },
  { name:'Conteneurs', icon:'📦', color:'var(--purple)', ids:['docker-socket-writable','k8s-privileged-hostpath','docker-registry-unauthenticated','k8s-rbac-clusterrolebinding-overpermissive','docker-pid-host-ptrace-injection','k8s-missing-networkpolicy-lateral-movement','k8s-etcd-unauthenticated','docker-cgroup-release-agent-escape','k8s-secret-env-plaintext-exec-exposure','docker-api-tcp-unauthenticated'] },
  { name:'Active Directory / Windows', icon:'🪟', color:'#7cb3ff', ids:['windows-unquoted-path','ad-asrep-roasting','ad-unconstrained-delegation','ad-dcsync-abuse','ad-gpo-writable','ad-kerberoasting-spn','ad-pass-the-hash-local-admin','ad-silver-ticket-forgery','ad-acl-genericall-privesc','ad-constrained-delegation-s4u2proxy-abuse','ad-gpp-cpassword-sysvol'] }
];

function familyStat(fam){
  let attacked=0, secured=0, phasesDone=0, phasesWithHint=0, timeSum=0, timeCount=0;
  fam.ids.forEach(id=>{
    const p = progress[id]; if(!p) return;
    if(p.attack) attacked++;
    if(p.attack && p.defense) secured++;
    if(p.attack){
      phasesDone++;
      if(p.hintsAttack) phasesWithHint++;
      if(typeof p.timeAttack === 'number'){ timeSum += p.timeAttack; timeCount++; }
    }
    if(p.defense){
      phasesDone++;
      if(p.hintsDefense) phasesWithHint++;
      if(typeof p.timeDefense === 'number'){ timeSum += p.timeDefense; timeCount++; }
    }
  });
  const total = fam.ids.length;
  return {
    total, attacked, secured,
    attackedPct: total?attacked/total:0, securedPct: total?secured/total:0,
    avgTimeSec: timeCount ? timeSum/timeCount : null,
    hintRate: phasesDone ? phasesWithHint/phasesDone : null
  };
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

function buildScoreCurve(){
  // Rassemble chaque phase notée (attaque ou défense) avec son horodatage.
  // Les sauvegardes antérieures à cet ajout n'ont pas de timestamp : on les
  // ignore proprement plutôt que de fausser l'ordre chronologique.
  const points = [];
  SCENARIOS.forEach(s=>{
    const p = progress[s.id]; if(!p) return;
    if(p.attack && typeof p.atAttack === 'number' && typeof p.scoreAttack === 'number'){
      points.push({at:p.atAttack, score:p.scoreAttack, label:s.title+' (attaque)'});
    }
    if(p.defense && typeof p.atDefense === 'number' && typeof p.scoreDefense === 'number'){
      points.push({at:p.atDefense, score:p.scoreDefense, label:s.title+' (défense)'});
    }
  });
  points.sort((a,b)=> a.at - b.at);

  if(points.length < 2){
    return `<div class="score-curve-empty">Pas encore assez de phases notées pour tracer une courbe — reviens ici après quelques scénarios.</div>`;
  }

  const W = 640, H = 170, padL = 34, padR = 14, padT = 14, padB = 24;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = points.length;
  const x = i => padL + (n===1 ? innerW/2 : (innerW * i/(n-1)));
  const y = v => padT + innerH - (Math.max(0,Math.min(1000,v))/1000)*innerH;

  const linePts = points.map((p,i)=> x(i).toFixed(1)+','+y(p.score).toFixed(1)).join(' ');
  const dots = points.map((p,i)=>
    `<circle class="score-curve-dot" cx="${x(i).toFixed(1)}" cy="${y(p.score).toFixed(1)}" r="3.2"><title>${escapeHtml(p.label)} — ${p.score} pts</title></circle>`
  ).join('');
  const gridLines = [0,250,500,750,1000].map(v=>
    `<line class="score-curve-grid" x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W-padR}" y2="${y(v).toFixed(1)}"/>`+
    `<text class="score-curve-axis" x="${padL-6}" y="${(y(v)+3).toFixed(1)}" text-anchor="end">${v}</text>`
  ).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="score-curve-svg" role="img" aria-label="Courbe de score dans le temps">
    ${gridLines}
    <polyline class="score-curve-line" points="${linePts}"/>
    ${dots}
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
    const timeTxt = st.avgTimeSec!==null ? formatDuration(st.avgTimeSec)+' en moyenne' : 'pas encore joué';
    const hintTxt = st.hintRate!==null ? Math.round(st.hintRate*100)+'% des phases avec indice' : '';
    return `<div class="dfam-card">
      <div class="dfam-head"><span class="dfam-icon">${f.icon}</span><span class="dfam-name">${f.name}</span><span class="dfam-rank" style="color:${f.color}">${rank(st.securedPct)}</span></div>
      <div class="dfam-bar"><div class="dfam-fill" style="width:${pct}%;background:${f.color}"></div></div>
      <div class="dfam-sub">${st.secured}/${st.total} sécurisés · ${st.attacked}/${st.total} compromis</div>
      <div class="dfam-sub dfam-sub-2">⏱ ${timeTxt}${hintTxt ? ' · 💡 '+hintTxt : ''}</div>
    </div>`;
  }).join('');

  const curveEl = document.getElementById('dash-score-curve');
  if(curveEl) curveEl.innerHTML = buildScoreCurve();

  renderRevanchePanel();
}

function renderRevanchePanel(){
  const el = document.getElementById('dash-revanche');
  if(!el) return;
  const rows = strugglingScenarios(5);
  if(!rows.length){
    el.innerHTML = `<div class="drev-empty">Aucun point faible identifié pour l'instant — les scénarios bouclés sans indice ni retard n'ont pas besoin de revanche.</div>`;
    return;
  }
  el.innerHTML = rows.map(r=>`
    <div class="drev-card">
      <div class="drev-info">
        <div class="drev-title">${escapeHtml(r.scenario.title)}</div>
        <div class="drev-meta">${escapeHtml(r.scenario.category)} · ${Math.round(r.avgScore)} pts en moyenne${r.hints>0 ? ' · '+r.hints+' indice(s) utilisé(s)' : ''}</div>
      </div>
      <div class="drev-actions">
        <button class="ghost drev-btn" data-revanche-attack="${r.index}" title="Rejoue la phase d'attaque en bac à sable, sans affecter le score enregistré">⚔️ Revanche attaque</button>
        <button class="ghost drev-btn" data-revanche-defense="${r.index}" title="Rejoue la phase de défense, sans affecter le score enregistré">🛡️ Revanche défense</button>
      </div>
    </div>`).join('');
  el.querySelectorAll('[data-revanche-attack]').forEach(btn=>{
    btn.addEventListener('click', ()=> startSandboxChallenge(parseInt(btn.dataset.revancheAttack,10)));
  });
  el.querySelectorAll('[data-revanche-defense]').forEach(btn=>{
    btn.addEventListener('click', ()=> startDefenseRevanche(parseInt(btn.dataset.revancheDefense,10)));
  });
}
window.renderRevanchePanel = renderRevanchePanel;
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
