/* =========================================================
   RED vs BLUE — v5.0 : mode Examen chronométré
   ---------------------------------------------------------
   Un lot de N systèmes tirés au hasard (sans doublon), à traiter
   entièrement (attaque PUIS défense sur chaque système, dans l'esprit
   du parcours principal) avant l'expiration d'un temps global —
   façon certification blanche. Mode strictement isolé de la
   progression principale, du bac à sable, de la faille du jour et du
   duel, sur le même principe qu'eux (nouveau champ `game.exam`,
   branche dédiée dans `checkAutoWin`, historique local séparé).
   ========================================================= */

const EXAM_KEY = 'redvsblue_exam_v1';

// Trois formats prédéfinis plutôt qu'un réglage libre : un temps par
// système généreux (~4-4.5 min) pour laisser la place aux deux phases
// (attaque + défense) sans transformer l'exercice en pur chrono-speedrun.
const EXAM_PRESETS = [
  {count:5,  minutes:20, label:'Rapide (5 systèmes)'},
  {count:8,  minutes:35, label:'Standard (8 systèmes)'},
  {count:12, minutes:55, label:'Complet (12 systèmes)'}
];

function loadExamHistory(){
  try{
    const raw = JSON.parse(localStorage.getItem(EXAM_KEY));
    if(Array.isArray(raw)) return raw;
  }catch(e){}
  return [];
}
function saveExamHistory(list){
  try{ localStorage.setItem(EXAM_KEY, JSON.stringify(list.slice(-20))); }catch(e){}
}

