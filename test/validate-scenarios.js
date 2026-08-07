#!/usr/bin/env node
/* =========================================================================
   RED vs BLUE — validate-scenarios.js (v5.4)
   -------------------------------------------------------------------------
   Formalise en un vrai script les vérifications refaites à la main, dans
   /tmp, à chaque ajout de scénario depuis la v5.1 (packs Active Directory,
   Applications web, Mobile & API embarquées). Zéro dépendance : uniquement
   les modules `vm`, `fs` et `path` du cœur de Node, cohérent avec la
   philosophie « aucun build, aucun paquet » du reste du projet.

   Usage :
     node test/validate-scenarios.js
     npm test            (si le script est câblé dans package.json)

   Sortie : code de sortie 0 si tout est vert, 1 si au moins une vérification
   CRITIQUE échoue (structure cassée, cohérence des ids, invariant d'état
   initial violé). Les scénarios que le solveur générique ne parvient pas à
   résoudre automatiquement à partir des indices sont signalés en
   AVERTISSEMENT, pas en échec : cela peut être un vrai bug (une commande
   citée dans un indice ne correspond à aucune règle d'exploit) ou simplement
   une formulation d'indice qui rend l'extraction automatique impossible —
   dans les deux cas, ça mérite une relecture humaine, mais ça ne bloque pas
   le déploiement.

   Ce que ce script vérifie, et ce qu'il NE vérifie PAS :
     ✅ Chaque id de SCENARIOS est unique, non vide, et présent dans
        NETWORK_CLUSTERS, SKILL_FAMILIES et FACTSHEET_META — sans orphelin
        dans l'autre sens (un id qui existerait dans ces bases mais plus
        dans SCENARIOS, par exemple après un renommage).
     ✅ makeVfs() produit un système de fichiers simulé cohérent : la racine
        existe, chaque dossier ne référence que des enfants qui existent
        réellement, et chaque chemin (hors racine) est bien référencé par
        son parent — un aller-retour complet, dans les deux sens.
     ✅ attackCheck/defenseCheck/replay ont la bonne forme (fonctions,
        booléen, {log:Array, success:Boolean}).
     ✅ Invariant d'état initial : sur un `makeVfs()` fraîchement généré
        (jamais modifié), `defenseCheck` doit être faux, `replay` doit
        réussir, et `attackCheck` doit être faux tant qu'aucune règle
        d'exploit n'a été jouée. Un scénario qui naît déjà « corrigé »
        serait injouable.
     ✅ Solveur générique best-effort : extrait les commandes entre
        backticks des indices d'attaque, les rejoue dans l'ordre contre les
        `exploitRules`, et vérifie que `attackCheck` devient vrai — exactement
        ce qu'un joueur qui suit les indices à la lettre obtiendrait.
     ❌ Ne vérifie PAS que le correctif de défense décrit en prose dans
        `defense.hints` correspond exactement à ce que `defenseCheck` teste
        (cette partie reste éditée à la main dans `engine.js` via `nano`,
        hors de portée d'une simulation `vm` sans DOM) — seule l'invariant
        « état initial non corrigé » est vérifié automatiquement.
     ❌ Ne vérifie PAS le rendu visuel, l'accessibilité, ni aucun fichier
        HTML/CSS — uniquement la logique pure de `scenarios.js` et sa
        cohérence avec les fichiers de métadonnées qui en dépendent.
   ========================================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const RESET = '\x1b[0m', RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', BOLD = '\x1b[1m';

let failures = 0;
let warnings = 0;

function fail(msg){ failures++; console.log(`${RED}✗ ${msg}${RESET}`); }
function warn(msg){ warnings++; console.log(`${YELLOW}⚠ ${msg}${RESET}`); }
function ok(msg){ console.log(`${GREEN}✓ ${msg}${RESET}`); }
function section(title){ console.log(`\n${BOLD}${title}${RESET}`); }

/* ---------- Chargement des fichiers testés dans un bac à sable Node ---------- */
// On exécute les fichiers concernés dans un même contexte `vm`, en simulant
// juste assez de globals (`window`) pour que les scripts non-module
// s'exécutent tels quels — sans DOM, sans navigateur, comme le reste des
// vérifications ad hoc faites pendant le développement.

