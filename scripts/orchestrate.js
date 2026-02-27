#!/usr/bin/env node
const { execSync, spawn } = require('child_process');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Lance un agent Claude via stdin (robuste pour les instructions longues)
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

// Extrait le JSON d'une réponse Claude (qui peut contenir du texte autour)
function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Aucun JSON trouvé dans : ' + text.slice(0, 200));
  return JSON.parse(match[0]);
}

// Vérifie la compilation TypeScript frontend localement avant de passer à la suite
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

async function addFeature(featureDescription) {
  console.log('\n🚀 Pipeline Claude — Ajout de fonctionnalité');
  console.log('='.repeat(50));
  console.log('Feature :', featureDescription);
  console.log('='.repeat(50));

  // ── Étape 0 : faisabilité ──────────────────────────────────────────────────
  console.log('\n🔍 Étape 0/5 — Analyse de faisabilité...');
  const feasRaw = await runAgent(
    `Est-ce faisable dans l'architecture TaskFlow ?\n` +
    `Demande : "${featureDescription}"\n` +
    `Réponds UNIQUEMENT avec ce JSON (pas d'autre texte) :\n` +
    `{ "feasible": true/false, "reason": "explication", "risks": ["risque 1"] }`,
    { label: 'feasibility' }
  );
  const feas = extractJson(feasRaw);
  console.log('\n📊 Faisabilité :', feas.reason);
  if (!feas.feasible) {
    console.error('❌ Feature jugée non faisable :', feas.reason);
    process.exit(1);
  }
  if (feas.risks?.length) console.log('⚠️  Risques :', feas.risks.join(', '));

  // ── Étape 1 : planification ────────────────────────────────────────────────
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
    `  "summary": "Description courte de ce qui va être fait"\n` +
    `}`,
    { label: 'planificateur' }
  );
  const plan = extractJson(planRaw);
  console.log('\n📄 Plan :', plan.summary);
  console.log('   Branche :', plan.branchName);

  // ── Étape 2 : branche git ──────────────────────────────────────────────────
  console.log(`\n🌿 Étape 2/5 — Création branche ${plan.branchName}...`);
  try {
    execSync(`git checkout -b ${plan.branchName}`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
  } catch {
    execSync(`git checkout ${plan.branchName}`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
  }

  // ── Étape 3 : développement en parallèle ──────────────────────────────────
  console.log('\n💻 Étape 3/5 — Développement (backend + frontend en parallèle)...');
  await runParallel([
    {
      label: 'backend',
      instruction:
        `Implémente la partie BACKEND de cette feature : "${featureDescription}".\n` +
        `Fichiers à créer/modifier : ${JSON.stringify(plan.backendFiles)}.\n` +
        `Règles OBLIGATOIRES (cf CLAUDE.md) :\n` +
        `- async/await sur tous les handlers\n` +
        `- Validation Joi des inputs\n` +
        `- Erreurs au format { error: string }\n` +
        `- Tests dans server/tests/\n` +
        `- module.exports = app avant listen()`
    },
    {
      label: 'frontend',
      instruction:
        `Implémente la partie FRONTEND de cette feature : "${featureDescription}".\n` +
        `Fichiers à créer/modifier : ${JSON.stringify(plan.frontendFiles)}.\n` +
        `Règles OBLIGATOIRES (cf CLAUDE.md) :\n` +
        `- @tanstack/react-query v5 (syntaxe: useQuery({ queryKey, queryFn }))\n` +
        `- Composants fonctionnels TypeScript STRICT — pas de any, types explicites\n` +
        `- Axios via l'instance dans src/api/client.ts\n` +
        `- Les fonctions retournant une Promise doivent avoir un type de retour explicite`
    }
  ]);

  // ── Étape 4 : QA ──────────────────────────────────────────────────────────
  // 4a : compilation TypeScript (vérification locale rapide)
  console.log('\n🧪 Étape 4/5 — Vérification qualité...');
  let tsCheck = checkTypeScript();

  // Si des erreurs TS, on donne une chance à Claude de les corriger
  if (!tsCheck.ok) {
    console.log('\n🔧 Erreurs TypeScript détectées — correction en cours...');
    await runAgent(
      `Le frontend TypeScript a des erreurs de compilation. Corrige-les.\n\n` +
      `Erreurs :\n${tsCheck.errors}\n\n` +
      `Règles :\n` +
      `- Ne change pas la logique métier, corrige uniquement les types\n` +
      `- Pas de any sauf si vraiment inévitable (justifie en commentaire)\n` +
      `- Vérifie que les types de retour des fonctions async sont corrects`,
      { label: 'ts-fixer', timeout: 120000 }
    );

    // Nouvelle vérification après correction
    tsCheck = checkTypeScript();
    if (!tsCheck.ok) {
      console.error('\n❌ Erreurs TypeScript persistantes après correction :');
      console.error(tsCheck.errors);
      console.error('Rollback vers main...');
      execSync('git checkout main', { cwd: PROJECT_ROOT });
      execSync(`git branch -D ${plan.branchName}`, { cwd: PROJECT_ROOT });
      process.exit(1);
    }
  }

  // 4b : tests backend + vérification conventions
  await runAgent(
    `Vérifie la qualité du code développé pour : "${featureDescription}"\n` +
    `1. Lance les tests backend : cd server && npm test\n` +
    `2. Vérifie que les fichiers modifiés respectent CLAUDE.md\n` +
    `3. Corrige les problèmes si nécessaire\n` +
    `4. Retourne un résumé PASS ou FAIL avec détails`,
    { label: 'qa', timeout: 240000 }
  );

  // ── Étape 5 : commit + push + PR ──────────────────────────────────────────
  console.log('\n📬 Étape 5/5 — Création de la Pull Request...');
  const commitMsg = `feat: ${featureDescription.substring(0, 60)}`;
  execSync(`git add -A && git commit -m '${commitMsg.replace(/'/g, "'\\''")}'`, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit'
  });
  execSync(`git push origin ${plan.branchName}`, { cwd: PROJECT_ROOT, stdio: 'inherit' });

  await runAgent(
    `Crée une Pull Request GitHub pour le repo taskflow, branche ${plan.branchName} vers main.\n` +
    `Title : "feat: ${featureDescription.substring(0, 60)}"\n` +
    `Body en markdown :\n` +
    `## Résumé\n${plan.summary}\n\n` +
    `## Fichiers modifiés\n` +
    `Backend : ${JSON.stringify(plan.backendFiles)}\n` +
    `Frontend : ${JSON.stringify(plan.frontendFiles)}\n\n` +
    `## Comment tester\n` +
    `1. cd server && npm test\n` +
    `2. cd client && npx tsc --noEmit\n` +
    `3. Démarrer le projet et tester manuellement`,
    { label: 'pr-creator' }
  );

  console.log('\n✨ Pipeline terminé ! Vérifie la PR sur GitHub et merge quand tu es prêt.');
}

// ── Point d'entrée ────────────────────────────────────────────────────────────
const feature = process.argv.slice(2).join(' ');
if (!feature) {
  console.error('Usage : node scripts/orchestrate.js "description de la feature"');
  process.exit(1);
}

addFeature(feature).catch(err => {
  console.error('\n❌ Erreur pipeline :', err.message);
  process.exit(1);
});