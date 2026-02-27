require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');

const authRouter = require('./routes/auth');
const tasksRouter = require('./routes/tasks');
const usersRouter = require('./routes/users');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/auth', authRouter);
app.use('/tasks', tasksRouter);
app.use('/users', usersRouter);

const PORT = process.env.PORT || 3001;
module.exports = app;

if (require.main === module) {
  app.listen(PORT);
}
