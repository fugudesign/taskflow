const { randomUUID } = require('crypto');

const tasks = [];

const findAll = (userId) => tasks.filter((t) => t.userId === userId);
const findById = (id) => tasks.find((t) => t.id === id);

const create = ({ title, description, userId }) => {
  const task = {
    id: randomUUID(),
    title,
    description: description || '',
    done: false,
    userId,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  return task;
};

const update = (id, data) => {
  const task = findById(id);
  if (!task) return null;
  Object.assign(task, data);
  return task;
};

const remove = (id) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return false;
  tasks.splice(index, 1);
  return true;
};

module.exports = { tasks, findAll, findById, create, update, remove };