const sandbox = {};
vm.createContext(sandbox);
sandbox.window = sandbox;

const FILES = ['js/scenarios.js', 'js/network-map.js', 'js/factsheets.js'];
FILES.forEach(rel=>{
  const full = path.join(ROOT, rel);
  if(!fs.existsSync(full)){ fail(`Fichier introuvable : ${rel}`); process.exit(1); }
  try{
    vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: rel });
  }catch(e){
    fail(`${rel} ne s'exécute pas : ${e.message}`);
    process.exit(1);
  }
});

// SKILL_FAMILIES vit dans ui.js, qui dépend du DOM (document.getElementById
// dès son chargement) — on en extrait uniquement la déclaration de la
// constante par une regex ciblée, plutôt que d'exécuter tout le fichier.
const uiSrc = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
const skillFamiliesMatch = uiSrc.match(/const SKILL_FAMILIES = \[[\s\S]*?\n\];/);
if(!skillFamiliesMatch){ fail("Impossible d'extraire SKILL_FAMILIES de js/ui.js (le format a peut-être changé)."); process.exit(1); }
vm.runInContext(skillFamiliesMatch[0], sandbox, { filename: 'js/ui.js (SKILL_FAMILIES)' });

const SCENARIOS = vm.runInContext('SCENARIOS', sandbox);
const NETWORK_CLUSTERS = vm.runInContext('NETWORK_CLUSTERS', sandbox);
const FACTSHEET_META = vm.runInContext('FACTSHEET_META', sandbox);
const SKILL_FAMILIES = vm.runInContext('SKILL_FAMILIES', sandbox);

console.log(`${DIM}${SCENARIOS.length} scénarios chargés depuis js/scenarios.js${RESET}`);

/* =========================================================================
   1. Cohérence des identifiants entre SCENARIOS et les bases de métadonnées
   ========================================================================= */
section('1. Cohérence des ids (SCENARIOS ↔ NETWORK_CLUSTERS ↔ SKILL_FAMILIES ↔ FACTSHEET_META)');

const ids = SCENARIOS.map(s=>s.id);
const idSet = new Set(ids);

if(idSet.size !== ids.length){
  const seen = new Set();
  const dupes = new Set();
  ids.forEach(id=>{ if(seen.has(id)) dupes.add(id); seen.add(id); });
  fail(`Ids en double dans SCENARIOS : ${[...dupes].join(', ')}`);
} else {
  ok(`${ids.length} ids uniques dans SCENARIOS.`);
}

ids.forEach(id=>{ if(!id || typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) fail(`Id mal formé : ${JSON.stringify(id)}`); });

const clusterIds = new Set(NETWORK_CLUSTERS.flatMap(c=>c.ids));
const skillIds = new Set(SKILL_FAMILIES.flatMap(c=>c.ids));

const missingCluster = ids.filter(id=>!clusterIds.has(id));
const missingSkill = ids.filter(id=>!skillIds.has(id));
const missingFactsheet = ids.filter(id=>!(id in FACTSHEET_META));
const orphanCluster = [...clusterIds].filter(id=>!idSet.has(id));
const orphanSkill = [...skillIds].filter(id=>!idSet.has(id));

if(missingCluster.length) fail(`Absents de NETWORK_CLUSTERS (js/network-map.js) : ${missingCluster.join(', ')}`);
else ok('Tous les scénarios sont classés dans NETWORK_CLUSTERS.');

if(missingSkill.length) fail(`Absents de SKILL_FAMILIES (js/ui.js) : ${missingSkill.join(', ')}`);
else ok('Tous les scénarios sont classés dans SKILL_FAMILIES.');

if(missingFactsheet.length) fail(`Absents de FACTSHEET_META (js/factsheets.js) : ${missingFactsheet.join(', ')}`);
else ok('Tous les scénarios ont une fiche technique dans FACTSHEET_META.');

if(orphanCluster.length) fail(`Ids orphelins dans NETWORK_CLUSTERS (n'existent plus dans SCENARIOS) : ${orphanCluster.join(', ')}`);
if(orphanSkill.length) fail(`Ids orphelins dans SKILL_FAMILIES (n'existent plus dans SCENARIOS) : ${orphanSkill.join(', ')}`);
if(!orphanCluster.length && !orphanSkill.length) ok('Aucun id orphelin (scénario supprimé mais oublié dans une base de métadonnées).');

