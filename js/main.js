/* =========================================================
   RED vs BLUE — initialisation
   ========================================================= */

document.getElementById('btn-continue').addEventListener('click', ()=>{
  const start = findFirstAvailable();
  openBriefing(start.index, start.phase);
});

document.getElementById('btn-reset-all').addEventListener('click', ()=>{
  if(confirm('Réinitialiser toute la progression ? Cette action est irréversible.')){
    resetProgress();
    renderHome();
  }
});

document.getElementById('btn-briefing-back').addEventListener('click', goHome);
document.getElementById('btn-briefing-launch').addEventListener('click', launchGame);

document.getElementById('brand-home-link').addEventListener('click', goHome);
document.getElementById('btn-menu').addEventListener('click', goHome);

/* ---------- Onglets de l'écran d'accueil ---------- */
document.querySelectorAll('.home-tab').forEach(btn=>{
  btn.addEventListener('click', ()=> switchHomeTab(btn.dataset.tab));
});
document.getElementById('home-nav-brand').addEventListener('click', ()=> switchHomeTab('accueil'));

document.getElementById('btn-hint').addEventListener('click', ()=>{
  const hints = game.chain
    ? game.chain.stages[game.chainStage].hints
    : currentScenario()[game.phase].hints;
  if(game.hintIndex < hints.length){
    game.hintIndex++;
    playSound('hint');
    breakAdaptiveStreak(); // v2.1 : demander un indice interrompt la série "sans filet"
    renderObjective();
    renderScoreHud();
  }
});

/* ---------- v2.2 : mentor contextuel ---------- */
document.getElementById('btn-mentor').addEventListener('click', ()=>{
  const scn = currentScenario();
  const tip = nextMentorTip(scn, game.phase, game.mentorIndex);
  game.mentorIndex++;
  playSound('hint');
  renderMentorTip(tip);
});

document.getElementById('btn-reset-scn').addEventListener('click', ()=>{
  if(game.chain) startChain(game.chainIndex);
  else startPhase(game.scenarioIndex, game.phase);
});

/* ---------- Mode guidé : toggle + insertion de commande ---------- */
document.getElementById('btn-guided').addEventListener('click', ()=>{
  game.guided = !game.guided;
  renderObjective();
});
document.getElementById('guided-panel').addEventListener('click', (e)=>{
  const reveal = e.target.closest('.cmd-reveal');
  if(reveal){
    // v2.1 : révèle la commande repliée d'une étape guidée, une fois demandé explicitement
    const wrap = reveal.closest('.gs-cmds-redacted');
    const hidden = wrap && wrap.querySelector('.gs-cmds-hidden');
    if(hidden){ hidden.hidden = false; }
    reveal.remove();
    return;
  }
  const btn = e.target.closest('.cmd-run');
  if(!btn) return;
  termInput.value = btn.dataset.cmd;
  termInput.focus();
});

/* ---------- v0.7 : bac à sable ---------- */
document.getElementById('btn-sandbox').addEventListener('click', ()=> startSandboxChallenge());
document.getElementById('btn-daily').addEventListener('click', ()=> startDailyChallenge());
document.getElementById('btn-procedural').addEventListener('click', ()=> startProceduralChallenge());

/* ---------- v0.5 : rapport de session ---------- */
document.getElementById('btn-session-report').addEventListener('click', downloadSessionReport);

/* ---------- v0.4 : classement local ---------- */
document.getElementById('btn-export-leaderboard').addEventListener('click', exportLeaderboard);
document.getElementById('btn-clear-leaderboard').addEventListener('click', ()=>{
  if(confirm('Effacer tout le classement local ? Cette action est irréversible.')){
    clearLeaderboard();
    renderLeaderboard();
  }
});

/* ---------- bonus : ambiance sonore ---------- */
function toggleSound(){
  setSoundEnabled(!isSoundEnabled());
  updateSoundToggleUI();
  if(isSoundEnabled()) playSound('hint');
}
document.getElementById('btn-sound-toggle').addEventListener('click', toggleSound);
document.getElementById('btn-sound-toggle-home').addEventListener('click', toggleSound);
updateSoundToggleUI();

/* ---------- bonus : HUD score/chrono en temps réel ---------- */
setInterval(()=>{
  const gameScreen = document.getElementById('screen-game');
  if(gameScreen && gameScreen.classList.contains('active') && game.vfs){
    renderScoreHud();
  }
}, 1000);

/* ---------- v1.1 : sélecteur de thème ---------- */
const THEME_KEY = 'redvsblue_theme_v1';
function applyTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  try{ localStorage.setItem(THEME_KEY, t); }catch(e){}
  document.querySelectorAll('.theme-btn').forEach(b=> b.classList.toggle('active', b.dataset.themeChoice === t));
}
document.querySelectorAll('.theme-btn').forEach(b=>{
  b.addEventListener('click', ()=> applyTheme(b.dataset.themeChoice));
});
applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');

let historyPointer = null;
termInput.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    const val = termInput.value;
    termInput.value = '';
    historyPointer = null;
    runCommand(val);
  } else if(e.key === 'ArrowUp'){
    if(!game.history.length) return;
    e.preventDefault();
    historyPointer = (historyPointer===null) ? game.history.length-1 : Math.max(0, historyPointer-1);
    termInput.value = game.history[historyPointer] || '';
  } else if(e.key === 'ArrowDown'){
    if(historyPointer===null) return;
    e.preventDefault();
    historyPointer++;
    if(historyPointer >= game.history.length){ historyPointer = null; termInput.value = ''; }
    else { termInput.value = game.history[historyPointer]; }
  }
});

/* ---------- Service worker (PWA installable / hors-ligne) ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{ /* pas de HTTPS/localhost : ignoré */ });
  });
}

/* ---------- Démarrage sur l'écran d'accueil ---------- */
goHome();
