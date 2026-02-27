process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../src/index');

describe('Tasks API', () => {
  let token;

  beforeAll(async () => {
    const res = await request(app).post('/auth/register').send({
      name: 'Test User',
      email: 'taskuser@example.com',
      password: 'password123',
    });
    token = res.body.token;
  });

  it('GET /tasks retourne un tableau', async () => {
    const res = await request(app)
      .get('/tasks')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /tasks crée une tâche', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test task', description: 'Une description' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Test task');
    expect(res.body.id).toBeDefined();
  });

  it('POST /tasks sans title retourne 400', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
