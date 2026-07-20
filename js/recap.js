/* =========================================================
   RED vs BLUE — v1.3 : récap cinématique de session
   Rejoue la timeline des lignes de terminal enregistrées
   pendant une phase (attaque, défense, bac à sable, duel,
   faille du jour, chaîne...) et permet de l'exporter en un
   fichier HTML autonome — pas de dépendance externe, pas de
   génération de GIF/vidéo (hors contrainte du projet), mais
   un fichier qui se rejoue tout seul, à ouvrir n'importe où.
   ========================================================= */

let recapState = null;

function openRecap(lines, label){
  recapState = { lines: lines || [], idx: 0, playing: true, speed: 2, timer: null, label: label || 'Session' };

  const titleEl = document.getElementById('recap-title');
  const hostEl = document.getElementById('recap-host');
  const bodyEl = document.getElementById('recap-body');
  const scrubber = document.getElementById('recap-scrubber');
  const playPauseBtn = document.getElementById('btn-recap-playpause');
  if(!titleEl || !bodyEl) return;

  titleEl.textContent = '🎬 ' + recapState.label;
  hostEl.textContent = 'target-lab — session enregistrée : ' + recapState.label;
  bodyEl.innerHTML = '';
  scrubber.max = Math.max(0, recapState.lines.length - 1);
  scrubber.value = 0;
  playPauseBtn.textContent = '⏸';
  updateRecapProgress();
  showScreen('recap');
  scheduleNextRecapLine();
}
window.openRecap = openRecap;

function delayForRecapLine(line){
  const base = (line.cls === 'prompt-line') ? 550 : 110;
  return base / (recapState.speed || 1);
}

function appendRecapLine(line){
  const body = document.getElementById('recap-body');
  const div = document.createElement('div');
  div.className = 'line ' + line.cls;
  div.textContent = line.text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
}

function updateRecapProgress(){
  const label = document.getElementById('recap-progress-label');
  if(label) label.textContent = `${recapState.idx} / ${recapState.lines.length}`;
}

function scheduleNextRecapLine(){
  if(!recapState) return;
  clearTimeout(recapState.timer);
  if(!recapState.playing) return;
  if(recapState.idx >= recapState.lines.length){
    recapState.playing = false;
    const btn = document.getElementById('btn-recap-playpause');
    if(btn) btn.textContent = '⟲';
    return;
  }
  const line = recapState.lines[recapState.idx];
  appendRecapLine(line);
  recapState.idx++;
  const scrubber = document.getElementById('recap-scrubber');
  if(scrubber) scrubber.value = recapState.idx - 1;
  updateRecapProgress();
  recapState.timer = setTimeout(scheduleNextRecapLine, delayForRecapLine(line));
}

function rebuildRecapUpTo(targetIdx){
  if(!recapState) return;
  clearTimeout(recapState.timer);
  const body = document.getElementById('recap-body');
  body.innerHTML = '';
  for(let i=0; i<targetIdx; i++) appendRecapLine(recapState.lines[i]);
  recapState.idx = targetIdx;
  updateRecapProgress();
}

