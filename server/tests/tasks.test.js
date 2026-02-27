const request = require('supertest');
const app = require('../src/index');

describe('Tasks API', () => {
  it('GET /tasks retourne un tableau', async () => {
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /tasks crée une tâche', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'Test task', description: 'Une description' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Test task');
    expect(res.body.id).toBeDefined();
});

  it('POST /tasks sans title retourne 400', async () => {
    const res = await request(app).post('/tasks').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
