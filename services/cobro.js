const Parqueadero = require('../models/Parqueadero');
const Tarifa = require('../models/Tarifa');

const TARIFA_POR_DEFECTO = 100;

function tipoTarifa(tipoPuesto) {
  if (tipoPuesto === 'moto') return 'moto';
  if (tipoPuesto === 'bicicleta') return 'bicicleta';
  return 'carro';
}

function calcularCobro({ minutos, valorHora, fraccionMinutos, topeDiario }) {
  const mins = Math.max(1, Math.ceil(Number(minutos) || 1));
  const hora = Math.max(0, Number(valorHora) || 0);
  const fraccion = Math.max(1, Math.round(Number(fraccionMinutos) || 60));
  const tope = Math.max(0, Number(topeDiario) || 0);
  const valorFraccion = (hora * fraccion) / 60;

  const cobrarBloque = (bloque) => {
    if (bloque <= 0) return 0;
    const bruto = Math.ceil(bloque / fraccion) * valorFraccion;
    return tope > 0 ? Math.min(tope, bruto) : bruto;
  };

  const minutosDia = 24 * 60;
  const dias = Math.floor(mins / minutosDia);
  const resto = mins - dias * minutosDia;
  const valorDiaCompleto = tope > 0 ? tope : cobrarBloque(minutosDia);
  const valor = Math.round(dias * valorDiaCompleto + cobrarBloque(resto));

  return {
    minutos: mins,
    valor,
    valorHora: hora,
    fraccionMinutos: fraccion,
    valorFraccion: Math.round(valorFraccion),
    topeDiario: tope,
  };
}

async function tarifaAplicable(parqueaderoId, tipoVehiculo) {
  const tipo = tipoTarifa(tipoVehiculo);
  const tarifa = await Tarifa.findOne({ parqueaderoId: String(parqueaderoId), tipoVehiculo: tipo }).lean();
  if (tarifa) return tarifa;

  const sede = await Parqueadero.findById(parqueaderoId).select('tarifaPorMinuto').lean().catch(() => null);
  const porMinuto = sede?.tarifaPorMinuto ?? TARIFA_POR_DEFECTO;
  return {
    parqueaderoId: String(parqueaderoId),
    tipoVehiculo: tipo,
    valorHora: porMinuto * 60,
    fraccionMinutos: 1,
    topeDiario: 0,
  };
}

module.exports = {
  TARIFA_POR_DEFECTO,
  tipoTarifa,
  calcularCobro,
  tarifaAplicable,
};