/* =========================================================================
   2. Structure de chaque scénario
   ========================================================================= */
section('2. Structure individuelle des scénarios');

function joinPath(parent, name){
  return parent === '/' ? '/' + name : parent + '/' + name;
}

function checkVfs(scn){
  const vfs = scn.makeVfs();
  const errs = [];
  if(!vfs['/']) errs.push('aucune racine "/"');
  Object.keys(vfs).forEach(p=>{
    const node = vfs[p];
    if(!node || (node.type !== 'dir' && node.type !== 'file')) errs.push(`${p} : type invalide (${node && node.type})`);
    if(!node.owner) errs.push(`${p} : propriétaire manquant`);
    if(!node.perm) errs.push(`${p} : permissions manquantes`);
    if(node.type === 'dir'){
      (node.children || []).forEach(child=>{
        const childPath = joinPath(p, child);
        if(!vfs[childPath]) errs.push(`${p} référence l'enfant "${child}" (${childPath}) qui n'existe pas`);
      });
    }
  });
  // Chaque chemin (hors racine) doit être listé comme enfant de son parent.
  Object.keys(vfs).forEach(p=>{
    if(p === '/') return;
    const parent = p.slice(0, p.lastIndexOf('/')) || '/';
    const name = p.slice(p.lastIndexOf('/') + 1);
    if(!vfs[parent]) { errs.push(`${p} : dossier parent ${parent} inexistant`); return; }
    if(!(vfs[parent].children || []).includes(name)) errs.push(`${p} : absent de la liste children de son parent ${parent}`);
  });
  return { vfs, errs };
}

let structOk = 0;
SCENARIOS.forEach(scn=>{
  const errs = [];
  if(!scn.title) errs.push('titre manquant');
  if(!scn.category) errs.push('catégorie manquante');
  ['attack','defense'].forEach(phase=>{
    const p = scn[phase];
    if(!p) { errs.push(`bloc ${phase} manquant`); return; }
    if(!p.who) errs.push(`${phase}.who manquant`);
    if(!p.desc) errs.push(`${phase}.desc manquant`);
    if(!Array.isArray(p.hints) || !p.hints.length) errs.push(`${phase}.hints vide ou absent`);
  });
  if(typeof scn.makeVfs !== 'function') errs.push('makeVfs manquant');
  const hasAltHook = Object.keys(scn).some(k=> /^on[A-Z]/.test(k) && typeof scn[k] === 'function');
  if((!Array.isArray(scn.exploitRules) || !scn.exploitRules.length) && !hasAltHook){
    errs.push('exploitRules vide ou absent, et aucun hook alternatif (onCat, onChmod...) trouvé');
  }
  if(Array.isArray(scn.exploitRules)) scn.exploitRules.forEach((r,i)=>{
    // instanceof échoue entre réalms vm différents : on compare la balise interne plutôt que le constructeur.
    if(Object.prototype.toString.call(r.pattern) !== '[object RegExp]') errs.push(`exploitRules[${i}].pattern n'est pas une RegExp`);
    if(typeof r.run !== 'function') errs.push(`exploitRules[${i}].run n'est pas une fonction`);
  });
  if(typeof scn.attackCheck !== 'function') errs.push('attackCheck manquant');
  if(typeof scn.defenseCheck !== 'function') errs.push('defenseCheck manquant');
  if(typeof scn.replay !== 'function') errs.push('replay manquant');
  if(!scn.startUserAttack) errs.push('startUserAttack manquant');
  if(!scn.startCwdAttack) errs.push('startCwdAttack manquant');

  if(typeof scn.makeVfs === 'function'){
    const { errs: vfsErrs } = checkVfs(scn);
    errs.push(...vfsErrs.map(e=>`vfs — ${e}`));
  }

  if(errs.length) fail(`${scn.id} : ${errs.join(' ; ')}`);
  else structOk++;
});
if(structOk === SCENARIOS.length) ok(`Structure valide pour les ${structOk} scénarios (titre, phases, vfs, exploitRules, fonctions de contrôle).`);
else ok(`Structure valide pour ${structOk}/${SCENARIOS.length} scénarios (détail des erreurs ci-dessus).`);

