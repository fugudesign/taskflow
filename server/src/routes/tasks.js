const express = require('express');
const Joi = require('joi');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/auth');
const { findAll, findById, create, update, remove } = require('../models/task');

const router = express.Router();

const createSchema = Joi.object({
  title: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).allow('').optional(),
});

const updateSchema = Joi.object({
  title: Joi.string().min(1).max(255).optional(),
  description: Joi.string().max(1000).allow('').optional(),
  done: Joi.boolean().optional(),
}).min(1);

router.use(authenticate);

// GET /tasks
router.get('/', async (req, res) => {
  const tasks = findAll(req.user.id);
  return res.json(tasks);
});

// POST /tasks
router.post('/', validate(createSchema), async (req, res) => {
  const task = create({ ...req.body, userId: req.user.id });
  return res.status(201).json(task);
});

// PATCH /tasks/:id
router.patch('/:id', validate(updateSchema), async (req, res) => {
  const task = findById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  const updated = update(req.params.id, req.body);
  return res.json(updated);
});

// DELETE /tasks/:id
router.delete('/:id', async (req, res) => {
  const task = findById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  remove(req.params.id);
  return res.status(204).send();
});

module.exports = router;
