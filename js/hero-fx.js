/* =========================================================
   RED vs BLUE — effets visuels de l'écran d'accueil
   (fond réseau animé, boot log, pipeline, roadmap)
   ========================================================= */

/* ---------- Intro cinématique plein écran (une seule fois) ---------- */

(function(){
  const overlay = document.getElementById('boot-intro');
  const pre = document.getElementById('boot-intro-text');
  const lines = [
    'BIOS TARGET-LAB v2.6 — POST OK',
    'CPU .......................... OK',
    'MEMORY TEST 65536K ........... OK',
    'Initialisation du contrôleur mémoire... OK',
    'Détection des interfaces réseau : eth0 up, eth1 up',
    'Montage du système de fichiers virtuel... OK',
    'Chargement du moteur de permissions... OK',
    'Chargement des scénarios : 4/4',
    '',
    '2 équipes détectées :',
    '  <span class="bi-red">RED</span>  — équipe offensive',
    '  <span class="bi-blue">BLUE</span> — équipe défensive',
    '',
    '<span class="bi-granted">> ACCÈS AUTORISÉ</span>'
  ];
  let li=0, ci=0;

  function typeLine(){
    if(li >= lines.length){
      pre.innerHTML += '<span class="bi-cursor">&nbsp;</span>';
      setTimeout(()=>{
        overlay.classList.add('hide');
        setTimeout(()=>{ overlay.remove(); }, 600);
      }, 380);
      return;
    }
    const raw = lines[li];
    if(raw === ''){
      pre.innerHTML += '\n';
      li++; typeLine();
      return;
    }
    // les lignes contenant du HTML (spans colorés) s'affichent d'un coup
    if(raw.includes('<span')){
      pre.innerHTML += raw + '\n';
      li++;
      setTimeout(typeLine, 100);
      return;
    }
    if(ci === 0) pre.innerHTML += '<span id="bi-active"></span>';
    const active = document.getElementById('bi-active');
    ci++;
    active.textContent = raw.slice(0, ci);
    if(ci <= raw.length){
      setTimeout(typeLine, 6 + Math.random()*10);
    } else {
      active.removeAttribute('id');
      pre.innerHTML += '\n';
      li++; ci=0;
      setTimeout(typeLine, 40);
    }
  }
  typeLine();
})();

/* ---------- Fond réseau animé (canvas) ---------- */

