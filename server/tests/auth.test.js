process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const app = require('../src/index');

describe('Auth API', () => {
  describe('POST /auth/register', () => {
    it('crée un compte et retourne un token', async () => {
      const res = await request(app).post('/auth/register').send({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'password123',
      });
      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('alice@example.com');
      expect(res.body.user.password).toBeUndefined();
    });

    it('retourne 400 si email déjà utilisé', async () => {
      await request(app).post('/auth/register').send({
        name: 'Bob',
        email: 'duplicate@example.com',
        password: 'password123',
      });
      const res = await request(app).post('/auth/register').send({
        name: 'Bob2',
        email: 'duplicate@example.com',
        password: 'password456',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('retourne 400 si données invalides', async () => {
      const res = await request(app).post('/auth/register').send({ email: 'bad' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('retourne 400 si mot de passe trop court', async () => {
      const res = await request(app).post('/auth/register').send({
        name: 'Dave',
        email: 'dave@example.com',
        password: 'short',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /auth/login', () => {
    beforeAll(async () => {
      await request(app).post('/auth/register').send({
        name: 'Charlie',
        email: 'charlie@example.com',
        password: 'password123',
      });
    });

    it('retourne un token avec credentials valides', async () => {
      const res = await request(app).post('/auth/login').send({
        email: 'charlie@example.com',
        password: 'password123',
      });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('charlie@example.com');
      expect(res.body.user.password).toBeUndefined();
    });

    it('retourne 401 avec mauvais mot de passe', async () => {
      const res = await request(app).post('/auth/login').send({
        email: 'charlie@example.com',
        password: 'wrongpassword',
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('retourne 401 si email inconnu', async () => {
      const res = await request(app).post('/auth/login').send({
        email: 'unknown@example.com',
        password: 'password123',
      });
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });
  });
});
