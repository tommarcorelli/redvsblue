/* =========================================================
   RED vs BLUE — v2.0 : éditeur de scénario personnalisé
   Permet de créer un système (fichiers/dossiers + un objectif
   attaque « trouver un drapeau » + un objectif défense
   « corriger une permission ») sans toucher au code. Sauvegardé
   en localStorage, exportable/importable en JSON. Mode de test
   isolé de la progression principale (game.custom).
   ========================================================= */

const CUSTOM_KEY = 'redvsblue_custom_scenarios_v1';

function loadCustomScenarios(){
  try{
    const raw = localStorage.getItem(CUSTOM_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}
function saveCustomScenarios(list){
  try{ localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); }catch(e){}
}

/* ---------- Construction du scénario jouable à partir d'une définition ---------- */
function materializeCustomScenario(def){
  return {
    title: def.title,
    category: 'Éditeur',
    startUserAttack: 'invite', startCwdAttack: '/home/invite',
    makeVfs(){
      const entries = def.entries.slice();
      if(!entries.some(e=> e.path === '/home/invite')){
        entries.push({path:'/home/invite', type:'dir', perm:'750', owner:'invite'});
      }
      return buildVfsFromEntries(entries);
    },
    attackCheck: attackCheckFlagRevealed(def.flagContent),
    defenseCheck: defenseCheckPermission(def.fixPath, def.fixPerm),
    attack:{
      who:'Vous incarnez invite, un utilisateur standard sans privilège particulier.',
      desc: def.intro,
      hints:[
        "Explorez l'arborescence avec `ls` et `cat` pour trouver le fichier contenant le drapeau.",
        `Le drapeau se trouve dans : ${def.flagPath}`
      ]
    },
    defense:{
      who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
      desc: def.intro,
      hints:[
        `Corrigez les permissions de ${def.fixPath} (permission cible : ${def.fixPerm}).`,
        `\`chmod ${def.fixPerm} ${def.fixPath}\``
      ]
    }
  };
}

function startCustomScenario(def, phase){
  game.customScenario = materializeCustomScenario(def);
  game.custom = true;
  game.procedural = false;
  game.sandbox = false;
  game.daily = false;
  applyScenarioState(game.customScenario, phase || 'attack');
  showScreen('game');
  const input = document.getElementById('term-input');
  if(input) input.focus();
}

function completeCustomAttack(){
  const elapsedSec = (Date.now() - game.phaseStartTime) / 1000;
  playSound('success');
  checkAchievements({hints: game.hintIndex, elapsedSec, phase:'attack', custom:true});
  const def = game.customDef;
  showModal({
    title:'🛠️ Drapeau capturé !',
    body:`« ${game.customScenario.title} » résolu en ${formatDuration(elapsedSec)}.`,
    flag: extractFlagFromLog(),
    primaryLabel: def ? 'Tester la défense →' : 'Fermer',
    closeLabel:'Retour à l\'éditeur',
    onPrimary(){ if(def) startCustomScenario(def, 'defense'); },
    onClose(){ goHome(); switchHomeTab('editeur'); }
  });
}

function completeCustomDefense(){
  const elapsedSec = (Date.now() - game.phaseStartTime) / 1000;
  playSound('hardened');
  checkAchievements({hints: game.hintIndex, elapsedSec, phase:'defense', custom:true});
  showModal({
    title:'🛠️ Correctif validé !',
    body:`« ${game.customScenario.title} » sécurisé en ${formatDuration(elapsedSec)}.`,
    primaryLabel:'Retour à l\'éditeur',
    closeLabel:'Accueil',
    onPrimary(){ goHome(); switchHomeTab('editeur'); },
    onClose(){ goHome(); }
  });
}

/* ---------- Interface : lignes de fichiers dynamiques ---------- */
function newEditorFileRow(container, values){
  values = values || {};
  const row = document.createElement('div');
  row.className = 'editor-file-row';
  row.innerHTML = `
    <input class="ef-path" type="text" placeholder="/chemin/du/fichier" value="${values.path ? escapeAttr(values.path) : ''}">
    <select class="ef-type">
      <option value="file" ${values.type!=='dir'?'selected':''}>fichier</option>
      <option value="dir" ${values.type==='dir'?'selected':''}>dossier</option>
    </select>
    <input class="ef-perm" type="text" placeholder="perm (644)" value="${values.perm ? escapeAttr(values.perm) : ''}">
    <input class="ef-owner" type="text" placeholder="propriétaire" value="${values.owner ? escapeAttr(values.owner) : ''}">
    <input class="ef-content" type="text" placeholder="contenu (fichiers uniquement)" value="${values.content ? escapeAttr(values.content) : ''}">
    <button type="button" class="ef-remove" title="Retirer cette ligne">✕</button>
  `;
  row.querySelector('.ef-remove').addEventListener('click', ()=> row.remove());
  container.appendChild(row);
}

function escapeAttr(s){
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

function readEditorFileRows(){
  return Array.from(document.querySelectorAll('#editor-files .editor-file-row')).map(row=>{
    const path = row.querySelector('.ef-path').value.trim();
    const type = row.querySelector('.ef-type').value;
    const perm = row.querySelector('.ef-perm').value.trim();
    const owner = row.querySelector('.ef-owner').value.trim();
    const content = row.querySelector('.ef-content').value;
    return {path, type, perm: perm || undefined, owner: owner || undefined, content: type==='dir' ? undefined : content};
  }).filter(e=> e.path);
}

/* ---------- Rendu de la liste des scénarios enregistrés ---------- */
function renderEditorList(){
  const list = document.getElementById('editor-list');
  if(!list) return;
  const scenarios = loadCustomScenarios();
  if(scenarios.length === 0){
    list.innerHTML = '<div class="editor-empty">Aucun scénario enregistré pour l\'instant.</div>';
    return;
  }
  list.innerHTML = '';
  scenarios.forEach(def=>{
    const card = document.createElement('div');
    card.className = 'editor-card';
    card.innerHTML = `
      <div>
        <div class="editor-card-title">${escapeAttr(def.title)}</div>
        <div class="editor-card-desc">${escapeAttr(def.intro)}</div>
      </div>
      <div class="editor-card-actions">
        <button class="ec-attack">▶ Attaque</button>
        <button class="ec-defense">🛡️ Défense</button>
        <button class="ec-delete">🗑️</button>
      </div>
    `;
    card.querySelector('.ec-attack').addEventListener('click', ()=>{ game.customDef = def; startCustomScenario(def, 'attack'); });
    card.querySelector('.ec-defense').addEventListener('click', ()=>{ game.customDef = def; startCustomScenario(def, 'defense'); });
    card.querySelector('.ec-delete').addEventListener('click', ()=>{
      if(!confirm(`Supprimer « ${def.title} » ?`)) return;
      saveCustomScenarios(loadCustomScenarios().filter(d=> d.id !== def.id));
      renderEditorList();
    });
    list.appendChild(card);
  });
}

/* ---------- Câblage du formulaire ---------- */
(function(){
  const filesContainer = document.getElementById('editor-files');
  const addBtn = document.getElementById('ed-add-file');
  const form = document.getElementById('editor-form');
  const exportBtn = document.getElementById('ed-export-btn');
  const importInput = document.getElementById('ed-import-input');
  if(!form) return; // pas sur cette page

  newEditorFileRow(filesContainer, {path:'/var/backups/config.bak', type:'file', perm:'644', owner:'root', content:'service_password=hunter2\nFLAG{exemple_a_remplacer}'});

  addBtn.addEventListener('click', ()=> newEditorFileRow(filesContainer));

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const title = document.getElementById('ed-title').value.trim();
    const intro = document.getElementById('ed-intro').value.trim();
    const flagPath = document.getElementById('ed-flag-path').value.trim();
    const flagContent = document.getElementById('ed-flag-content').value.trim();
    const fixPath = document.getElementById('ed-fix-path').value.trim();
    const fixPerm = document.getElementById('ed-fix-perm').value.trim();
    const entries = readEditorFileRows();

    if(!title || !intro || !flagPath || !flagContent || !fixPath || !fixPerm || entries.length === 0){
      alert('Merci de remplir tous les champs et d\'ajouter au moins un fichier.');
      return;
    }
    if(!entries.some(en=> en.path === flagPath)){
      alert(`Le chemin du drapeau (${flagPath}) doit correspondre à un fichier listé dans le système de fichiers.`);
      return;
    }
    if(!entries.some(en=> en.path === fixPath)){
      alert(`Le chemin à corriger (${fixPath}) doit correspondre à un fichier ou dossier listé dans le système de fichiers.`);
      return;
    }

    const def = {
      id: 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2,7),
      title, intro, flagPath, flagContent, fixPath, fixPerm, entries
    };
    const list = loadCustomScenarios();
    list.push(def);
    saveCustomScenarios(list);
    renderEditorList();
    form.reset();
    filesContainer.innerHTML = '';
    newEditorFileRow(filesContainer);
  });

  exportBtn.addEventListener('click', ()=>{
    const data = JSON.stringify(loadCustomScenarios(), null, 2);
    const blob = new Blob([data], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'redvsblue-scenarios.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  importInput.addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const imported = JSON.parse(reader.result);
        if(!Array.isArray(imported)) throw new Error('format invalide');
        const existing = loadCustomScenarios();
        const merged = existing.concat(imported.map(d=> ({...d, id: d.id || ('custom-'+Date.now().toString(36)+Math.random().toString(36).slice(2,7))})));
        saveCustomScenarios(merged);
        renderEditorList();
      }catch(err){
        alert('Fichier JSON invalide.');
      }
      importInput.value = '';
    };
    reader.readAsText(file);
  });

  renderEditorList();
})();
