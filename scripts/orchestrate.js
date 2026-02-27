#!/usr/bin/env node
const { execSync, spawn } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Lance un agent Claude via stdin
async function runAgent(instruction, options = {}) {
  const { label = 'agent', timeout = 180000 } = options;
  console.log(`\n🤖 [${label}] Démarrage...`);
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--print', '--dangerously-skip-permissions'], {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
      timeout
    });
    proc.stdin.write(instruction);
    proc.stdin.end();
    let output = '';
    proc.stdout.on('data', d => { output += d; process.stdout.write('.'); });
    proc.stderr.on('data', d => process.stderr.write(`[${label}] ${d}`));
    proc.on('close', code => {
      console.log(`\n✅ [${label}] Terminé`);
      code === 0 ? resolve(output) : reject(new Error(`Exit ${code}: ${output.slice(-500)}`));
    });
  });
}

// Lance plusieurs agents en parallèle
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

// Extrait le JSON d'une réponse Claude
function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Aucun JSON trouvé dans : ' + text.slice(0, 200));
  return JSON.parse(match[0]);
}

// Vérifie la compilation TypeScript frontend
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
    const errors = err.stdout || err.message;
    console.log('❌ Erreurs TypeScript détectées');
    return { ok: false, errors };
  }
}

// Démarre le serveur backend et retourne une fonction stop()
function startServer() {
  console.log('\n🟢 Démarrage du serveur backend pour tests...');
  try { execSync('cp -n .env.example .env', { cwd: PROJECT_ROOT }); } catch {}

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
        resolve({ stop: () => { proc.kill(); console.log('🔴 Serveur arrêté'); } });
      }
    });
    setTimeout(() => {
      if (!ready) {
        ready = true;
        console.log('⏱️  Serveur démarré (timeout atteint)');
        resolve({ stop: () => proc.kill() });
      }
    }, 5000);
  });
}

// Teste les endpoints curl et retourne les résultats
function testEndpoints(routes) {
  console.log('\n🔌 Test des endpoints API...');
  const results = [];
  // Stocke les tokens obtenus dynamiquement (ex: après login)
  const context = {};

  for (const route of routes) {
    const { method, path: p, body, expectedStatus, description, useToken } = route;
    const headers = ['-H "Content-Type: application/json"'];
    if (useToken && context.token) {
      headers.push(`-H "Authorization: Bearer ${context.token}"`);
    }
    const bodyStr = body ? JSON.stringify(body) : null;
    const bodyFlag = bodyStr ? `-d '${bodyStr.replace(/'/g, "'\\''")}'` : '';
    const cmd = `curl -s -o /tmp/curl_body -w "%{http_code}" -X ${method} ${headers.join(' ')} ${bodyFlag} http://localhost:3001${p}`;

    try {
      const status = execSync(cmd, { encoding: 'utf8' }).trim();
      const responseBody = execSync('cat /tmp/curl_body', { encoding: 'utf8' });
      const ok = status === String(expectedStatus);

      // Capture le token si c'est une réponse de login/register
      if (ok && (p.includes('login') || p.includes('register'))) {
        try {
          const parsed = JSON.parse(responseBody);
          if (parsed.token) context.token = parsed.token;
        } catch {}
      }

      results.push({ description, ok, status, expected: expectedStatus, body: responseBody.slice(0, 300) });
      console.log(`  ${ok ? '✅' : '❌'} ${description} — HTTP ${status} (attendu ${expectedStatus})`);
      if (!ok) console.log(`     Réponse : ${responseBody.slice(0, 300)}`);
    } catch (err) {
      results.push({ description, ok: false, status: 'ERROR', error: err.message });
      console.log(`  ❌ ${description} — Erreur : ${err.message}`);
    }
  }
  return results;
}