/* ---------- Export en fichier HTML autonome ---------- */
function downloadRecapHtml(lines, label){
  const safeLabel = String(label).replace(/[^a-zA-Z0-9 _-]/g,'').trim().slice(0,60) || 'session';
  const json = JSON.stringify(lines);
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<title>Récap — ${safeLabel}</title>
<style>
  body{background:#000;color:#c9d3de;font-family:ui-monospace,"Cascadia Code","Fira Code",Consolas,monospace;margin:0;padding:28px;}
  #wrap{max-width:900px;margin:0 auto;}
  #head{font-size:13px;color:#5f6c7d;margin-bottom:14px;}
  #term{border:1px solid #1c2430;border-radius:8px;padding:14px;background:#000;min-height:240px;font-size:13px;line-height:1.6;}
  .line{white-space:pre-wrap;word-break:break-word;}
  .out{color:#c9d3de;} .err{color:#ff3b5c;} .ok{color:#3ddc84;} .info{color:#22d3ee;}
  .flagline{color:#eab308;font-weight:700;} .prompt-line{color:#5f6c7d;}
  #controls{margin-top:14px;display:flex;gap:10px;align-items:center;font-size:13px;}
  button{background:#11161e;color:#c9d3de;border:1px solid #1c2430;border-radius:6px;padding:6px 14px;cursor:pointer;font:inherit;}
  button:hover{border-color:#eab308;color:#eab308;}
</style></head>
<body><div id="wrap">
  <div id="head">🎬 Récap RED vs BLUE — ${safeLabel}</div>
  <div id="term"></div>
  <div id="controls"><button id="pp">⏸</button><button id="rs">⟲ Depuis le début</button></div>
</div>
<script>
const LINES = ${json};
let idx = 0, playing = true, timer = null;
const term = document.getElementById('term');
function esc(s){ return s; }
function append(l){ const d=document.createElement('div'); d.className='line '+l.cls; d.textContent=l.text; term.appendChild(d); term.scrollTop=term.scrollHeight; }
function delay(l){ return (l.cls==='prompt-line') ? 275 : 55; }
function next(){
  if(!playing) return;
  if(idx>=LINES.length){ playing=false; document.getElementById('pp').textContent='⟲'; return; }
  append(LINES[idx]); const d = delay(LINES[idx]); idx++;
  timer=setTimeout(next, d);
}
document.getElementById('pp').addEventListener('click', ()=>{
  if(idx>=LINES.length && !playing){ term.innerHTML=''; idx=0; playing=true; document.getElementById('pp').textContent='⏸'; next(); return; }
  playing=!playing; document.getElementById('pp').textContent = playing?'⏸':'▶';
  if(playing) next(); else clearTimeout(timer);
});
document.getElementById('rs').addEventListener('click', ()=>{
  clearTimeout(timer); term.innerHTML=''; idx=0; playing=true; document.getElementById('pp').textContent='⏸'; next();
});
next();
</script>
</body></html>`;
  const blob = new Blob([html], {type:'text/html'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'redvsblue-recap-' + safeLabel.toLowerCase().replace(/\s+/g,'-') + '.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 2000);
}

document.addEventListener('DOMContentLoaded', ()=>{
  const backBtn = document.getElementById('btn-recap-back');
  const playPauseBtn = document.getElementById('btn-recap-playpause');
  const restartBtn = document.getElementById('btn-recap-restart');
  const speedSel = document.getElementById('recap-speed');
  const scrubber = document.getElementById('recap-scrubber');
  const downloadBtn = document.getElementById('btn-recap-download');
  if(!backBtn) return;

  backBtn.addEventListener('click', ()=>{
    if(recapState) clearTimeout(recapState.timer);
    goHome();
  });

  playPauseBtn.addEventListener('click', ()=>{
    if(!recapState) return;
    if(recapState.idx >= recapState.lines.length && !recapState.playing){
      rebuildRecapUpTo(0);
      recapState.playing = true;
      playPauseBtn.textContent = '⏸';
      scheduleNextRecapLine();
      return;
    }
    recapState.playing = !recapState.playing;
    playPauseBtn.textContent = recapState.playing ? '⏸' : '▶';
    if(recapState.playing) scheduleNextRecapLine();
    else clearTimeout(recapState.timer);
  });

  restartBtn.addEventListener('click', ()=>{
    if(!recapState) return;
    rebuildRecapUpTo(0);
    recapState.playing = true;
    playPauseBtn.textContent = '⏸';
    scheduleNextRecapLine();
  });

  speedSel.addEventListener('change', ()=>{
    if(recapState) recapState.speed = parseFloat(speedSel.value) || 1;
  });

  scrubber.addEventListener('input', ()=>{
    if(!recapState) return;
    recapState.playing = false;
    playPauseBtn.textContent = '▶';
    clearTimeout(recapState.timer);
    rebuildRecapUpTo(parseInt(scrubber.value, 10) + 1);
  });

  downloadBtn.addEventListener('click', ()=>{
    if(recapState) downloadRecapHtml(recapState.lines, recapState.label);
  });
});
