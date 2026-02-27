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
      cwd: PROJECT_ROOT, env: { ...process.env }, timeout
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

async function addFeature(featureDescription) {
  console.log('\n🚀 Pipeline Claude — Ajout de fonctionnalité');
  console.log('='.repeat(50));
  console.log('Feature :', featureDescription);
  console.log('='.repeat(50));

  // Étape 0 : faisabilité
  console.log('\n🔍 Étape 0/5 — Analyse de faisabilité...');
  const feasRaw = await runAgent(
    `Est-ce faisable dans l'architecture TaskFlow ?\n` +
    `Demande : "${featureDescription}"\n` +
    `Réponds UNIQUEMENT avec ce JSON :\n` +
    `{ "feasible": true/false, "reason": "...", "risks": ["..."] }`,
    { label: 'feasibility' }
  );
  const feas = extractJson(feasRaw);
  console.log('\n📊', feas.reason);
  if (!feas.feasible) { console.error('❌ Non faisable'); process.exit(1); }
  if (feas.risks?.length) console.log('⚠️  Risques :', feas.risks.join(', '));

  // Étape 1 : planification
  console.log('\n📋 Étape 1/5 — Planification...');
  const planRaw = await runAgent(
    `Orchestrateur TaskFlow. Feature : "${featureDescription}"\n` +
    `Analyse le codebase et retourne UNIQUEMENT ce JSON :\n` +
    `{ "branchName": "feature/xxx", "backendFiles": [], "frontendFiles": [], "testFiles": [], "summary": "" }`,
    { label: 'planificateur' }
  );
  const plan = extractJson(planRaw);
  console.log('\n📄', plan.summary, '— branche :', plan.branchName);

  // Étape 2 : branche git
  console.log(`\n🌿 Étape 2/5 — Branche ${plan.branchName}...`);
  try {
    execSync(`git checkout -b ${plan.branchName}`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
  } catch {
    execSync(`git checkout ${plan.branchName}`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
  }

  // Étape 3 : dev en parallèle
  console.log('\n💻 Étape 3/5 — Développement (backend + frontend en parallèle)...');
  await runParallel([
    { label: 'backend', instruction:
      `Backend TaskFlow : "${featureDescription}"\n` +
      `Fichiers : ${JSON.stringify(plan.backendFiles)}\n` +
      `Règles : async/await, Joi, { error: string }, tests dans server/tests/` },
    { label: 'frontend', instruction:
      `Frontend TaskFlow : "${featureDescription}"\n` +
      `Fichiers : ${JSON.stringify(plan.frontendFiles)}\n` +
      `Règles : @tanstack/react-query v5, TypeScript strict, Axios via src/api/client.ts` }
  ]);

  // Étape 4 : QA
  console.log('\n🧪 Étape 4/5 — Vérification qualité...');
  await runAgent(
    `QA TaskFlow : "${featureDescription}"\n` +
    `1. Lance : cd server && npm test\n` +
    `2. Vérifie les conventions CLAUDE.md\n` +
    `3. Corrige si nécessaire\n` +
    `4. Retourne PASS ou FAIL avec détails`,
    { label: 'qa', timeout: 240000 }
  );

  // Étape 5 : commit + push + PR
  console.log('\n📬 Étape 5/5 — Pull Request...');
  const msg = `feat: ${featureDescription.substring(0, 60)}`;
  execSync(`git add -A && git commit -m '${msg.replace(/'/g, "'\''")}'`,
    { cwd: PROJECT_ROOT, stdio: 'inherit' });
  execSync(`git push origin ${plan.branchName}`, { cwd: PROJECT_ROOT, stdio: 'inherit' });
  await runAgent(
    `Crée une PR GitHub : repo taskflow, branche ${plan.branchName} → main\n` +
    `Title : "feat: ${featureDescription.substring(0, 60)}"\n` +
    `Body : résumé, fichiers modifiés, instructions de test`,
    { label: 'pr-creator' }
  );
  console.log('\n✨ Pipeline terminé ! Vérifie la PR sur GitHub.');
}

const feature = process.argv.slice(2).join(' ');
if (!feature) {
  console.error('Usage : node scripts/orchestrate.js "description de la feature"');
  process.exit(1);
}
addFeature(feature).catch(err => {
  console.error('\n❌ Erreur :', err.message);
  process.exit(1);
});
