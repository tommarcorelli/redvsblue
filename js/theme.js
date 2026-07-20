/* =========================================================
   v1.1 — PERSONNALISATION
   Thème clair "rapport d'audit", sélecteur de palette,
   mode contraste élevé. Préférences persistées en localStorage,
   appliquées via des attributs data-* sur <html> (lus par le CSS).
   Comme localStorage est partagé entre toutes les pages du même
   site (index.html, duel.html et ses iframes), la préférence
   s'applique uniformément sans code supplémentaire côté duel.
   ========================================================= */

const THEME_KEY = 'redvsblue_theme_v1';       // 'dark' | 'light'
const PALETTE_KEY = 'redvsblue_palette_v1';   // 'neon' | 'sobre' | 'daltonien'
const CONTRAST_KEY = 'redvsblue_contrast_v1'; // 'normal' | 'eleve'

function getTheme(){ try{ return localStorage.getItem(THEME_KEY) || 'dark'; }catch(e){ return 'dark'; } }
function getPalette(){ try{ return localStorage.getItem(PALETTE_KEY) || 'neon'; }catch(e){ return 'neon'; } }
function getContrast(){ try{ return localStorage.getItem(CONTRAST_KEY) || 'normal'; }catch(e){ return 'normal'; } }

function applyThemeAttrs(){
  const html = document.documentElement;
  const theme = getTheme(), palette = getPalette(), contrast = getContrast();
  if(theme === 'light') html.setAttribute('data-theme', 'light'); else html.removeAttribute('data-theme');
  if(palette !== 'neon') html.setAttribute('data-palette', palette); else html.removeAttribute('data-palette');
  if(contrast === 'eleve') html.setAttribute('data-contrast', 'eleve'); else html.removeAttribute('data-contrast');
}

function setTheme(v){ try{ localStorage.setItem(THEME_KEY, v); }catch(e){} applyThemeAttrs(); }
function setPalette(v){ try{ localStorage.setItem(PALETTE_KEY, v); }catch(e){} applyThemeAttrs(); }
function setContrast(v){ try{ localStorage.setItem(CONTRAST_KEY, v); }catch(e){} applyThemeAttrs(); }

// Appliqué immédiatement au chargement du module (avant le rendu de l'UI).
applyThemeAttrs();

/* ---------- Câblage du panneau de réglages (présent uniquement sur index.html) ---------- */
function wireThemePanel(){
  const btn = document.getElementById('btn-theme-toggle');
  const panel = document.getElementById('theme-panel');
  if(!btn || !panel) return;

  function refreshActiveStates(){
    panel.querySelectorAll('[data-theme-opt]').forEach(el=>{
      el.classList.toggle('active', el.dataset.themeOpt === getTheme());
    });
    panel.querySelectorAll('[data-palette-opt]').forEach(el=>{
      el.classList.toggle('active', el.dataset.paletteOpt === getPalette());
    });
    panel.querySelectorAll('[data-contrast-opt]').forEach(el=>{
      el.classList.toggle('active', el.dataset.contrastOpt === getContrast());
    });
  }

  btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    panel.classList.toggle('open');
    refreshActiveStates();
  });
  document.addEventListener('click', (e)=>{
    if(panel.classList.contains('open') && !panel.contains(e.target) && e.target !== btn){
      panel.classList.remove('open');
    }
  });
  panel.querySelectorAll('[data-theme-opt]').forEach(el=>{
    el.addEventListener('click', ()=>{ setTheme(el.dataset.themeOpt); refreshActiveStates(); });
  });
  panel.querySelectorAll('[data-palette-opt]').forEach(el=>{
    el.addEventListener('click', ()=>{ setPalette(el.dataset.paletteOpt); refreshActiveStates(); });
  });
  panel.querySelectorAll('[data-contrast-opt]').forEach(el=>{
    el.addEventListener('click', ()=>{ setContrast(el.dataset.contrastOpt); refreshActiveStates(); });
  });
  refreshActiveStates();
}

document.addEventListener('DOMContentLoaded', wireThemePanel);
