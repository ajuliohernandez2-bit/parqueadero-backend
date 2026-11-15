// Pruebas de la API que NO necesitan MongoDB: seguridad, validacion y errores.
process.env.JWT_SECRET = 'secreto-de-pruebas-1234567890';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { app, servidorHttp } = require('../server');

let base;
const token = (rol) => jwt.sign({ id: 'a'.repeat(24), rol }, process.env.JWT_SECRET, { expiresIn: '1h' });
const pedir = (ruta, opciones = {}) => fetch(base + ruta, opciones);
const json = (rol, cuerpo, metodo = 'POST') => ({
  method: metodo,
  headers: { 'Content-Type': 'application/json', ...(rol ? { Authorization: `Bearer ${token(rol)}` } : {}) },
  body: JSON.stringify(cuerpo),
});

test.before(async () => {
  await new Promise((r) => servidorHttp.listen(0, r));
  base = `http://localhost:${servidorHttp.address().port}`;
});
test.after(() => { servidorHttp.close(); });

test('/salud responde y helmet agrega cabeceras de seguridad', async () => {
  const r = await pedir('/salud');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
  const cuerpo = await r.json();
  assert.equal(cuerpo.ok, true);
  assert.ok(cuerpo.data.hora);
});

test('ruta inexistente: 404 en JSON', async () => {
  const r = await pedir('/no-existe');
  assert.equal(r.status, 404);
  const cuerpo = await r.json();
  assert.deepEqual([cuerpo.ok, cuerpo.data], [false, null]);
  assert.match(cuerpo.message, /Ruta no encontrada/);
});

test('JSON roto: 400 claro (no 500)', async () => {
  const r = await pedir('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{malo' });
  assert.equal(r.status, 400);
});

test('login con datos invalidos: 400 de validacion', async () => {
  const r = await pedir('/auth/login', json(null, { email: 'x', password: '' }));
  assert.equal(r.status, 400);
  const cuerpo = await r.json();
  assert.equal(cuerpo.ok, false);
  assert.equal(cuerpo.data, null);
  assert.equal(typeof cuerpo.message, 'string');
});

test('rutas protegidas sin token: 401', async () => {
  for (const ruta of ['/reservas', '/pagos', '/notificaciones', '/reportes/estadisticas', '/caja/cierres', '/auditoria', '/registros/activos']) {
    const r = await pedir(ruta);
    assert.equal(r.status, 401, ruta);
    assert.equal((await r.json()).ok, false, ruta);
  }
});

test('roles: un cliente no puede registrar entradas ni ver reportes', async () => {
  const entrada = await pedir('/registros/entrada', json('cliente', { puestoId: 'b'.repeat(24), placa: 'ABC123' }));
  assert.equal(entrada.status, 403);
  const rep = await pedir('/reportes/ingresos', { headers: { Authorization: `Bearer ${token('cliente')}` } });
  assert.equal(rep.status, 403);
});

test('roles: un operador no puede crear tarifas ni ver la auditoria', async () => {
  const cuerpo = { parqueaderoId: 'c'.repeat(24), tipoVehiculo: 'carro', valorHora: 4000, fraccionMinutos: 15, topeDiario: 20000 };
  assert.equal((await pedir('/tarifas', json('operador', cuerpo))).status, 403);
  assert.equal((await pedir('/auditoria', { headers: { Authorization: `Bearer ${token('operador')}` } })).status, 403);
});

test('admin con datos invalidos recibe 400 de validacion', async () => {
  const r = await pedir('/tarifas', json('admin', { parqueaderoId: 'zzz', tipoVehiculo: 'avion', valorHora: -1 }));
  assert.equal(r.status, 400);
});

test('token falso o vencido: 401', async () => {
  const falso = await pedir('/reservas', { headers: { Authorization: 'Bearer abc.def.ghi' } });
  assert.equal(falso.status, 401);
});

test('el login tiene limite de intentos (rate limit configurado)', async () => {
  const r = await pedir('/auth/login', json(null, { email: 'x', password: '' }));
  assert.ok(r.headers.get('ratelimit') || r.headers.get('ratelimit-policy'), 'falta cabecera RateLimit');
});
