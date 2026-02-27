const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Stockage en mémoire (simplifié pour le tuto)
let tasks = [];

// GET /tasks
app.get('/tasks', async (req, res) => {
  res.json(tasks);
});

// POST /tasks
app.post('/tasks', async (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const task = { id: Date.now().toString(), title, description, done: false };
  tasks.push(task);
  res.status(201).json(task);
});

// PATCH /tasks/:id
app.patch('/tasks/:id', async (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  Object.assign(task, req.body);
  res.json(task);
});

// DELETE /tasks/:id
app.delete('/tasks/:id', async (req, res) => {
  const index = tasks.findIndex(t => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  tasks.splice(index, 1);
  res.status(204).send();
});

const PORT = process.env.PORT || 3001;
// On exporte app avant listen pour que supertest puisse l'utiliser
module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