(function(){
  const canvas = document.getElementById('network-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, nodes = [], packets = [];
  const NODE_COUNT = 26;
  const LINK_DIST = 150;

  function resize(){
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  for(let i=0;i<NODE_COUNT;i++){
    nodes.push({
      x: Math.random()*W, y: Math.random()*H,
      vx: (Math.random()-0.5)*0.25, vy: (Math.random()-0.5)*0.25
    });
  }

  function maybeSpawnPacket(){
    if(Math.random() > 0.985 && nodes.length > 1){
      const a = nodes[Math.floor(Math.random()*nodes.length)];
      let b = null, best = Infinity;
      nodes.forEach(n=>{
        if(n===a) return;
        const d = Math.hypot(n.x-a.x, n.y-a.y);
        if(d < LINK_DIST && d < best){ best = d; b = n; }
      });
      if(b){
        packets.push({ a, b, t:0, color: Math.random() < 0.5 ? '255,59,92' : '34,211,238' });
      }
    }
  }

  function step(){
    if(document.getElementById('screen-home').classList.contains('active')){
      ctx.clearRect(0,0,W,H);

      nodes.forEach(n=>{
        n.x += n.vx; n.y += n.vy;
        if(n.x < 0 || n.x > W) n.vx *= -1;
        if(n.y < 0 || n.y > H) n.vy *= -1;
      });

      ctx.lineWidth = 1;
      for(let i=0;i<nodes.length;i++){
        for(let j=i+1;j<nodes.length;j++){
          const d = Math.hypot(nodes[i].x-nodes[j].x, nodes[i].y-nodes[j].y);
          if(d < LINK_DIST){
            ctx.strokeStyle = `rgba(120,140,160,${(1-d/LINK_DIST)*0.18})`;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      nodes.forEach(n=>{
        ctx.fillStyle = 'rgba(150,165,180,0.35)';
        ctx.beginPath();
        ctx.arc(n.x, n.y, 1.6, 0, Math.PI*2);
        ctx.fill();
      });

      maybeSpawnPacket();
      packets.forEach(p=>{
        p.t += 0.02;
        const x = p.a.x + (p.b.x-p.a.x)*p.t;
        const y = p.a.y + (p.b.y-p.a.y)*p.t;
        ctx.fillStyle = `rgba(${p.color},0.9)`;
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI*2);
        ctx.fill();
      });
      packets = packets.filter(p=>p.t < 1);
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
})();

/* ---------- Boot log (effet machine à écrire) ---------- */

(function(){
  const el = document.getElementById('boot-log');
  const lines = [
    '$ ./init_lab.sh --mode=red-vs-blue',
    '[OK] 4 systèmes chargés',
    '[OK] moteur de permissions actif',
    '[OK] 2 équipes détectées : RED / BLUE',
    '> prêt.'
  ];
  let li = 0, ci = 0;
  let played = false;

  function typeNext(){
    if(li >= lines.length){
      el.innerHTML += '<span class="bl-cursor">&nbsp;</span>';
      return;
    }
    const line = lines[li];
    if(ci === 0){
      const div = document.createElement('div');
      div.className = 'bl-line';
      div.id = 'bl-active';
      el.appendChild(div);
    }
    const active = document.getElementById('bl-active');
    active.textContent = line.slice(0, ci+1);
    ci++;
    if(ci <= line.length){
      setTimeout(typeNext, 16 + Math.random()*22);
    } else {
      active.removeAttribute('id');
      li++; ci = 0;
      setTimeout(typeNext, 220);
    }
  }

  window.playBootLog = function(){
    if(played) return;
    played = true;
    el.innerHTML = '';
    li = 0; ci = 0;
    typeNext();
  };
})();

/* ---------- Pipeline animé (boucle attaque → défense → vérification) ---------- */

(function(){
  const dot = document.getElementById('pipe-dot');
  const icons = [0,1,2].map(i=>document.getElementById('pipe-icon-'+i));
  const labels = [0,1,2].map(i=>document.getElementById('pipe-label-'+i));
  const positions = [6, 50, 94];
  const baseLabels = ['Système simulé', 'Compromis', 'Attaque bloquée'];

  function resetIcons(){
    icons.forEach(i=>i.className='pipe-icon');
    labels.forEach((l,i)=>l.textContent = baseLabels[i]);
  }

  function animateDot(from, to, ms, color){
    return new Promise(resolve=>{
      dot.style.background = color;
      dot.style.boxShadow = `0 0 14px 3px rgba(${color==='var(--red)'?'255,59,92':color==='var(--blue)'?'34,211,238':'234,179,8'},.7)`;
      const start = performance.now();
      function frame(now){
        const t = Math.min(1, (now-start)/ms);
        dot.style.left = (from + (to-from)*t) + '%';
        if(t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }

  async function loop(){
    while(true){
      if(!document.getElementById('screen-home').classList.contains('active')){
        await wait(400); continue;
      }
      resetIcons();
      dot.style.left = positions[0]+'%';
      await wait(500);

      await animateDot(positions[0], positions[1], 1600, 'var(--red)');
      icons[1].className = 'pipe-icon flash-red';
      labels[1].textContent = 'Compromis !';
      await wait(700);

      await animateDot(positions[1], positions[2], 1600, 'var(--blue)');
      icons[2].className = 'pipe-icon flash-blue';
      labels[2].textContent = 'Durci...';
      await wait(700);

      icons[2].className = 'pipe-icon flash-gold';
      labels[2].textContent = 'Attaque bloquée';
      await wait(1400);

      dot.style.transition = 'none';
      await wait(50);
    }
  }
  loop();
})();

/* ---------- Roadmap ---------- */

const ROADMAP = [
  { version:'v0.2', tag:'attaque', tagColor:'var(--red)', done:true,
    title:'Nouveaux scénarios',
    desc:"Partage NFS mal configuré, transfert de zone DNS (AXFR), bind LDAP anonyme, service Windows à chemin non quoté." },
  { version:'v0.2ter', tag:'attaque', tagColor:'var(--red)', done:true,
    title:'Pack « surfaces modernes »',
    desc:"16 scénarios ajoutés — injection wildcard, PwnKit, Redis, SSRF cloud IMDS, .git exposé, Kubernetes, JWT alg=none, Log4Shell, capacité cap_dac_read_search, bucket S3 public, terraform.tfstate, console Jenkins ouverte, désérialisation pickle, SSTI Jinja2, Elasticsearch, registre Docker — total : 31 scénarios." },
  { version:'v0.3', tag:'système', tagColor:'var(--green)', done:true,
    title:'Interpréteur renforcé',
    desc:"Pipes (grep, wc, sort, uniq, head, tail, cut), redirections > et >>, variables d'environnement ($HOME, $PATH, export), historique navigable aux flèches." },
  { version:'v0.4', tag:'système', tagColor:'var(--gold)', done:true,
    title:'Scoring & chronométrage',
    desc:"Score basé sur le nombre de commandes et d'indices utilisés, chronomètre live, classement local exportable en JSON." },
  { version:'v0.5', tag:'défense', tagColor:'var(--blue)', done:true,
    title:'Rapport de session',
    desc:"Export Markdown du parcours : failles trouvées, correctifs appliqués, verdicts de replay, scores et succès." },
  { version:'v0.6', tag:'système', tagColor:'var(--gold)', done:true,
    title:'Visualisation réseau',
    desc:"Les scénarios en nœuds SVG cliquables regroupés par famille technique autour de target-lab, façon Packet Tracer." },
  { version:'v0.7', tag:'attaque', tagColor:'var(--red)', done:true,
    title:'Mode bac à sable',
    desc:"Système et faille tirés aléatoirement, sans script guidé, pour s'entraîner librement." },
  { version:'v0.8', tag:'système', tagColor:'var(--gold)', done:true,
    title:'Ambiance sonore',
    desc:"Bips terminal, alerte de compromission, son de correctif appliqué — avec option silencieuse par défaut." },
  { version:'v0.9', tag:'grosse feature', tagColor:'var(--green)', done:true,
    title:'Mode duel',
    desc:"Face-à-face local par iframes synchronisées : un joueur attaque pendant que l'autre défend le même système, en simultané." },
  { version:'v1.0', tag:'attaque', tagColor:'var(--red)', done:true,
    title:'Scénarios chaînés',
    desc:"Mouvement latéral réel sur 3 machines distinctes : clé SSH oubliée → pivot vers un hôte interne → identifiants trouvés → pivot final root." },
  { version:'v1.1', tag:'système', tagColor:'var(--gold)', done:true,
    title:'Personnalisation',
    desc:"Thème clair façon rapport d'audit, sélecteur de palette, mode contraste élevé." },
  { version:'v1.2', tag:'grosse feature', tagColor:'var(--green)', done:true,
    title:'Faille du jour',
    desc:"Un scénario tiré au sort par hachage de la date, identique pour tout le monde ce jour-là, façon Wordle — série de jours consécutifs suivie." },
  { version:'v1.3', tag:'grosse feature', tagColor:'var(--green)', done:true,
    title:'Replay cinématique exportable',
    desc:"Lecture animée ligne par ligne de n'importe quelle session, vitesse ×1/×2/×4, export en fichier HTML autonome rejouable sans dépendance." },
  { version:'v2.0', tag:'grosse feature', tagColor:'var(--green)', done:true,
    title:'Génération procédurale & éditeur',
    desc:"Scénarios générés automatiquement, et éditeur permettant à un professeur de créer son propre CTF sans écrire de code." },
  { version:'v2.1', tag:'système', tagColor:'var(--gold)', done:true,
    title:'Difficulté adaptative',
    desc:"Série de phases réussies sans indice suivie dans le HUD ; au-delà de 3, le mode guidé masque les commandes toutes faites derrière un bouton à révéler." },
  { version:'v2.2', tag:'défense', tagColor:'var(--blue)', done:true,
    title:'Mentor contextuel',
    desc:"Bouton Mentor posant une question socratique par famille technique, sans jamais révéler la commande exacte et sans coûter au score." },
  { version:'v2.3', tag:'attaque', tagColor:'var(--red)', done:true,
    title:'Pack « identité & secrets cloud »',
    desc:"4 scénarios ajoutés — rôle IAM trop permissif, clé API codée en dur dans un dépôt public, jeton OAuth à portée trop large, secret GitHub Actions exfiltré via pull_request_target — total : 35 scénarios." },
  { version:'v2.4', tag:'système', tagColor:'var(--gold)', done:true,
    title:'Bilan : statistiques détaillées',
    desc:"Écran Bilan complété : temps moyen et taux d'indices par famille technique, courbe de score chronologique — plus deux correctifs d'intégrité de la progression sauvegardée." },
  { version:'v2.5', tag:'défense', tagColor:'var(--blue)', done:true,
    title:'Mode revanche',
    desc:"Repère les scénarios bouclés avec beaucoup d'indices ou de temps et propose de les retenter directement en bac à sable ciblé, mis en avant à la fin du parcours complet." },
  { version:'v2.6', tag:'attaque', tagColor:'var(--red)', done:true,
    title:'Pack « Active Directory / Windows »',
    desc:"4 scénarios ajoutés — AS-REP Roasting, délégation Kerberos sans contrainte, abus DCSync par droits de réplication excessifs, GPO modifiable par tous les utilisateurs — total : 39 scénarios. Nouvelle famille technique dédiée, qui absorbe aussi l'unique scénario Windows déjà existant." },
  { version:'v2.7', tag:'attaque', tagColor:'var(--red)', done:true,
    title:'Pack « sécurité des API »',
    desc:"2 scénarios ajoutés — IDOR sur une API de facturation (accès à la facture d'un autre client par simple changement d'identifiant), affectation de masse (mass assignment) permettant de s'auto-attribuer le rôle admin dès l'inscription — total : 41 scénarios, famille « Applications web »." },
  { version:'v2.8', tag:'attaque', tagColor:'var(--red)', done:true,
    title:'Pack « sécurité des API », 2ᵉ vague',
    desc:"2 scénarios ajoutés — exposition excessive de données sur l'annuaire des utilisateurs (jeton de réinitialisation exposé puis exploité), absence de limitation de débit sur l'authentification (mot de passe admin trouvé par force brute) — total : 43 scénarios, famille « Applications web »." },
  { version:'v2.9', tag:'attaque', tagColor:'var(--red)', done:true,
    title:'RBAC Kubernetes trop permissif & confusion de dépendances',
    desc:"2 scénarios ajoutés — ClusterRoleBinding accordant cluster-admin au compte de service par défaut d'un namespace, confusion de dépendances via un paquet pip public homonyme d'un paquet interne — total : 45 scénarios, familles « Conteneurs & orchestration » et « Cloud & Infrastructure as Code »." },
  { version:'v3.0', tag:'attaque', tagColor:'var(--red)', done:true,
    title:'Pack « réseau » — Memcached & session nulle SMB',
    desc:"2 scénarios ajoutés — cache Memcached non authentifié exposant un jeton de session administrateur, session nulle SMB permettant de lister les partages et d'en extraire des identifiants — total : 47 scénarios, famille « Réseau & annuaires »." },
  { version:'v3.1', tag:'défense', tagColor:'var(--purple)', done:true,
    title:'Polish visuel des cartes dossier',
    desc:"Apparition échelonnée en fondu-montant à l'ouverture de l'onglet Dossiers, et fin liseré de couleur en haut de chaque carte rappelant sa famille technique — les mêmes couleurs que la topologie réseau et le radar de compétences." },
  { version:'v3.2', tag:'défense', tagColor:'var(--purple)', done:true,
    title:'Structuration visuelle de la barre de navigation',
    desc:"Icônes cohérentes sur les 13 onglets (9 en manquaient encore), et séparateurs regroupant catalogue de contenu, modes de jeu et suivi de progression — la hiérarchie déjà dans la tête du joueur devient enfin visible." },
  { version:'v3.3', tag:'attaque', tagColor:'var(--gold)', done:true,
    title:'Célébration cinématique à la capture d\'un flag',
    desc:"Flash doré plein écran, secousse du terminal et texte de flag pulsé au moment de la capture — le moment le plus gratifiant du jeu passe enfin d'une simple ligne de texte à un vrai instant marquant." },
  { version:'v3.4', tag:'attaque', tagColor:'var(--red)', done:true,
    title:'Pack « conteneurs » — PID host partagé & NetworkPolicy absente',
    desc:"2 scénarios ajoutés — injection de code dans un processus root de l'hôte via un espace de noms PID partagé, mouvement latéral entre namespaces Kubernetes faute de NetworkPolicy — total : 49 scénarios, famille « Conteneurs & orchestration » (jusqu'ici la plus petite)." },
  { version:'v3.5', tag:'attaque', tagColor:'var(--red)', done:true,
    title:'Pack « Active Directory » — Kerberoasting & Pass-the-Hash',
    desc:"2 scénarios ajoutés — ticket de service (TGS) cassable hors-ligne pour un compte à SPN faiblement protégé (Kerberoasting), et mot de passe administrateur local identique sur tout le parc rejoué d'une machine à l'autre sans LAPS (Pass-the-Hash) — total : 51 scénarios, famille « Active Directory / Windows » (jusqu'ici la plus petite, elle passe de 5 à 7)." }
];

function renderRoadmap(){
  const el = document.getElementById('roadmap-timeline');
  if(!el) return;
  el.innerHTML = '';
  ROADMAP.forEach(item=>{
    const div = document.createElement('div');
    div.className = 'rm-item' + (item.done ? ' rm-done' : '');
    div.style.setProperty('--tag-c', item.tagColor);
    div.innerHTML = `
      <div class="rm-version">${item.version}${item.done ? ' <span class="rm-check" title="Déjà implémenté">✔ fait</span>' : ''}</div>
      <div class="rm-title">
        <span class="rm-tag" style="background:${item.tagColor}22;color:${item.tagColor};border:1px solid ${item.tagColor}">${item.tag}</span>
        ${item.title}
      </div>
      <div class="rm-desc">${item.desc}</div>`;
    el.appendChild(div);
  });
}
