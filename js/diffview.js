/* ===================================================================
   Vue diff avant/après correctif — RED vs BLUE
   ---------------------------------------------------------------
   Compare l'état initial vulnérable (obtenu en rappelant scn.makeVfs(),
   pure et déterministe) à l'état courant du système de fichiers simulé
   (game.vfs), fichier par fichier, et affiche un diff ligne à ligne de
   ce que le joueur a réellement changé — qu'il ait ou non déjà corrigé
   la faille. Aucune dépendance sur scenarios.js au-delà de son API
   déjà publique (makeVfs), donc aucun risque de régression sur les
   67 scénarios existants.
   =================================================================== */

/* Diff ligne à ligne par plus longue sous-séquence commune (LCS).
   Les fichiers de configuration manipulés dans le jeu font quelques
   dizaines de lignes au plus : un LCS classique en O(n·m) est largement
   suffisant, pas besoin d'un algorithme de diff plus sophistiqué. */
function diffLines(beforeText, afterText){
  const a = String(beforeText).split('\n');
  const b = String(afterText).split('\n');
  const n = a.length, m = b.length;
  const dp = Array.from({length:n+1}, ()=> new Array(m+1).fill(0));
  for(let i=n-1;i>=0;i--){
    for(let j=m-1;j>=0;j--){
      dp[i][j] = (a[i]===b[j]) ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
    }
  }
  const out = [];
  let i=0, j=0;
  while(i<n && j<m){
    if(a[i]===b[j]){ out.push({type:'eq', text:a[i]}); i++; j++; }
    else if(dp[i+1][j] >= dp[i][j+1]){ out.push({type:'del', text:a[i]}); i++; }
    else { out.push({type:'add', text:b[j]}); j++; }
  }
  while(i<n){ out.push({type:'del', text:a[i]}); i++; }
  while(j<m){ out.push({type:'add', text:b[j]}); j++; }
  return out;
}

/* Compare deux systèmes de fichiers simulés et renvoie la liste des
   fichiers dont le contenu diffère (uniquement les fichiers présents
   dans les deux — la quasi-totalité des scénarios ne fait que modifier
   un fichier de configuration existant, jamais en créer ou supprimer). */
function computeVfsDiff(beforeVfs, afterVfs){
  const paths = Object.keys(afterVfs);
  const changed = [];
  paths.forEach(path=>{
    const b = beforeVfs[path], a = afterVfs[path];
    if(!b || !a) return;
    if(b.type !== 'file' || a.type !== 'file') return;
    if(b.content !== a.content){
      changed.push({path, before:b.content, after:a.content});
    }
  });
  changed.sort((x,y)=> x.path.localeCompare(y.path));
  return changed;
}

/* Construit le panneau HTML (repliable) à injecter dans le DOM.
   Renvoie une chaîne vide si rien n'a encore été modifié — pas de
   panneau vide affiché. */
function renderDiffPanel(scn, game){
  let before;
  try{ before = scn.makeVfs(); }catch(e){ return ''; }
  const changed = computeVfsDiff(before, game.vfs);
  if(changed.length === 0) return '';

  const blocks = changed.map(ch=>{
    const rows = diffLines(ch.before, ch.after).map(l=>{
      const cls = l.type==='add' ? 'diff-add' : l.type==='del' ? 'diff-del' : 'diff-eq';
      const marker = l.type==='add' ? '+' : l.type==='del' ? '-' : '\u00a0';
      return `<div class="diff-row ${cls}"><span class="diff-marker">${marker}</span><span class="diff-text">${escapeHtml(l.text)}</span></div>`;
    }).join('');
    return `<div class="diff-file"><div class="diff-file-path">${escapeHtml(ch.path)}</div><div class="diff-body">${rows}</div></div>`;
  }).join('');

  const n = changed.length;
  return `<details class="diff-panel">
    <summary>🔍 Voir ce que vous avez changé (${n} fichier${n>1?'s':''})</summary>
    ${blocks}
  </details>`;
}
