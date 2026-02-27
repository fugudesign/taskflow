const express = require('express');
const authenticate = require('../middleware/auth');
const { findById } = require('../models/user');

const router = express.Router();

router.use(authenticate);

// GET /users/me
router.get('/me', async (req, res) => {
  const user = findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ id: user.id, name: user.name, email: user.email });
});

module.exports = router;
