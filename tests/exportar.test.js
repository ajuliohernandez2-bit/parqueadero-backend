const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { enviarPdf, enviarXlsx } = require('../services/exportar');
const { generarComprobante } = require('../services/comprobante');

function falsoRes() {
  const s = new PassThrough();
  const trozos = [];
  s.on('data', (c) => trozos.push(c));
  s.headers = {};
  s.setHeader = (k, v) => { s.headers[k] = v; };
  s.fin = new Promise((r) => s.on('end', r));
  s.buffer = () => Buffer.concat(trozos);
  return s;
}

const columnas = [{ titulo: 'Placa', campo: 'placa' }, { titulo: 'Valor', campo: 'valor', formato: 'pesos' }];
const filas = Array.from({ length: 80 }, (_, i) => ({ placa: `ABC${100 + i}`, valor: 1000 * i }));

test('PDF de reporte valido (con varias paginas)', async () => {
  const res = falsoRes();
  enviarPdf(res, 'x', 'Reporte', columnas, filas, [['Total', '$1']]);
  await res.fin;
  assert.equal(res.buffer().subarray(0, 4).toString(), '%PDF');
  assert.equal(res.headers['Content-Type'], 'application/pdf');
});

test('Excel de reporte valido', async () => {
  const res = falsoRes();
  await enviarXlsx(res, 'x', 'Reporte', columnas, filas, [['Total', '$1']]);
  assert.equal(res.buffer().subarray(0, 2).toString(), 'PK');
});

test('comprobante PDF con QR (entrada y salida)', async () => {
  const registro = { _id: 'r'.repeat(24), placa: 'ABC123', estado: 'finalizado', tipoVehiculo: 'carro', horaEntrada: new Date(Date.now() - 3600000), horaSalida: new Date() };
  const res = falsoRes();
  await generarComprobante(res, {
    registro,
    puesto: { numero: 'N1-A1', nivel: 'Nivel 1' },
    sede: { nombre: 'Mall Plaza', direccion: 'Cartagena' },
    factura: { tiempoTotalMinutos: 60, valorCobrado: 4000, desglose: { valorHora: 4000, fraccionMinutos: 15, topeDiario: 25000 } },
  });
  await res.fin;
  assert.equal(res.buffer().subarray(0, 4).toString(), '%PDF');

  const res2 = falsoRes();
  await generarComprobante(res2, { registro: { ...registro, estado: 'activo', horaSalida: null }, puesto: null, sede: null, factura: null });
  await res2.fin;
  assert.equal(res2.buffer().subarray(0, 4).toString(), '%PDF');
});
