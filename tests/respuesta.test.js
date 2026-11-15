const test = require('node:test');
const assert = require('node:assert/strict');
const { formatearRespuesta } = require('../middlewares/respuesta');

test('exito: separa mensaje de los datos', () => {
  assert.deepEqual(
    formatearRespuesta(201, { mensaje: 'Puesto creado correctamente', puesto: { numero: 'A1' } }),
    { ok: true, message: 'Puesto creado correctamente', data: { puesto: { numero: 'A1' } } },
  );
});

test('exito sin mensaje: usa OK y conserva los datos', () => {
  assert.deepEqual(formatearRespuesta(200, { puestos: [] }), { ok: true, message: 'OK', data: { puestos: [] } });
});

test('exito con arreglo: va completo en data', () => {
  assert.deepEqual(formatearRespuesta(200, [1, 2]), { ok: true, message: 'OK', data: [1, 2] });
});

test('error: usa el texto de error y data en null', () => {
  assert.deepEqual(
    formatearRespuesta(409, { error: 'El puesto ya está ocupado' }),
    { ok: false, message: 'El puesto ya está ocupado', data: null },
  );
});

test('error sin texto: mensaje generico', () => {
  assert.deepEqual(formatearRespuesta(500, {}), { ok: false, message: 'Ocurrio un error', data: null });
});
