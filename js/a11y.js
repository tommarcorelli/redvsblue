/* =========================================================
   RED vs BLUE — v4.9 : accessibilité clavier des modales
   ---------------------------------------------------------------
   Quatre fonctions du jeu créent une modale (openNanoEditor,
   showModal, showRunCompleteModal, openLesson dans ui.js), chacune
   avec son propre contenu et ses propres boutons. Plutôt que de
   dupliquer une gestion clavier dans chacune (risque d'oubli et de
   divergence), ce module observe l'apparition/disparition de tout
   élément .modal-overlay dans #modal-root et lui applique, de façon
   générique :
     - un rôle ARIA de dialogue modal (role="dialog", aria-modal,
       aria-labelledby vers le titre quand il y en a un) ;
     - le focus initial posé sur le premier élément interactif ;
     - un piège du Tab qui garde le focus à l'intérieur de la modale
       tant qu'elle est ouverte (Maj+Tab inclus) ;
     - Échap qui déclenche un clic réel sur le bouton de fermeture
       « sûr » de la modale (jamais un bouton d'action primaire ou
       destructrice) — donc exactement le même comportement qu'un
       clic dessus, sans logique dupliquée ;
     - la restauration du focus sur l'élément qui l'avait avant
       l'ouverture, une fois la modale refermée.
   Aucune des quatre fonctions n'a besoin d'être modifiée : ce module
   se contente d'observer le DOM qu'elles produisent déjà.
   ========================================================= */

const A11Y_FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

let a11yLastFocusedBeforeModal = null;

// Boutons de fermeture « sûrs » connus, par ordre de préférence — voir
// openNanoEditor / showModal / showRunCompleteModal / openLesson dans ui.js.
// Si aucun n'est trouvé (future modale), on se rabat sur le premier
// bouton .ghost, convention déjà suivie par toutes les modales existantes
// pour leur action de fermeture non destructrice.
function a11yFindSafeDismissButton(modalEl){
  const knownIds = ['modal-close', 'nano-cancel', 'modal-skip', 'lesson-close'];
  for(const id of knownIds){
    const btn = modalEl.querySelector('#'+id);
    if(btn) return btn;
  }
  return modalEl.querySelector('.ghost');
}

function a11yVisibleFocusables(modalEl){
  return Array.from(modalEl.querySelectorAll(A11Y_FOCUSABLE_SELECTOR))
    .filter(el => el.offsetParent !== null);
}

function a11yModalKeydown(e, modalEl){
  if(e.key === 'Escape'){
    const dismiss = a11yFindSafeDismissButton(modalEl);
    if(dismiss){ e.preventDefault(); dismiss.click(); }
    return;
  }
  if(e.key !== 'Tab') return;
  const focusables = a11yVisibleFocusables(modalEl);
  if(!focusables.length) return;
  const first = focusables[0], last = focusables[focusables.length-1];
  if(e.shiftKey && document.activeElement === first){
    e.preventDefault(); last.focus();
  } else if(!e.shiftKey && document.activeElement === last){
    e.preventDefault(); first.focus();
  }
}

function a11yEnhanceModalOverlay(overlay){
  const modalEl = overlay.querySelector('.modal');
  if(!modalEl) return;

  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  const heading = modalEl.querySelector('h2, .nano-head');
  if(heading){
    if(!heading.id) heading.id = 'a11y-modal-heading-' + Math.random().toString(36).slice(2, 8);
    modalEl.setAttribute('aria-labelledby', heading.id);
  }

  a11yLastFocusedBeforeModal = document.activeElement;

  const focusables = a11yVisibleFocusables(modalEl);
  if(focusables.length){
    focusables[0].focus({preventScroll:true});
  } else {
    modalEl.setAttribute('tabindex', '-1');
    modalEl.focus({preventScroll:true});
  }

  overlay.addEventListener('keydown', (e)=> a11yModalKeydown(e, modalEl));
}

function a11yRestoreFocusAfterModalClose(){
  const target = a11yLastFocusedBeforeModal;
  if(target && target !== document.body && document.body.contains(target)){
    target.focus({preventScroll:true});
  } else {
    // L'élément qui avait le focus avant l'ouverture a pu disparaître
    // entre-temps (ex. openLesson() reconstruit toute la grille de
    // leçons avant même d'afficher la modale) : plutôt que de perdre
    // silencieusement le focus sur <body>, on retombe sur le titre de
    // l'onglet actif, qui reste toujours présent.
    const fallback = document.querySelector('.tab-panel.active .section-label');
    if(fallback){
      if(!fallback.hasAttribute('tabindex')) fallback.setAttribute('tabindex', '-1');
      fallback.focus({preventScroll:true});
    }
  }
  a11yLastFocusedBeforeModal = null;
}

(function a11yInitModalObserver(){
  const root = document.getElementById('modal-root');
  if(!root || typeof MutationObserver === 'undefined') return;
  const observer = new MutationObserver(mutations=>{
    mutations.forEach(m=>{
      m.addedNodes.forEach(node=>{
        if(node.nodeType === 1 && node.classList && node.classList.contains('modal-overlay')){
          a11yEnhanceModalOverlay(node);
        }
      });
      m.removedNodes.forEach(node=>{
        if(node.nodeType === 1 && node.classList && node.classList.contains('modal-overlay')){
          a11yRestoreFocusAfterModalClose();
        }
      });
    });
  });
  observer.observe(root, { childList:true });
})();
