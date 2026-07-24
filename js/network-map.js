/* =========================================================
   RED vs BLUE — v0.6 : topologie réseau interactive
   Chaque scénario devient un nœud cliquable, regroupé par
   famille technique autour d'un "cœur de réseau" central.
   ========================================================= */

const NETWORK_CLUSTERS = [
  { name:'Linux — élévation locale', color:'var(--red)',
    ids:['suid-find','cron-writable','sudo-awk','ssh-key-exposed','capability-setuid-python',
         'path-hijack-cron','passwd-world-writable','shadow-world-readable','sudo-ld-preload',
         'systemd-unit-writable','tar-wildcard-injection','pwnkit-cve-2021-4034','capability-dac-read-search'] },
  { name:'Réseau & annuaires', color:'var(--blue)',
    ids:['nfs-no-root-squash','dns-axfr','ldap-anonymous-bind',
         'redis-unauthenticated','elasticsearch-unauthenticated',
         'memcached-unauthenticated','smb-null-session',
         'llmnr-nbtns-poisoning-hash-capture','ntlm-relay-smb-signing-disabled'] },
  { name:'Conteneurs & orchestration', color:'var(--gold)',
    ids:['docker-socket-writable','k8s-privileged-hostpath','docker-registry-unauthenticated',
         'k8s-rbac-clusterrolebinding-overpermissive','docker-pid-host-ptrace-injection',
         'k8s-missing-networkpolicy-lateral-movement','k8s-etcd-unauthenticated',
         'docker-cgroup-release-agent-escape'] },
  { name:'Cloud & Infrastructure as Code', color:'var(--green)',
    ids:['aws-imds-ssrf','s3-bucket-public','terraform-state-exposed','jenkins-script-console-open',
         'iam-role-overpermissive','secret-in-public-repo','oauth-token-overscope','github-actions-secret-leak',
         'dependency-confusion-pip','terraform-unpinned-module-supply-chain','cloud-secretsmanager-public-resource-policy'] },
  { name:'Applications web', color:'var(--purple)',
    ids:['git-directory-exposed','jwt-alg-none-forgery','log4shell-jndi-rce',
         'python-pickle-deserialization','ssti-jinja2-flask',
         'idor-invoice-api','mass-assignment-signup',
         'excessive-data-exposure-api','missing-rate-limit-bruteforce',
         'graphql-introspection-privilege-leak','cors-reflected-origin-credentials'] },
  { name:'Active Directory / Windows', color:'#7cb3ff',
    ids:['windows-unquoted-path','ad-asrep-roasting','ad-unconstrained-delegation',
         'ad-dcsync-abuse','ad-gpo-writable','ad-kerberoasting-spn','ad-pass-the-hash-local-admin',
         'ad-silver-ticket-forgery','ad-acl-genericall-privesc'] }
];

function netmapNodeStatus(i){
  const s = SCENARIOS[i];
  const unlocked = isScenarioUnlocked(i);
  const p = progress[s.id];
  if(!unlocked) return 'locked';
  if(p.attack && p.defense) return 'secured';
  if(p.attack) return 'progress';
  return 'open';
}

function netmapGoToNode(i){
  if(!isScenarioUnlocked(i)) return;
  const p = progress[SCENARIOS[i].id];
  const phase = (p.attack && !p.defense) ? 'defense' : 'attack';
  if(phase === 'defense' && !isDefenseUnlocked(i)) return;
  openBriefing(i, phase);
}

