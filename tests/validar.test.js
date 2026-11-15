const test = require('node:test');
const assert = require('node:assert/strict');
const { validarEntradas, placa } = require('../middlewares/validar');

function correr(method, path, { body = {}, query = {} } = {}) {
  const req = { method, path, body, query, params: {} };
  let status = 200;
  let json = null;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; } };
  let paso = false;
  validarEntradas(req, res, () => { paso = true; });
  return { paso, status, json, req };
}

test('placas colombianas: carro ABC123 y moto ABC12D', () => {
  assert.equal(placa.parse('abc123'), 'ABC123');
  assert.equal(placa.parse(' xyz12a '), 'XYZ12A');
  assert.throws(() => placa.parse('12345'));
  assert.throws(() => placa.parse('ABCD12'));
});

test('login: rechaza correo invalido', () => {
  const r = correr('POST', '/auth/login', { body: { email: 'no-es-correo', password: '123456' } });
  assert.equal(r.paso, false);
  assert.equal(r.status, 400);
});

test('registrar: no deja pedir rol admin', () => {
  const r = correr('POST', '/auth/registrar', { body: { nombre: 'Ana', email: 'a@a.com', password: '123456', rol: 'admin' } });
  assert.equal(r.paso, false);
  assert.equal(r.status, 400);
});

test('entrada: normaliza la placa a mayusculas', () => {
  const r = correr('POST', '/registros/entrada', { body: { puestoId: 'a'.repeat(24), placa: 'abc123' } });
  assert.equal(r.paso, true);
  assert.equal(r.req.body.placa, 'ABC123');
});

test('tarifas: exige valores numericos validos', () => {
  const r = correr('POST', '/tarifas', { body: { parqueaderoId: 'a'.repeat(24), tipoVehiculo: 'carro', valorHora: -5, fraccionMinutos: 15, topeDiario: 0 } });
  assert.equal(r.status, 400);
});

test('historial: conserva page y limit', () => {
  const r = correr('GET', '/registros/historial', { query: { page: '2', limit: '10', placa: 'abc' } });
  assert.equal(r.paso, true);
  assert.equal(r.req.query.page, 2);
  assert.equal(r.req.query.limit, 10);
});

test('rutas sin regla pasan sin validar', () => {
  assert.equal(correr('GET', '/parqueaderos').paso, true);
});