function pickExamSystems(count){
  const idxs = SCENARIOS.map((_, i)=> i);
  // Fisher-Yates : tirage sans remise parmi tous les scénarios, faille
  // du jour et bac à sable inclus (l'examen peut retomber sur un système
  // déjà résolu dans le parcours principal, ce n'est pas un problème
  // puisqu'il ne touche jamais `progress`).
  for(let i = idxs.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  return idxs.slice(0, Math.min(count, idxs.length));
}

let examTickInterval = null;

function startExam(presetIndex){
  const preset = EXAM_PRESETS[presetIndex] || EXAM_PRESETS[1];
  game.sandbox = false;
  game.daily = false;
  game.duel = null;
  game.procedural = false;
  game.custom = false;
  game.exam = {
    preset: preset.label,
    systems: pickExamSystems(preset.count),
    pos: 0,
    timeLimitSec: preset.minutes * 60,
    startTime: Date.now(),
    results: [],   // {idx, title, attackScore, attackHints, defenseScore, defenseHints}
    over: false
  };
  startPhase(game.exam.systems[0], 'attack');
  showScreen('game');
  document.getElementById('term-input').focus();
  if(examTickInterval) clearInterval(examTickInterval);
  examTickInterval = setInterval(examTick, 1000);
  examTick();
}
window.startExam = startExam;

function examRemainingSec(){
  if(!game.exam) return 0;
  const elapsed = (Date.now() - game.exam.startTime) / 1000;
  return Math.max(0, game.exam.timeLimitSec - elapsed);
}

function examTick(){
  if(!game.exam || game.exam.over){
    if(examTickInterval){ clearInterval(examTickInterval); examTickInterval = null; }
    return;
  }
  const remaining = examRemainingSec();
  const el = document.getElementById('hud-exam-timer');
  if(el){
    el.hidden = false;
    el.textContent = '⏳ ' + formatDuration(remaining);
    el.classList.toggle('low', remaining <= 60);
  }
  if(remaining <= 0) endExam(true);
}

function examSystemLabel(){
  if(!game.exam) return '';
  return `Système ${game.exam.pos + 1}/${game.exam.systems.length}`;
}

function completeExamAttack(){
  const scn = currentScenario();
  const elapsedSec = (Date.now() - game.phaseStartTime) / 1000;
  playSound('success');
  checkAchievements({hints: game.hintIndex, elapsedSec, phase:'attack'});
  game.exam.results.push({
    idx: game.exam.systems[game.exam.pos],
    title: scn.title,
    attackScore: computeScore(game.history.length, game.hintIndex, elapsedSec, adaptiveFreeCommands()),
    attackHints: game.hintIndex
  });
  renderTopbar();
  showModal({
    kind:'attack',
    title:'🚩 Système compromis — ' + examSystemLabel(),
    body:`Faille exploitée : « ${scn.title} ». Durcissez maintenant ce même système avant de passer au suivant — le chrono continue de tourner.`,
    flag: extractFlagFromLog(),
    primaryLabel:'Passer à la défense →',
    onPrimary(){ startPhase(game.exam.systems[game.exam.pos], 'defense'); }
  });
}

function completeExamDefense(){
  const scn = currentScenario();
  const elapsedSec = (Date.now() - game.phaseStartTime) / 1000;
  playSound('hardened');
  checkAchievements({hints: game.hintIndex, elapsedSec, phase:'defense'});
  const res = game.exam.results[game.exam.results.length - 1];
  res.defenseScore = computeScore(game.history.length, game.hintIndex, elapsedSec, adaptiveFreeCommands());
  res.defenseHints = game.hintIndex;

  const isLast = game.exam.pos >= game.exam.systems.length - 1;
  if(isLast){ endExam(false); return; }

  showModal({
    kind:'defense',
    title:'🛡️ Système durci — ' + examSystemLabel(),
    body:`Temps restant : ${formatDuration(examRemainingSec())}.`,
    flag: null,
    primaryLabel:'Système suivant →',
    onPrimary(){
      game.exam.pos++;
      startPhase(game.exam.systems[game.exam.pos], 'attack');
    }
  });
}

function endExam(timedOut){
  if(!game.exam || game.exam.over) return;
  game.exam.over = true;
  if(examTickInterval){ clearInterval(examTickInterval); examTickInterval = null; }
  const el = document.getElementById('hud-exam-timer');
  if(el) el.hidden = true;

  const results = game.exam.results;
  const totalScore = results.reduce((s, r)=> s + (r.attackScore||0) + (r.defenseScore||0), 0);
  const fullyDone = results.filter(r=> r.defenseScore !== undefined).length;
  const elapsedSec = (Date.now() - game.exam.startTime) / 1000;

  const entry = {
    date: new Date().toISOString(),
    preset: game.exam.preset,
    systems: game.exam.systems.length,
    solved: fullyDone,
    totalScore,
    elapsedSec: Math.round(elapsedSec),
    timedOut
  };
  const hist = loadExamHistory();
  hist.push(entry);
  saveExamHistory(hist);
  checkAchievements({exam:true, examTimedOut:timedOut, examFullyDone:fullyDone, examSystems:entry.systems});

  const verdict = timedOut
    ? `⏱️ Temps écoulé — ${fullyDone}/${results.length} système(s) entièrement traité(s) (attaque + défense) sur les ${game.exam.systems.length} prévus.`
    : `✅ Examen terminé dans les temps — les ${fullyDone} systèmes du format « ${game.exam.preset} » ont été traités.`;

  showModal({
    title: timedOut ? '⏱️ Examen — temps écoulé' : '⏱️ Examen terminé',
    body: `${verdict}<br><span class="chain-win-stat">🧮 Score cumulé : ${totalScore} pts · ⏱ ${formatDuration(elapsedSec)}</span>`,
    flag: null,
    primaryLabel:'Retour à l\u2019accueil',
    onPrimary(){ game.exam = null; goHome(); switchHomeTab('examen'); },
    closeLabel:'Rester dans le terminal',
    onClose(){}
  });
  if(window.renderExamPanel) renderExamPanel();
}

function abandonExam(){
  if(!game.exam) return;
  if(examTickInterval){ clearInterval(examTickInterval); examTickInterval = null; }
  const el = document.getElementById('hud-exam-timer');
  if(el) el.hidden = true;
  game.exam = null;
  goHome();
}
window.abandonExam = abandonExam;

/* ---------- Rendu de l'onglet Examen (écran d'accueil) ---------- */

function renderExamPanel(){
  const el = document.getElementById('exam-stats');
  if(!el) return;
  const hist = loadExamHistory();
  if(!hist.length){
    el.innerHTML = '<p class="sandbox-panel-desc">Aucune session d\u2019examen effectuée pour l\u2019instant.</p>';
    return;
  }
  const best = hist.reduce((b, h)=> (!b || h.totalScore > b.totalScore) ? h : b, null);
  el.innerHTML = `
    <div class="sandbox-stats">
      <div><b>${hist.length}</b> session(s) passée(s)</div>
      <div>🏅 meilleur score : <b>${best.totalScore} pts</b> (${escapeHtml(best.preset)}, ${best.solved}/${best.systems} systèmes)</div>
    </div>
    <table class="exam-history">
      <thead><tr><th>Date</th><th>Format</th><th>Résolus</th><th>Score</th><th>Durée</th><th>Statut</th></tr></thead>
      <tbody>
        ${hist.slice().reverse().slice(0, 10).map(h=>`
          <tr>
            <td>${new Date(h.date).toLocaleDateString()}</td>
            <td>${escapeHtml(h.preset)}</td>
            <td>${h.solved}/${h.systems}</td>
            <td>${h.totalScore}</td>
            <td>${formatDuration(h.elapsedSec)}</td>
            <td>${h.timedOut ? '⏱️ hors délai' : '✅ dans les temps'}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}
window.renderExamPanel = renderExamPanel;

/* ---------- Sidebar en jeu (remplace la liste de scénarios pendant l'examen) ---------- */

function renderExamSidebar(){
  const exam = game.exam;
  missionListEl.innerHTML = `
    <div class="sandbox-side exam-side">
      <div class="sandbox-side-title">⏱️ Examen — ${escapeHtml(exam.preset)}</div>
      <div class="sandbox-side-desc">${examSystemLabel()} · phase ${game.phase === 'attack' ? 'attaque' : 'défense'}. Le chrono global ne s'arrête jamais entre deux systèmes.</div>
      <div class="exam-steps">
        ${exam.systems.map((idx, i)=>{
          const st = i < exam.pos ? 'done' : (i === exam.pos ? 'current' : 'todo');
          const ic = st === 'done' ? '✓' : (st === 'current' ? '▶' : (i+1));
          return `<div class="chain-step ${st}"><span class="cs-ic">${ic}</span><span class="cs-tt">${escapeHtml(SCENARIOS[idx].title)}</span></div>`;
        }).join('')}
      </div>
      <button class="ghost" id="btn-exam-quit">← Abandonner l\u2019examen</button>
    </div>`;
  const q = document.getElementById('btn-exam-quit');
  if(q) q.onclick = ()=>{
    if(confirm('Abandonner cette session d\u2019examen ? Le résultat ne sera pas enregistré.')) abandonExam();
  };
}
window.renderExamSidebar = renderExamSidebar;
