/* =========================================================
   RED vs BLUE — v0.9 : mode Face-à-face local (duel)
   Ce fichier n'agit que lorsque la page est chargée dans un
   iframe de duel (?mode=duel&side=red|blue&idx=N) ; sinon il
   ne fait rien. Aucune écriture dans la progression ou le
   classement principal : tout passe par postMessage vers la
   page parente duel.html.
   ========================================================= */

function completeDuelAttack(){
  const elapsedSec = (Date.now() - game.phaseStartTime) / 1000;
  playSound('success');
  const payload = {
    type: 'duel-finish',
    side: 'red',
    elapsedSec,
    title: currentScenario().title,
    flag: extractFlagFromLog()
  };
  try{ window.parent.postMessage(payload, window.location.origin); }catch(e){}
  showModal({
    kind:'attack',
    title:'🚩 Cible compromise !',
    body:`Vous avez exploité « ${currentScenario().title} » en ${Math.round(elapsedSec)} s. En attente du résultat du défenseur…`,
    flag: payload.flag,
    primaryLabel:'Fermer',
    onPrimary(){}
  });
}

function completeDuelDefense(){
  const elapsedSec = (Date.now() - game.phaseStartTime) / 1000;
  playSound('hardened');
  const payload = {
    type: 'duel-finish',
    side: 'blue',
    elapsedSec,
    title: currentScenario().title,
    flag: null
  };
  try{ window.parent.postMessage(payload, window.location.origin); }catch(e){}
  showModal({
    kind:'defense',
    title:'🛡️ Système durci !',
    body:`Vous avez corrigé « ${currentScenario().title} » en ${Math.round(elapsedSec)} s. En attente du résultat de l'attaquant…`,
    flag: null,
    primaryLabel:'Fermer',
    onPrimary(){}
  });
}

/* ---------- Bootstrap iframe duel ---------- */
(function(){
  const params = new URLSearchParams(window.location.search);
  if(params.get('mode') !== 'duel') return;

  const side = params.get('side') === 'blue' ? 'blue' : 'red';
  const idx = Math.max(0, parseInt(params.get('idx'), 10) || 0);
  game.duel = side;

  function showWaitOverlay(){
    const wait = document.createElement('div');
    wait.id = 'duel-wait-overlay';
    wait.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;'
      +'justify-content:center;background:#0b0e13;color:#eef3f8;font-family:inherit;'
      +'font-size:16px;line-height:1.6;text-align:center;padding:24px;';
    wait.innerHTML = (side === 'red')
      ? '🔴 <b>Poste attaquant</b><br>Prêt — en attente du top départ…'
      : '🔵 <b>Poste défenseur</b><br>Prêt — en attente du top départ…';
    document.body.appendChild(wait);
  }

  const boot = document.getElementById('boot-intro');
  if(boot) boot.style.display = 'none';
  showWaitOverlay();

  window.addEventListener('message', (e)=>{
    if(e.origin !== window.location.origin) return;
    if(!e.data || e.data.type !== 'duel-start') return;
    const overlay = document.getElementById('duel-wait-overlay');
    if(overlay) overlay.remove();
    startPhase(idx, side === 'red' ? 'attack' : 'defense');
    showScreen('game');
    const input = document.getElementById('term-input');
    if(input) input.focus();
  });

  window.addEventListener('load', ()=>{
    try{ window.parent.postMessage({type:'duel-ready', side}, window.location.origin); }catch(e){}
  });
})();
