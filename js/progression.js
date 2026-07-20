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
// Base 1000 points par phase, 3 commandes "gratuites", puis pénalités
// progressives par commande, par indice et par tranche de temps écoulée.
function computeScore(commands, hints, elapsedSec){
  let score = 1000;
  score -= Math.max(0, commands - 3) * 12;
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
  showModal({
    title: alreadyDone ? '🗓️ Entraînement — déjà résolu aujourd\'hui' : '🗓️ Faille du jour résolue !',
    body: alreadyDone
      ? `Vous aviez déjà validé la faille du ${date} en ${formatDuration(stats.history[date].elapsedSec)}. Cette tentative ne modifie pas votre série (elle sert juste à s'entraîner).`
      : `Faille du ${date} résolue en ${formatDuration(elapsedSec)} — « ${currentScenario().title} ». Série actuelle : ${stats.streak} jour${stats.streak>1?'s':''} consécutif${stats.streak>1?'s':''}.`,
    flag: extractFlagFromLog(),
    primaryLabel:'Fermer',
    closeLabel:'Retour à l\'accueil',
    onPrimary(){},
    onClose(){ goHome(); }
  });
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
  {id:'chain-master',    icon:'🔗', title:'Enchaîneur',              desc:"Terminer une chaîne d'attaque complète, du premier accès au root."}
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
