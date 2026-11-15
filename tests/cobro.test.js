const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularCobro, tipoTarifa } = require('../services/cobro');

test('tarifa por minuto de la sede (fraccion de 1 min) equivale a minutos * tarifa', () => {
  const r = calcularCobro({ minutos: 45, valorHora: 6000, fraccionMinutos: 1, topeDiario: 0 });
  assert.equal(r.valor, 4500);
});

test('cobra por fracciones completas (redondea hacia arriba)', () => {
  // $4000/hora, fraccion de 15 min => $1000 por fraccion
  assert.equal(calcularCobro({ minutos: 1, valorHora: 4000, fraccionMinutos: 15, topeDiario: 0 }).valor, 1000);
  assert.equal(calcularCobro({ minutos: 15, valorHora: 4000, fraccionMinutos: 15, topeDiario: 0 }).valor, 1000);
  assert.equal(calcularCobro({ minutos: 16, valorHora: 4000, fraccionMinutos: 15, topeDiario: 0 }).valor, 2000);
  assert.equal(calcularCobro({ minutos: 60, valorHora: 4000, fraccionMinutos: 15, topeDiario: 0 }).valor, 4000);
});

test('el tope diario limita el cobro de un dia', () => {
  const r = calcularCobro({ minutos: 600, valorHora: 4000, fraccionMinutos: 15, topeDiario: 25000 });
  assert.equal(r.valor, 25000);
});

test('varios dias: cada dia completo cobra el tope y el resto se cobra aparte', () => {
  // 2 dias + 60 min con tope de 25000 => 2*25000 + 4000
  const r = calcularCobro({ minutos: 2 * 1440 + 60, valorHora: 4000, fraccionMinutos: 15, topeDiario: 25000 });
  assert.equal(r.valor, 54000);
});

test('minimo 1 minuto', () => {
  assert.equal(calcularCobro({ minutos: 0, valorHora: 6000, fraccionMinutos: 1, topeDiario: 0 }).minutos, 1);
});

test('tipoTarifa agrupa tipos de puesto', () => {
  assert.equal(tipoTarifa('discapacitado'), 'carro');
  assert.equal(tipoTarifa('moto'), 'moto');
  assert.equal(tipoTarifa('bicicleta'), 'bicicleta');
  assert.equal(tipoTarifa(undefined), 'carro');
});