function buildNetworkMapSVG(){
  const CX = 460, CY = 360, R1 = 250;
  const nodes = []; // {i, x, y, color, clusterName}
  const spokes = []; // cluster-center -> node lines
  const clusterCenters = [];

  NETWORK_CLUSTERS.forEach((cluster, ci)=>{
    const angle = -Math.PI/2 + ci * (2*Math.PI / NETWORK_CLUSTERS.length);
    const cx = CX + R1 * Math.cos(angle);
    const cy = CY + R1 * Math.sin(angle);
    clusterCenters.push({x:cx, y:cy, color:cluster.color, name:cluster.name, angle});

    const n = cluster.ids.length;
    const r2 = 42 + n * 4.2;
    cluster.ids.forEach((id, k)=>{
      const i = SCENARIOS.findIndex(s=>s.id===id);
      if(i === -1) return;
      const a = -Math.PI/2 + k * (2*Math.PI/n) + ci*0.35;
      const x = cx + r2 * Math.cos(a);
      const y = cy + r2 * Math.sin(a);
      nodes.push({i, x, y, color:cluster.color, clusterName:cluster.name});
      spokes.push(`<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="netmap-spoke" style="--sc:${cluster.color}"/>`);
    });
  });

  const coreLines = clusterCenters.map(c=>
    `<line x1="${CX}" y1="${CY}" x2="${c.x.toFixed(1)}" y2="${c.y.toFixed(1)}" class="netmap-core-link" style="--sc:${c.color}"/>`
  ).join('');

  const clusterLabels = clusterCenters.map(c=>{
    const lx = CX + (R1+ (c.name.length>20?150:120)) * Math.cos(c.angle);
    const ly = CY + (R1+ (c.name.length>20?150:120)) * Math.sin(c.angle);
    const anchor = Math.cos(c.angle) > 0.15 ? 'start' : (Math.cos(c.angle) < -0.15 ? 'end' : 'middle');
    return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" class="netmap-cluster-label" text-anchor="${anchor}" style="--sc:${c.color}">${escapeHtml(c.name)}</text>`;
  }).join('');

  const nodeCircles = nodes.map(n=>{
    const status = netmapNodeStatus(n.i);
    const scn = SCENARIOS[n.i];
    return `<g class="netmap-node ${status}" data-idx="${n.i}" style="--sc:${n.color}" tabindex="0">
      <circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="10">
        <title>${escapeHtml('Paire ' + String(n.i+1).padStart(2,'0') + ' — ' + scn.title)}</title>
      </circle>
    </g>`;
  }).join('');

  return `
    <svg class="netmap-svg" viewBox="0 0 920 720" xmlns="http://www.w3.org/2000/svg">
      ${coreLines}
      ${spokes.join('')}
      ${clusterLabels}
      <g class="netmap-core">
        <circle cx="${CX}" cy="${CY}" r="20"/>
        <text x="${CX}" y="${CY+4}" text-anchor="middle" class="netmap-core-label">target-lab</text>
      </g>
      ${nodeCircles}
    </svg>`;
}

function renderNetworkMap(){
  const host = document.getElementById('network-map-host');
  if(!host) return;
  host.innerHTML = buildNetworkMapSVG();

  const info = document.getElementById('netmap-info');
  const statusLabel = {locked:'🔒 Verrouillé', progress:'🟡 Attaque réalisée — défense à faire', secured:'🟢 Sécurisé', open:'⚪ Non tenté'};

  function showInfo(i){
    if(!info) return;
    const s = SCENARIOS[i];
    const status = netmapNodeStatus(i);
    info.innerHTML = `
      <div class="netmap-info-num">Paire ${String(i+1).padStart(2,'0')}</div>
      <div class="netmap-info-title">${escapeHtml(s.title)}</div>
      <div class="netmap-info-cat">${escapeHtml(s.category)}</div>
      <div class="netmap-info-status">${statusLabel[status]}</div>
      ${status!=='locked' ? '<div class="netmap-info-hint">Cliquer pour ouvrir ce dossier.</div>' : '<div class="netmap-info-hint">Terminez les scénarios précédents pour le débloquer.</div>'}`;
  }
  function resetInfo(){
    if(!info) return;
    info.innerHTML = `<div class="netmap-info-placeholder">Survolez ou touchez un nœud pour voir le détail du scénario associé.</div>`;
  }
  resetInfo();

  host.querySelectorAll('.netmap-node').forEach(el=>{
    const i = parseInt(el.dataset.idx, 10);
    el.addEventListener('mouseenter', ()=> showInfo(i));
    el.addEventListener('focus', ()=> showInfo(i));
    el.addEventListener('mouseleave', resetInfo);
    el.addEventListener('click', ()=> netmapGoToNode(i));
    el.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); netmapGoToNode(i); } });
  });
}
window.renderNetworkMap = renderNetworkMap;
