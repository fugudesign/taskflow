# TaskFlow — Contexte projet pour Claude

## 🎯 Description
TaskFlow est une app de gestion de tâches fullstack.
- **Backend** : Node.js + Express, port 3001
- **Frontend** : React + TypeScript, port 3000
- **Auth** : JWT (HS256), tokens dans Authorization header
- **BDD** : In-memory pour le dev, PostgreSQL en prod (pas encore implémenté)

## 📁 Architecture
```
server/src/
  routes/      → une route = un fichier (tasks.js, auth.js, users.js)
  middleware/  → auth.js (vérif JWT), validate.js (Joi schemas)
  models/      → types et structures de données
  index.js     → point d'entrée, montage des routes

client/src/
  api/         → client.ts (instance Axios configurée)
  components/  → composants React réutilisables
  hooks/       → hooks custom React Query
```

## 📐 Conventions de code

### Backend (Node/Express)
- Toujours valider les inputs avec Joi (voir middleware/validate.js)
- Async/await OBLIGATOIRE sur tous les handlers Express, même les simples
- Les erreurs retournent TOUJOURS `{ error: string, details?: any }`
- HTTP codes standards : 200, 201, 204, 400, 401, 403, 404, 500
- `module.exports = app` avant `app.listen()` pour compatibilité tests
- Utiliser le pattern `if (require.main === module)` avant listen()

### Frontend (React/TS)
- Composants fonctionnels uniquement, pas de classes
- @tanstack/react-query (v5) pour tous les appels API — PAS react-query v3
- Syntaxe v5 : useQuery({ queryKey: ['tasks'], queryFn: fetchTasks })
- Axios avec instance configurée dans src/api/client.ts
- Pas de `any` TypeScript sauf exception justifiée en commentaire

### Git
- Branches : feature/xxx, fix/xxx, chore/xxx
- Commits : conventional commits (feat:, fix:, chore:, docs:, test:)
- JAMAIS commiter directement sur main

## 🧪 Tests
- Backend : Jest + Supertest → `cd server && npm test`
- Frontend : React Testing Library → `cd client && npm test`
- Tous les tests : `npm run test:all` (depuis racine)
- Coverage minimum 80% pour merger une PR

## 🔐 Sécurité
- JWT_SECRET dans .env, JAMAIS hardcodé
- Tokens expirent en 24h
- Mots de passe hashés avec bcrypt (salt rounds: 12)
- Ne JAMAIS retourner le champ `password` dans les réponses API

## 🚀 Commandes utiles
- Backend dev : `npm run dev:server` (depuis racine) ou `cd server && npm run dev`
- Frontend dev : `npm run dev:client` (depuis racine) ou `cd client && npm start`
- Tous les tests : `npm run test:all` (depuis racine)

## ⛔ Règles absolues
- Ne JAMAIS committer .env ou des secrets
- Ne JAMAIS modifier main directement
- Ne JAMAIS merger sans que les tests passent
- Mettre à jour ce CLAUDE.md si l'architecture évolue
