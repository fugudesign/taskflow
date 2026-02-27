const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.env.TASKFLOW_ROOT || path.resolve(__dirname, '..');

const server = new Server(
  { name: 'taskflow-tools', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'run_tests',
      description: 'Lance les tests backend Jest',
      inputSchema: { type: 'object', properties: {}, required: [] }
    },
    {
      name: 'check_conventions',
      description: 'Vérifie les conventions du projet sur un fichier',
      inputSchema: {
        type: 'object',
        properties: { file: { type: 'string', description: 'Chemin relatif du fichier' } },
        required: ['file']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'run_tests') {
    try {
      const output = execSync('npm test -- --passWithNoTests 2>&1', {
        cwd: path.join(PROJECT_ROOT, 'server'),
        encoding: 'utf8',
        timeout: 60000
      });
      return { content: [{ type: 'text', text: output }] };
    } catch (err) {
      return { content: [{ type: 'text', text: err.stdout || err.message }] };
    }
  }

  if (name === 'check_conventions') {
    const filePath = path.resolve(PROJECT_ROOT, args.file);
    if (!fs.existsSync(filePath)) {
      return { content: [{ type: 'text', text: `Fichier non trouvé : ${filePath}` }] };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const issues = [];
    if (/\.then\(/.test(content)) issues.push('❌ .then() — utilise async/await');
    if (/\bvar\b/.test(content)) issues.push('❌ var — utilise const/let');
    if (/console\.log/.test(content)) issues.push('⚠️  console.log à retirer');
    return { content: [{ type: 'text', text: issues.length ? issues.join('\n') : '✅ Conventions OK' }] };
  }

  return { content: [{ type: 'text', text: `Outil inconnu : ${name}` }] };
});

const transport = new StdioServerTransport();
server.connect(transport);