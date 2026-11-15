const Puesto = require('../models/Puesto');
const Parqueadero = require('../models/Parqueadero');
const { notificarStaff } = require('./notificaciones');

const UMBRAL_ALERTA = 0.9; // 90 % de ocupacion
const ENFRIAMIENTO_MS = 30 * 60 * 1000; // no repetir la alerta antes de 30 min
const ultimaAlerta = new Map();

async function resumenSede(parqueaderoId) {
  const filas = await Puesto.aggregate([
    { $match: { parqueaderoId: String(parqueaderoId) } },
    { $group: { _id: '$estado', n: { $sum: 1 } } },
  ]);
  const r = { total: 0, libres: 0, ocupados: 0, reservados: 0 };
  for (const f of filas) {
    r.total += f.n;
    if (f._id === 'libre') r.libres = f.n;
    if (f._id === 'ocupado') r.ocupados = f.n;
    if (f._id === 'reservado') r.reservados = f.n;
  }
  r.porcentaje = r.total ? Math.round(((r.ocupados + r.reservados) / r.total) * 100) : 0;
  return r;
}

// Se llama despues de cada entrada: avisa al staff si la sede supera el 90 %.
async function revisarOcupacion(parqueaderoId) {
  try {
    const r = await resumenSede(parqueaderoId);
    if (r.total < 5 || r.porcentaje < UMBRAL_ALERTA * 100) return;

    const clave = String(parqueaderoId);
    const previa = ultimaAlerta.get(clave) || 0;
    if (Date.now() - previa < ENFRIAMIENTO_MS) return;
    ultimaAlerta.set(clave, Date.now());

    const sede = await Parqueadero.findById(parqueaderoId).select('nombre').lean();
    const nombre = sede?.nombre || 'Parqueadero';
    await notificarStaff(
      'ocupacion_alta',
      `Ocupacion alta en ${nombre}`,
      `${nombre} esta al ${r.porcentaje}% (${r.libres} puestos libres de ${r.total}).`,
      { parqueaderoId: clave, ...r },
    );
  } catch (error) {
    console.error('No se pudo revisar la ocupacion:', error.message);
  }
}

module.exports = { resumenSede, revisarOcupacion };