/* =========================================================================
   3. Invariant d'état initial : un scénario neuf n'est jamais déjà corrigé
   ========================================================================= */
section("3. Invariant d'état initial (defenseCheck faux, replay réussi, attackCheck faux avant toute action)");

let invariantOk = 0;
SCENARIOS.forEach(scn=>{
  try{
    const vfs = scn.makeVfs();
    const state = { vfs, flags:{}, isRoot:true, user:'root', cwd:'/root' };
    const errs = [];
    if(scn.defenseCheck(state) !== false) errs.push('defenseCheck(state initial) devrait être faux (le scénario naît déjà "corrigé")');
    const r = scn.replay(state);
    if(!r || typeof r.success !== 'boolean' || !Array.isArray(r.log)) errs.push('replay(state initial) mal formé (attendu {log:Array, success:Boolean})');
    else if(r.success !== true) errs.push("replay(state initial) devrait réussir (l'attaque doit fonctionner tant que rien n'est corrigé)");
    const attackState = { vfs: scn.makeVfs(), flags:{}, isRoot:false, user:scn.startUserAttack, cwd:scn.startCwdAttack };
    if(scn.attackCheck(attackState) !== false) errs.push("attackCheck(state initial, aucune règle jouée) devrait être faux");
    if(errs.length) fail(`${scn.id} : ${errs.join(' ; ')}`);
    else invariantOk++;
  }catch(e){
    fail(`${scn.id} : exception pendant la vérification d'invariant — ${e.message}`);
  }
});
if(invariantOk === SCENARIOS.length) ok(`Invariant d'état initial respecté par les ${invariantOk} scénarios.`);
else ok(`Invariant respecté par ${invariantOk}/${SCENARIOS.length} scénarios.`);

/* =========================================================================
   4. Solveur générique : les indices d'attaque suffisent-ils à gagner ?
   ========================================================================= */
section("4. Solveur best-effort : rejouer les commandes citées entre backticks dans attack.hints");

function extractBacktickedCommands(hints){
  const out = [];
  (hints || []).forEach(h=>{
    const matches = h.match(/`([^`]+)`/g) || [];
    matches.forEach(m=> out.push(m.slice(1, -1)));
  });
  return out;
}

let solved = 0, unsolved = [];
SCENARIOS.forEach(scn=>{
  const state = { vfs: scn.makeVfs(), flags:{}, isRoot:false, user:scn.startUserAttack, cwd:scn.startCwdAttack };
  const candidates = extractBacktickedCommands(scn.attack.hints);
  let ranAny = false;
  candidates.forEach(cmd=>{
    const rule = scn.exploitRules.find(r=> r.pattern.test(cmd));
    if(rule){ try{ rule.run(state, ()=>{}); ranAny = true; }catch(e){ /* ignoré, remonté via l'échec attackCheck ci-dessous */ } }
  });
  let win = false;
  try{ win = scn.attackCheck(state) === true; }catch(e){ win = false; }
  if(win) solved++;
  else unsolved.push({ id: scn.id, ranAny, candidatesFound: candidates.length });
});

ok(`${solved}/${SCENARIOS.length} scénarios résolus automatiquement à partir des commandes citées dans leurs indices.`);
if(unsolved.length){
  warn(`${unsolved.length} scénario(s) non résolu(s) automatiquement (à relire à la main) :`);
  unsolved.forEach(u=> console.log(`${DIM}    - ${u.id} (${u.candidatesFound} commande(s) entre backticks détectée(s), ${u.ranAny ? 'au moins une exécutée' : 'aucune ne correspond à une exploitRule'})${RESET}`));
}

/* =========================================================================
   Résumé
   ========================================================================= */
section('Résumé');
console.log(`${SCENARIOS.length} scénarios, ${NETWORK_CLUSTERS.length} clusters réseau, ${SKILL_FAMILIES.length} familles de compétences.`);
if(failures){
  console.log(`${RED}${BOLD}${failures} échec(s) critique(s), ${warnings} avertissement(s).${RESET}`);
  process.exit(1);
} else {
  console.log(`${GREEN}${BOLD}Aucun échec critique — ${warnings} avertissement(s) à relire au besoin.${RESET}`);
  process.exit(0);
}