async function addFeature(featureDescription) {
  console.log('\n🚀 Pipeline Claude — Ajout de fonctionnalité');
  console.log('='.repeat(50));
  console.log('Feature :', featureDescription);
  console.log('='.repeat(50));

  // ── Étape 0 : faisabilité ────────────────────────────────────────────────
  console.log('\n🔍 Étape 0/5 — Analyse de faisabilité...');
  const feasRaw = await runAgent(
    `Est-ce faisable dans l'architecture TaskFlow ?\n` +
    `Demande : "${featureDescription}"\n` +
    `Réponds UNIQUEMENT avec ce JSON :\n` +
    `{ "feasible": true/false, "reason": "explication", "risks": ["risque 1"] }`,
    { label: 'feasibility' }
  );
  const feas = extractJson(feasRaw);
  console.log('\n📊 Faisabilité :', feas.reason);
  if (!feas.feasible) { console.error('❌ Non faisable :', feas.reason); process.exit(1); }
  if (feas.risks?.length) console.log('⚠️  Risques :', feas.risks.join(', '));

  // ── Étape 1 : planification ──────────────────────────────────────────────
  console.log('\n📋 Étape 1/5 — Planification...');
  const planRaw = await runAgent(
    `Tu es l'orchestrateur du projet TaskFlow. L'utilisateur veut :\n` +
    `"${featureDescription}"\n\n` +
    `Analyse le codebase et retourne UNIQUEMENT ce JSON :\n` +
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
    `  "summary": "Description courte"\n` +
    `}\n\n` +
    `IMPORTANT pour apiRoutes :\n` +
    `- Liste TOUS les endpoints dans l'ordre logique d'appel (register avant login avant routes protégées)\n` +
    `- Pour les routes protégées, mets "useToken": true (le token sera capturé automatiquement après login)\n` +
    `- Les body doivent être des exemples valides qui fonctionneront réellement`,
    { label: 'planificateur' }
  );
  const plan = extractJson(planRaw);
  console.log('\n📄 Plan :', plan.summary);
  console.log('   Branche :', plan.branchName);
  console.log('   Endpoints à tester :', (plan.apiRoutes || []).length);

  // ── Étape 2 : branche git ────────────────────────────────────────────────
  console.log(`\n🌿 Étape 2/5 — Création branche ${plan.branchName}...`);
  try {
    execSync(`git checkout -b ${plan.branchName}`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
  } catch {
    execSync(`git checkout ${plan.branchName}`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
  }

  // ── Étape 3 : développement en parallèle ────────────────────────────────
  console.log('\n💻 Étape 3/5 — Développement (backend + frontend en parallèle)...');
  await runParallel([
    {
      label: 'backend',
      instruction:
        `Implémente la partie BACKEND de cette feature : "${featureDescription}".\n` +
        `Fichiers à créer/modifier : ${JSON.stringify(plan.backendFiles)}.\n\n` +
        `Règles OBLIGATOIRES :\n` +
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
        `- TypeScript STRICT : types de retour explicites sur toutes les fonctions async (ex: Promise<AuthResponse>)\n` +
        `- Axios via l'instance dans src/api/client.ts\n` +
        `- OBLIGATOIRE : modifier client/src/App.tsx pour intégrer les nouvelles pages/routes\n` +
        `- OBLIGATOIRE : si navigation nécessaire, installer react-router-dom et le configurer dans App.tsx\n` +
        `- L'app doit être navigable et fonctionnelle dès le démarrage\n` +
        `- Pas de composants créés mais non utilisés — tout doit être branché`
    }
  ]);

  // ── Étape 4 : QA complète ────────────────────────────────────────────────
  console.log('\n🧪 Étape 4/5 — Vérification qualité complète...');

  // 4a : TypeScript
  let tsCheck = checkTypeScript();
  if (!tsCheck.ok) {
    console.log('\n🔧 Correction TypeScript...');
    await runAgent(
      `Corrige TOUTES les erreurs TypeScript dans le frontend.\n\n` +
      `Erreurs :\n${tsCheck.errors}\n\n` +
      `Règles : ne change pas la logique, pas de any sauf si inévitable.`,
      { label: 'ts-fixer', timeout: 120000 }
    );
    tsCheck = checkTypeScript();
    if (!tsCheck.ok) {
      console.error('\n❌ TypeScript toujours en erreur — rollback');
      execSync('git checkout main', { cwd: PROJECT_ROOT });
      execSync(`git branch -D ${plan.branchName}`, { cwd: PROJECT_ROOT });
      process.exit(1);
    }
  }

  // 4b : tests Jest
  console.log('\n🧪 Tests Jest backend...');
  await runAgent(
    `Lance les tests backend : cd server && npm test\n` +
    `Corrige jusqu'à ce que tous les tests passent. Retourne PASS ou FAIL.`,
    { label: 'jest-qa', timeout: 180000 }
  );

  // 4c : tests curl des endpoints
  if (plan.apiRoutes?.length) {
    const server = await startServer();
    await new Promise(r => setTimeout(r, 2000));

    const endpointResults = testEndpoints(plan.apiRoutes);
    server.stop();

    const failing = endpointResults.filter(r => !r.ok);
    if (failing.length > 0) {
      console.log(`\n🔧 ${failing.length} endpoint(s) en échec — correction...`);
      await runAgent(
        `Ces endpoints API ne fonctionnent pas. Corrige-les.\n\n` +
        `Problèmes :\n` +
        failing.map(r => `- ${r.description} : HTTP ${r.status} (attendu ${r.expected})\n  Réponse : ${r.body || r.error}`).join('\n') +
        `\n\nVérifie : les routes sont bien montées dans index.js, la validation Joi, les réponses retournées.`,
        { label: 'api-fixer', timeout: 180000 }
      );

      const server2 = await startServer();
      await new Promise(r => setTimeout(r, 2000));
      const retestResults = testEndpoints(plan.apiRoutes);
      server2.stop();

      const stillFailing = retestResults.filter(r => !r.ok);
      if (stillFailing.length > 0) {
        console.error('\n❌ Endpoints toujours en échec — rollback');
        console.error(stillFailing.map(r => `  - ${r.description}`).join('\n'));
        execSync('git checkout main', { cwd: PROJECT_ROOT });
        execSync(`git branch -D ${plan.branchName}`, { cwd: PROJECT_ROOT });
        process.exit(1);
      }
    }
    console.log('\n✅ Tous les endpoints fonctionnent');
  }

  // 4d : intégration frontend
  console.log('\n🔍 Vérification intégration frontend...');
  await runAgent(
    `Vérifie que le frontend est correctement intégré pour : "${featureDescription}"\n\n` +
    `Checklist :\n` +
    `1. App.tsx contient les nouvelles routes/pages\n` +
    `2. Un utilisateur peut naviguer vers la feature sans modifier du code\n` +
    `3. Les appels API utilisent src/api/client.ts\n` +
    `4. Aucun composant créé n'est laissé non branché\n\n` +
    `Corrige tout point manquant.`,
    { label: 'frontend-integration', timeout: 120000 }
  );

  // ── Étape 5 : commit + push + PR ────────────────────────────────────────
  console.log('\n📬 Étape 5/5 — Création de la Pull Request...');
  const commitMsg = `feat: ${featureDescription.substring(0, 60)}`;
  execSync(`git add -A && git commit -m '${commitMsg.replace(/'/g, "'\\''")}'`, {
    cwd: PROJECT_ROOT, stdio: 'inherit'
  });
  execSync(`git push origin ${plan.branchName}`, { cwd: PROJECT_ROOT, stdio: 'inherit' });

  await runAgent(
    `Crée une Pull Request GitHub : repo taskflow, branche ${plan.branchName} → main.\n` +
    `Title : "feat: ${featureDescription.substring(0, 60)}"\n` +
    `Body :\n` +
    `## Résumé\n${plan.summary}\n\n` +
    `## Fichiers modifiés\n` +
    `Backend : ${JSON.stringify(plan.backendFiles)}\n` +
    `Frontend : ${JSON.stringify(plan.frontendFiles)}\n\n` +
    `## Endpoints API\n` +
    (plan.apiRoutes || []).map(r => `- \`${r.method} ${r.path}\` — ${r.description}`).join('\n') + '\n\n' +
    `## Comment tester\n` +
    `1. \`cd server && npm test\`\n` +
    `2. \`cd client && npx tsc --noEmit\`\n` +
    `3. \`npm run dev:server\` + \`npm run dev:client\`\n` +
    `4. Naviguer dans l'app et tester la feature`,
    { label: 'pr-creator' }
  );

  console.log('\n✨ Pipeline terminé ! PR prête à merger.');
}

// ── Point d'entrée ──────────────────────────────────────────────────────────
const feature = process.argv.slice(2).join(' ');
if (!feature) {
  console.error('Usage : node scripts/orchestrate.js "description de la feature"');
  process.exit(1);
}

addFeature(feature).catch(err => {
  console.error('\n❌ Erreur pipeline :', err.message);
  process.exit(1);
});