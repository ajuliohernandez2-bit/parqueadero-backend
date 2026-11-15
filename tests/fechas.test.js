const test = require('node:test');
const assert = require('node:assert/strict');
const { aFecha, rangoFechas, inicioDeHoy } = require('../utils/fechas');

test('AAAA-MM-DD se interpreta en hora de Colombia (UTC-5)', () => {
  assert.equal(aFecha('2026-11-15').toISOString(), '2026-11-15T05:00:00.000Z');
  assert.equal(aFecha('2026-11-15', true).toISOString(), '2026-11-16T04:59:59.999Z');
});

test('fechas invalidas devuelven null', () => {
  assert.equal(aFecha('hola'), null);
  assert.equal(aFecha(''), null);
});

test('rangoFechas usa 30 dias por defecto', () => {
  const { desde, hasta } = rangoFechas();
  const dias = (hasta - desde) / 86400000;
  assert.ok(Math.abs(dias - 30) < 0.01);
});

test('inicioDeHoy cae a medianoche de Colombia', () => {
  const r = inicioDeHoy(new Date('2026-11-15T20:00:00Z')); // 15:00 en Bogota
  assert.equal(r.toISOString(), '2026-11-15T05:00:00.000Z');
  const madrugada = inicioDeHoy(new Date('2026-11-15T03:00:00Z')); // 22:00 del 14 en Bogota
  assert.equal(madrugada.toISOString(), '2026-11-14T05:00:00.000Z');
});
