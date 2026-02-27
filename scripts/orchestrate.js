#!/usr/bin/env node

/**
 * orchestrate.js — Pipeline multi-agents Claude pour TaskFlow
 *
 * Ce script orchestre plusieurs agents Claude spécialisés pour implémenter
 * une feature de bout en bout, de l'analyse à la Pull Request GitHub.
 *
 * Pipeline en 6 étapes :
 *   0. Faisabilité    — un agent vérifie que la demande est cohérente avec l'architecture
 *   1. Planification  — un agent analyse le codebase et produit un plan structuré
 *   2. Branche git    — création de la branche feature
 *   3. Développement  — agents backend et frontend travaillent EN PARALLÈLE
 *   4. QA complète    — TypeScript, tests Jest, tests curl des endpoints, intégration frontend
 *   5. PR             — commit, push, création de la Pull Request GitHub
 *
 * Usage :
 *   node scripts/orchestrate.js "ajouter un système de tags aux tâches"
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Chemin absolu de la racine du projet (un niveau au-dessus de /scripts)
const PROJECT_ROOT = path.resolve(__dirname, '..');


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Utilitaires agents Claude
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lance un agent Claude en mode non-interactif (--print).
 *
 * On passe l'instruction via stdin plutôt qu'en argument CLI pour deux raisons :
 *   1. Robustesse : les arguments CLI ont des limites de taille et posent des
 *      problèmes avec les caractères spéciaux (quotes, accents, etc.)
 *   2. Clarté : stdin est conçu pour les données, argv pour les options
 *
 * --dangerously-skip-permissions désactive les prompts de confirmation interactifs.
 * À n'utiliser que dans des environnements contrôlés comme ce pipeline.
 *
 * @param {string} instruction - Le prompt envoyé à Claude
 * @param {{ label?: string, timeout?: number }} options
 * @returns {Promise<string>} La réponse texte de Claude
 */
async function runAgent(instruction, options = {}) {
  const { label = 'agent', timeout = 180000 } = options;
  console.log(`\n🤖 [${label}] Démarrage...`);

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--print', '--dangerously-skip-permissions'], {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
      timeout
    });

    // Envoi de l'instruction via stdin puis fermeture pour signaler EOF à Claude
    proc.stdin.write(instruction);
    proc.stdin.end();

    // Accumulation de la réponse + affichage de progression
    let output = '';
    proc.stdout.on('data', d => { output += d; process.stdout.write('.'); });

    // Les erreurs stderr de Claude sont des logs internes, on les affiche avec le label
    proc.stderr.on('data', d => process.stderr.write(`[${label}] ${d}`));

    proc.on('close', code => {
      console.log(`\n✅ [${label}] Terminé`);
      // Code 0 = succès, tout autre code = erreur
      // On tronque l'output à 500 chars dans le message d'erreur pour la lisibilité
      code === 0
        ? resolve(output)
        : reject(new Error(`Exit ${code}: ${output.slice(-500)}`));
    });
  });
}

/**
 * Lance plusieurs agents Claude en parallèle via Promise.allSettled.
 *
 * On utilise allSettled (et non Promise.all) pour que tous les agents
 * terminent même si l'un d'eux échoue — on peut ainsi voir tous les
 * résultats et décider quoi faire plutôt que d'abandonner au premier échec.
 *
 * @param {{ label: string, instruction: string }[]} agents
 * @returns {Promise<{ label: string, success: boolean, output: string }[]>}
 */
async function runParallel(agents) {
  console.log(`\n⚡ Lancement de ${agents.length} agents en parallèle...`);

  const results = await Promise.allSettled(
    agents.map(({ instruction, label }) => runAgent(instruction, { label }))
  );

  return results.map((r, i) => ({
    label: agents[i].label,
    success: r.status === 'fulfilled',
    output: r.status === 'fulfilled' ? r.value : r.reason.message
  }));
}

