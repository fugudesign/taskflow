const { randomUUID } = require('crypto');

const users = [];

const findByEmail = (email) => users.find((u) => u.email === email);
const findById = (id) => users.find((u) => u.id === id);

const create = ({ name, email, password }) => {
  const user = {
    id: randomUUID(),
    name,
    email,
    password,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  return user;
};

module.exports = { users, findByEmail, findById, create };
