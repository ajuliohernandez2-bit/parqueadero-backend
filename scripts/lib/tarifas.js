// Crea (o actualiza) las tarifas de cada sede: carro, moto y bicicleta.
// Cada sede tiene un "factor" distinto para que no cobren todas lo mismo.
const Tarifa = require('../../models/Tarifa');
const Parqueadero = require('../../models/Parqueadero');

const FACTORES = [1.0, 1.15, 0.9, 0.8, 1.25, 0.95, 1.1, 1.3];

function redondear(valor) {
  return Math.round(valor / 100) * 100;
}

async function asegurarTarifas(parqueaderos) {
  let creadas = 0;
  for (let i = 0; i < parqueaderos.length; i++) {
    const sede = parqueaderos[i];
    const f = FACTORES[i % FACTORES.length];
    const definiciones = [
      { tipoVehiculo: 'carro', valorHora: redondear(4000 * f), fraccionMinutos: 15, topeDiario: redondear(24000 * f) },
      { tipoVehiculo: 'moto', valorHora: redondear(2200 * f), fraccionMinutos: 15, topeDiario: redondear(13000 * f) },
      { tipoVehiculo: 'bicicleta', valorHora: redondear(600 * f), fraccionMinutos: 30, topeDiario: redondear(3000 * f) },
    ];
    for (const d of definiciones) {
      await Tarifa.findOneAndUpdate(
        { parqueaderoId: String(sede._id), tipoVehiculo: d.tipoVehiculo },
        { $set: d },
        { upsert: true, setDefaultsOnInsert: true },
      );
      creadas++;
    }
    // La tarifa por minuto de la sede queda alineada con la del carro (se usa si se borra una tarifa).
    const carro = definiciones[0];
    await Parqueadero.updateOne({ _id: sede._id }, { $set: { tarifaPorMinuto: Math.round(carro.valorHora / 60) } });
  }
  return creadas;
}

module.exports = { asegurarTarifas };