/**
 * Extrait un objet JSON de la réponse textuelle de Claude.
 *
 * Claude peut entourer son JSON de texte explicatif ("Voici le plan : {...}").
 * On utilise une regex pour extraire uniquement la partie JSON, ce qui rend
 * le parsing robuste même si Claude ajoute du contexte autour.
 *
 * @param {string} text - La réponse brute de Claude
 * @returns {object} L'objet JSON parsé
 * @throws {Error} Si aucun JSON valide n'est trouvé
 */
function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Aucun JSON trouvé dans : ' + text.slice(0, 200));
  return JSON.parse(match[0]);
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Vérifications d'environnement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vérifie et corrige le fichier .env avant de démarrer le serveur.
 *
 * Deux problèmes fréquents sont traités ici :
 *   1. Le .env n'existe pas — on le crée depuis .env.example
 *   2. JWT_SECRET est vide ou contient encore le placeholder "change_me..."
 *      Dans ce cas on génère un vrai secret cryptographique aléatoire.
 *
 * Sans JWT_SECRET valide, jsonwebtoken lèvera "secretOrPrivateKey must have
 * a value" dès le premier appel à jwt.sign(), rendant l'auth impossible.
 */
function ensureEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env');
  const examplePath = path.join(PROJECT_ROOT, '.env.example');

  // Création du .env depuis .env.example s'il est absent
  if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    console.log('📄 .env créé depuis .env.example');
  }

  if (!fs.existsSync(envPath)) return; // Rien à faire si pas de .env.example non plus

  // Lecture du .env courant
  let env = fs.readFileSync(envPath, 'utf8');

  // Extraction de la valeur de JWT_SECRET
  const jwtMatch = env.match(/JWT_SECRET=(.*)$/m);
  const jwtValue = jwtMatch ? jwtMatch[1].trim() : '';

  // On considère le secret invalide s'il est vide ou contient le placeholder
  const isInvalid = !jwtValue
    || jwtValue === 'change_me_in_production'
    || jwtValue === 'change_me';

  if (isInvalid) {
    console.log('⚙️  JWT_SECRET invalide dans .env — génération automatique...');

    // Génère 32 octets aléatoires cryptographiquement sûrs encodés en hex (64 chars)
    const secret = crypto.randomBytes(32).toString('hex');

    if (env.includes('JWT_SECRET=')) {
      // Remplace la ligne existante
      env = env.replace(/JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`);
    } else {
      // Ajoute la ligne si elle n'existe pas
      env += `\nJWT_SECRET=${secret}`;
    }

    fs.writeFileSync(envPath, env);
    console.log('✅ JWT_SECRET généré et sauvegardé dans .env');
  }
}

/**
 * Vérifie que le frontend compile sans erreurs TypeScript.
 *
 * On utilise `tsc --noEmit` qui vérifie les types sans produire de fichiers.
 * C'est plus rapide qu'un vrai build et suffisant pour détecter les erreurs
 * de types qui empêcheraient l'app de démarrer.
 *
 * @returns {{ ok: boolean, errors: string }}
 */
function checkTypeScript() {
  console.log('\n🔷 Vérification TypeScript frontend...');
  try {
    execSync('npx tsc --noEmit', {
      cwd: path.join(PROJECT_ROOT, 'client'),
      stdio: 'pipe',
      encoding: 'utf8'
    });
    console.log('✅ TypeScript OK');
    return { ok: true, errors: '' };
  } catch (err) {
    // tsc retourne un code non-0 en cas d'erreur — les détails sont dans stdout
    const errors = err.stdout || err.message;
    console.log('❌ Erreurs TypeScript détectées');
    return { ok: false, errors };
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Serveur de test et tests d'endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Démarre le serveur backend Express en arrière-plan pour les tests curl.
 *
 * On détecte que le serveur est prêt en écoutant son stdout — il doit
 * logger "running" au démarrage (ex: "Server running on port 3001").
 * Un timeout de 5s est prévu si ce message n'apparaît pas (ex: serveur
 * qui démarre mais ne log pas).
 *
 * IMPORTANT : toujours appeler server.stop() après les tests, idéalement
 * dans un bloc finally pour garantir l'arrêt même en cas d'erreur.
 *
 * @returns {Promise<{ stop: () => void }>}
 */
function startServer() {
  console.log('\n🟢 Démarrage du serveur backend pour tests...');

  // S'assure que le .env est correct avant de démarrer
  ensureEnv();

  const proc = spawn('node', ['server/src/index.js'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, PORT: '3001', NODE_ENV: 'test' },
    stdio: 'pipe'
  });

  return new Promise((resolve) => {
    let ready = false;

    proc.stdout.on('data', d => {
      if (!ready && d.toString().includes('running')) {
        ready = true;
        console.log('✅ Serveur prêt sur port 3001');
        resolve({
          stop: () => {
            proc.kill();
            console.log('🔴 Serveur arrêté');
          }
        });
      }
    });

    // Fallback : si le serveur démarre mais ne log pas "running" en 5s
    setTimeout(() => {
      if (!ready) {
        ready = true;
        console.log('⏱️  Serveur démarré (timeout atteint, pas de log "running" détecté)');
        resolve({ stop: () => proc.kill() });
      }
    }, 5000);
  });
}

/**
 * Teste une liste d'endpoints API via curl et retourne les résultats.
 *
 * Les routes sont testées dans l'ordre — c'est important car certaines
 * dépendent des précédentes (ex: login doit venir après register, et
 * les routes protégées ont besoin du token obtenu au login).
 *
 * Capture automatique du token JWT : si une réponse de login/register
 * contient un champ "token", il est stocké dans le contexte local et
 * utilisé automatiquement pour les routes avec "useToken": true.
 *
 * @param {{ method, path, body, expectedStatus, description, useToken }[]} routes
 * @returns {{ description, ok, status, expected, body }[]}
 */
function testEndpoints(routes) {
  console.log('\n🔌 Test des endpoints API...');
  const results = [];

  // Contexte partagé entre les appels — permet de passer le token de login
  // aux routes protégées sans intervention manuelle
  const context = { token: null };

  for (const route of routes) {
    const { method, path: p, body, expectedStatus, description, useToken } = route;

    // Construction des headers curl
    const headers = ['-H "Content-Type: application/json"'];
    if (useToken && context.token) {
      headers.push(`-H "Authorization: Bearer ${context.token}"`);
    }

    // Corps de la requête (échappement des quotes pour le shell)
    const bodyStr = body ? JSON.stringify(body) : null;
    const bodyFlag = bodyStr ? `-d '${bodyStr.replace(/'/g, "'\\''")}'` : '';

    // -s : silencieux, -o : output dans un fichier, -w : format du résultat (code HTTP)
    const cmd = `curl -s -o /tmp/curl_body -w "%{http_code}" -X ${method} ${headers.join(' ')} ${bodyFlag} http://localhost:3001${p}`;

    try {
      const status = execSync(cmd, { encoding: 'utf8' }).trim();
      const responseBody = execSync('cat /tmp/curl_body', { encoding: 'utf8' });
      const ok = status === String(expectedStatus);

      // Capture automatique du token JWT après login ou register réussi
      if (ok && (p.includes('login') || p.includes('register'))) {
        try {
          const parsed = JSON.parse(responseBody);
          if (parsed.token) {
            context.token = parsed.token;
            console.log('  🔑 Token JWT capturé pour les routes protégées');
          }
        } catch {} // Pas grave si la réponse n'est pas du JSON
      }

      results.push({ description, ok, status, expected: expectedStatus, body: responseBody.slice(0, 300) });
      console.log(`  ${ok ? '✅' : '❌'} ${description} — HTTP ${status} (attendu ${expectedStatus})`);
      if (!ok) console.log(`     Réponse : ${responseBody.slice(0, 300)}`);

    } catch (err) {
      results.push({ description, ok: false, status: 'ERROR', error: err.message });
      console.log(`  ❌ ${description} — Erreur curl : ${err.message}`);
    }
  }

  return results;
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Pipeline principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pipeline principal : implémente une feature de A à Z.
 *
 * @param {string} featureDescription - Description en langage naturel de la feature
 */
async function addFeature(featureDescription) {
  console.log('\n🚀 Pipeline Claude — Ajout de fonctionnalité');
  console.log('='.repeat(50));
  console.log('Feature :', featureDescription);
  console.log('='.repeat(50));


  // ── Étape 0 : faisabilité ──────────────────────────────────────────────────
  //
  // Un agent vérifie que la demande est cohérente avec l'architecture
  // existante avant de lancer tout le pipeline. Évite de gaspiller du temps
  // sur une feature mal définie ou incompatible.
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n🔍 Étape 0/5 — Analyse de faisabilité...');

  const feasRaw = await runAgent(
    `Est-ce faisable dans l'architecture TaskFlow ?\n` +
    `Demande : "${featureDescription}"\n` +
    `Réponds UNIQUEMENT avec ce JSON (pas d'autre texte) :\n` +
    `{ "feasible": true/false, "reason": "explication courte", "risks": ["risque éventuel"] }`,
    { label: 'feasibility' }
  );

  const feas = extractJson(feasRaw);
  console.log('\n📊 Faisabilité :', feas.reason);

  if (!feas.feasible) {
    console.error('❌ Feature jugée non faisable :', feas.reason);
    process.exit(1);
  }
  if (feas.risks?.length) {
    console.log('⚠️  Risques identifiés :', feas.risks.join(', '));
  }


  // ── Étape 1 : planification ────────────────────────────────────────────────
  //
  // Un agent analyse le codebase et produit un plan JSON structuré.
  // Ce plan est utilisé par toutes les étapes suivantes — il définit
  // la branche git, les fichiers à créer/modifier, et les endpoints à tester.
  //
  // On demande aussi à Claude de décrire les apiRoutes dans l'ordre logique
  // d'appel (register → login → routes protégées) car testEndpoints() les
  // exécute séquentiellement et capture le token au fur et à mesure.
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📋 Étape 1/5 — Planification...');

  const planRaw = await runAgent(
    `Tu es l'orchestrateur du projet TaskFlow. L'utilisateur veut :\n` +
    `"${featureDescription}"\n\n` +
    `Analyse le codebase existant (server/src/ et client/src/) et retourne UNIQUEMENT ce JSON :\n` +
    `{\n` +
    `  "branchName": "feature/nom-court-en-kebab-case",\n` +
    `  "backendFiles": ["server/src/routes/xxx.js"],\n` +
    `  "frontendFiles": ["client/src/components/xxx.tsx"],\n` +
    `  "testFiles": ["server/tests/xxx.test.js"],\n` +
    `  "apiRoutes": [\n` +
    `    {\n` +
    `      "method": "POST",\n` +
    `      "path": "/auth/register",\n` +
    `      "body": { "email": "test@test.com", "password": "password123", "name": "Test User" },\n` +
    `      "expectedStatus": 201,\n` +
    `      "description": "Register utilisateur",\n` +
    `      "useToken": false\n` +
    `    }\n` +
    `  ],\n` +
    `  "summary": "Description courte de ce qui va être fait"\n` +
    `}\n\n` +
    `IMPORTANT pour apiRoutes :\n` +
    `- Liste TOUS les endpoints dans l'ordre logique (register → login → routes protégées)\n` +
    `- "useToken": true pour les routes qui nécessitent un JWT en Authorization header\n` +
    `- Les body doivent être des valeurs réelles et valides qui fonctionneront`,
    { label: 'planificateur' }
  );

  const plan = extractJson(planRaw);
  console.log('\n📄 Plan :', plan.summary);
  console.log('   Branche :', plan.branchName);
  console.log('   Endpoints à tester :', (plan.apiRoutes || []).length);


  // ── Étape 2 : branche git ──────────────────────────────────────────────────
  //
  // On crée la branche feature. Si elle existe déjà (ex: retry après échec),
  // on bascule dessus plutôt que d'échouer.
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`\n🌿 Étape 2/5 — Création branche ${plan.branchName}...`);

  try {
    execSync(`git checkout -b ${plan.branchName}`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
  } catch {
    // La branche existe déjà — on se contente de basculer dessus
    execSync(`git checkout ${plan.branchName}`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
  }


  // ── Étape 3 : développement en parallèle ──────────────────────────────────
  //
  // Les agents backend et frontend travaillent simultanément via runParallel().
  // C'est la partie la plus longue — elle prend généralement 2 à 5 minutes.
  //
  // Les instructions sont volontairement très précises et répétitives sur
  // les règles à respecter, car chaque agent a son propre contexte isolé
  // et ne "voit" pas ce que l'autre fait.
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n💻 Étape 3/5 — Développement (backend + frontend en parallèle)...');

  await runParallel([
    {
      label: 'backend',
      instruction:
        `Implémente la partie BACKEND de cette feature : "${featureDescription}".\n` +
        `Fichiers à créer/modifier : ${JSON.stringify(plan.backendFiles)}.\n\n` +
        `Règles OBLIGATOIRES :\n` +
        `- require('dotenv').config() doit être la PREMIÈRE ligne de server/src/index.js, avant tout autre require\n` +
        `- Toutes les variables d'env (JWT_SECRET, etc.) sont lues via process.env APRÈS dotenv.config()\n` +
        `- async/await sur tous les handlers Express\n` +
        `- Validation Joi des inputs\n` +
        `- Erreurs au format { error: string }\n` +
        `- Tests dans server/tests/\n` +
        `- module.exports = app avant listen()\n` +
        `- Le serveur DOIT logger "Server running on port XXXX" au démarrage\n` +
        `- Teste mentalement chaque route : les endpoints doivent réellement fonctionner\n` +
        `- Monte les nouvelles routes dans server/src/index.js`
    },
    {
      label: 'frontend',
      instruction:
        `Implémente la partie FRONTEND de cette feature : "${featureDescription}".\n` +
        `Fichiers à créer/modifier : ${JSON.stringify(plan.frontendFiles)}.\n\n` +
        `Règles OBLIGATOIRES :\n` +
        `- @tanstack/react-query v5 : useQuery({ queryKey, queryFn }), useMutation({ mutationFn })\n` +
        `- TypeScript STRICT : types de retour explicites sur toutes les fonctions async\n` +
        `- Axios via l'instance dans src/api/client.ts\n` +
        `- OBLIGATOIRE : modifier client/src/App.tsx pour intégrer les nouvelles pages/routes\n` +
        `- OBLIGATOIRE : si navigation nécessaire, installer react-router-dom et le configurer dans App.tsx\n` +
        `- L'app doit être navigable et fonctionnelle dès le démarrage\n` +
        `- Pas de composants créés mais non utilisés — tout doit être branché dans App.tsx`
    }
  ]);


  // ── Étape 4 : QA complète ──────────────────────────────────────────────────
  //
  // Quatre niveaux de vérification dans l'ordre logique :
  //   4a. TypeScript  — compilation sans erreurs
  //   4b. Jest        — tests unitaires backend
  //   4c. curl        — endpoints réellement fonctionnels (serveur lancé/arrêté)
  //   4d. Intégration — frontend correctement branché dans App.tsx
  //
  // Chaque niveau peut déclencher une correction automatique par un agent.
  // En cas d'échec persistant sur les endpoints, on rollback vers main.
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n🧪 Étape 4/5 — Vérification qualité complète...');


  // 4a — TypeScript ────────────────────────────────────────────────────────
  let tsCheck = checkTypeScript();

  if (!tsCheck.ok) {
    console.log('\n🔧 Correction des erreurs TypeScript...');
    await runAgent(
      `Corrige TOUTES les erreurs TypeScript dans le frontend.\n\n` +
      `Erreurs détectées :\n${tsCheck.errors}\n\n` +
      `Règles :\n` +
      `- Ne change pas la logique métier, corrige uniquement les types\n` +
      `- Pas de "any" sauf si vraiment inévitable (justifie en commentaire)\n` +
      `- Types de retour explicites sur toutes les fonctions async`,
      { label: 'ts-fixer', timeout: 120000 }
    );

    // Nouvelle vérification après correction
    tsCheck = checkTypeScript();
    if (!tsCheck.ok) {
      console.error('\n❌ Erreurs TypeScript persistantes après correction — rollback vers main');
      execSync('git checkout main', { cwd: PROJECT_ROOT });
      execSync(`git branch -D ${plan.branchName}`, { cwd: PROJECT_ROOT });
      process.exit(1);
    }
  }


  // 4b — Tests Jest ────────────────────────────────────────────────────────
  console.log('\n🧪 Tests Jest backend...');
  await runAgent(
    `Lance les tests backend : cd server && npm test\n` +
    `Corrige les erreurs jusqu'à ce que tous les tests passent.\n` +
    `Retourne PASS ou FAIL avec les détails.`,
    { label: 'jest-qa', timeout: 180000 }
  );


  // 4c — Tests curl des endpoints ──────────────────────────────────────────
  //
  // On démarre le serveur, on teste tous les endpoints dans l'ordre,
  // puis on l'arrête dans un bloc finally pour garantir l'arrêt même
  // si une erreur est levée pendant les tests.
  // ────────────────────────────────────────────────────────────────────────
  if (plan.apiRoutes?.length) {

    // Premier run de tests
    let endpointResults;
    const server = await startServer();
    await new Promise(r => setTimeout(r, 2000)); // Délai pour laisser le serveur s'initialiser complètement

    try {
      endpointResults = testEndpoints(plan.apiRoutes);
    } finally {
      // Arrêt garanti du serveur même si testEndpoints() lève une exception
      server.stop();
    }

    // Si des endpoints échouent, on demande à Claude de corriger
    const failing = endpointResults.filter(r => !r.ok);
    if (failing.length > 0) {
      console.log(`\n🔧 ${failing.length} endpoint(s) en échec — correction en cours...`);
      await runAgent(
        `Ces endpoints API ne fonctionnent pas correctement. Corrige-les.\n\n` +
        `Problèmes détectés :\n` +
        failing.map(r =>
          `- ${r.description} : HTTP ${r.status} (attendu ${r.expected})\n  Réponse : ${r.body || r.error}`
        ).join('\n') +
        `\n\nPoints à vérifier :\n` +
        `- Les routes sont bien montées dans server/src/index.js\n` +
        `- require('dotenv').config() est en première ligne de index.js\n` +
        `- La validation Joi ne rejette pas les données de test\n` +
        `- Les réponses correspondent aux status HTTP attendus`,
        { label: 'api-fixer', timeout: 180000 }
      );

      // Second run après correction — même pattern try/finally
      let retestResults;
      const server2 = await startServer();
      await new Promise(r => setTimeout(r, 2000));

      try {
        retestResults = testEndpoints(plan.apiRoutes);
      } finally {
        // Arrêt garanti même en cas d'erreur durant le re-test
        server2.stop();
      }

      const stillFailing = retestResults.filter(r => !r.ok);
      if (stillFailing.length > 0) {
        console.error('\n❌ Endpoints toujours en échec après correction — rollback vers main');
        console.error(stillFailing.map(r => `  - ${r.description}`).join('\n'));
        execSync('git checkout main', { cwd: PROJECT_ROOT });
        execSync(`git branch -D ${plan.branchName}`, { cwd: PROJECT_ROOT });
        process.exit(1);
      }
    }

    console.log('\n✅ Tous les endpoints fonctionnent correctement');
  }


  // 4d — Intégration frontend ──────────────────────────────────────────────
  console.log('\n🔍 Vérification intégration frontend...');
  await runAgent(
    `Vérifie que le frontend est correctement intégré pour la feature : "${featureDescription}"\n\n` +
    `Checklist OBLIGATOIRE — corrige tout point manquant :\n` +
    `1. App.tsx contient les nouvelles routes/pages\n` +
    `2. Un utilisateur peut naviguer vers la feature sans modifier du code\n` +
    `3. Les appels API utilisent l'instance Axios de src/api/client.ts\n` +
    `4. Aucun composant créé n'est laissé non branché dans l'application`,
    { label: 'frontend-integration', timeout: 120000 }
  );


  // ── Étape 5 : commit + push + PR ──────────────────────────────────────────
  //
  // On commit tout ce qui a été modifié pendant le pipeline (code + éventuelles
  // corrections QA), on pousse sur GitHub, et un agent crée la PR via MCP GitHub.
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n📬 Étape 5/5 — Création de la Pull Request...');

  // Conventional commit format : feat: <description tronquée à 60 chars>
  const commitMsg = `feat: ${featureDescription.substring(0, 60)}`;

  // Échappement des quotes simples dans le message pour éviter les erreurs shell
  execSync(`git add -A && git commit -m '${commitMsg.replace(/'/g, "'\\''")}'`, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit'
  });

  execSync(`git push origin ${plan.branchName}`, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit'
  });

  // L'agent pr-creator utilise le serveur MCP GitHub pour créer la PR via l'API
  await runAgent(
    `Crée une Pull Request GitHub pour le repo taskflow, branche ${plan.branchName} vers main.\n` +
    `Title : "feat: ${featureDescription.substring(0, 60)}"\n` +
    `Body en markdown :\n` +
    `## Résumé\n${plan.summary}\n\n` +
    `## Fichiers modifiés\n` +
    `Backend : ${JSON.stringify(plan.backendFiles)}\n` +
    `Frontend : ${JSON.stringify(plan.frontendFiles)}\n\n` +
    `## Endpoints API\n` +
    (plan.apiRoutes || []).map(r => `- \`${r.method} ${r.path}\` — ${r.description}`).join('\n') + '\n\n' +
    `## Comment tester\n` +
    `1. \`cd server && npm test\` — tous les tests doivent passer\n` +
    `2. \`cd client && npx tsc --noEmit\` — pas d'erreurs TypeScript\n` +
    `3. \`npm run dev:server\` + \`npm run dev:client\`\n` +
    `4. Naviguer dans l'app et tester la feature end-to-end`,
    { label: 'pr-creator' }
  );

  console.log('\n✨ Pipeline terminé ! La PR est prête à être reviewée et mergée.');
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Point d'entrée
// ─────────────────────────────────────────────────────────────────────────────

// process.argv contient : ['node', 'scripts/orchestrate.js', 'arg1', 'arg2', ...]
// On prend tout à partir de l'index 2 et on joint avec des espaces pour
// permettre des descriptions multi-mots sans quotes obligatoires
const feature = process.argv.slice(2).join(' ');

if (!feature) {
  console.error('Usage : node scripts/orchestrate.js "description de la feature"');
  console.error('Exemple : node scripts/orchestrate.js "ajouter un système de tags aux tâches"');
  process.exit(1);
}

addFeature(feature).catch(err => {
  console.error('\n❌ Erreur pipeline :', err.message);
  process.exit(1);
});