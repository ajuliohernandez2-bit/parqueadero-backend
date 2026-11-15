const RegistroEntrada = require('../models/RegistroEntrada');
const Puesto = require('../models/Puesto');
const Factura = require('../models/Factura');
const Parqueadero = require('../models/Parqueadero');
const Reserva = require('../models/Reserva');
const { getIO } = require('../config/socket');
const { tipoTarifa, tarifaAplicable, calcularCobro } = require('../services/cobro');
const { registrarAuditoria } = require('../services/auditoria');
const { revisarOcupacion } = require('../services/ocupacion');
const { generarComprobante } = require('../services/comprobante');
const { aFecha } = require('../utils/fechas');
const { ErrorHttp } = require('../utils/errores');
const asyncHandler = require('../utils/asyncHandler');

const ZONA_HORARIA = 'America/Bogota';
const TARIFA_POR_DEFECTO = 100;

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------- ENTRADA
const registrarEntrada = asyncHandler(async (req, res) => {
  const { puestoId, placa } = req.body;
  if (!puestoId || !placa) throw new ErrorHttp(400, 'puestoId y placa son obligatorios');

  const placaLimpia = String(placa).trim().toUpperCase();
  if (!/^[A-Z0-9]{5,7}$/.test(placaLimpia)) {
    throw new ErrorHttp(400, 'La placa debe tener entre 5 y 7 letras o números (ej: ABC123)');
  }

  const puesto = await Puesto.findById(puestoId);
  if (!puesto) throw new ErrorHttp(404, 'Puesto no encontrado');
  if (puesto.estado === 'ocupado') throw new ErrorHttp(409, 'El puesto ya está ocupado');

  // Un mismo vehiculo no puede estar dentro dos veces al mismo tiempo.
  const placaYaActiva = await RegistroEntrada.findOne({ placa: placaLimpia, estado: 'activo' });
  if (placaYaActiva) throw new ErrorHttp(409, 'Esa placa ya tiene una entrada activa');

  // Reservas: un puesto reservado solo lo puede usar la placa que lo reservo.
  const ahora = new Date();
  const reservaVigente = await Reserva.findOne({
    puesto: puesto._id,
    estado: 'activa',
    inicio: { $lte: new Date(ahora.getTime() + 15 * 60000) },
    fin: { $gt: ahora },
  });
  if (reservaVigente && reservaVigente.placa !== placaLimpia) {
    throw new ErrorHttp(409, 'Este puesto está reservado para otra placa');
  }
  if (!reservaVigente && puesto.estado === 'reservado') {
    throw new ErrorHttp(409, 'Este puesto está marcado como reservado');
  }

  // Ocupacion atomica: evita que dos operadores tomen el mismo puesto a la vez.
  const puestoOcupado = await Puesto.findOneAndUpdate(
    { _id: puesto._id, estado: { $ne: 'ocupado' } },
    { estado: 'ocupado' },
    { new: true },
  );
  if (!puestoOcupado) throw new ErrorHttp(409, 'El puesto ya está ocupado');

  let nuevoRegistro;
  try {
    nuevoRegistro = await RegistroEntrada.create({
      puesto: puesto._id,
      usuario: req.usuario.id,
      placa: placaLimpia,
      tipoVehiculo: tipoTarifa(puesto.tipo),
    });
  } catch (error) {
    await Puesto.findByIdAndUpdate(puesto._id, { estado: puesto.estado });
    throw error;
  }

  if (reservaVigente) {
    reservaVigente.estado = 'cumplida';
    await reservaVigente.save();
  }

  getIO().emit('puesto_actualizado', puestoOcupado);

  registrarAuditoria({
    usuarioId: req.usuario.id,
    accion: 'entrada',
    entidad: 'registro',
    entidadId: nuevoRegistro._id,
    detalle: `Entrada de ${placaLimpia} al puesto ${puesto.numero}`,
    parqueaderoId: puesto.parqueaderoId,
  });
  revisarOcupacion(puesto.parqueaderoId);

  res.status(201).json({ mensaje: 'Entrada registrada correctamente', registro: nuevoRegistro });
});

// ----------------------------------------------------------------- SALIDA
const registrarSalida = asyncHandler(async (req, res) => {
  const { registroId } = req.params;

  const registro = await RegistroEntrada.findById(registroId);
  if (!registro) throw new ErrorHttp(404, 'Registro no encontrado');
  if (registro.estado === 'finalizado') throw new ErrorHttp(409, 'Este registro ya fue finalizado');

  const puesto = await Puesto.findById(registro.puesto);
  const parqueaderoId = puesto ? String(puesto.parqueaderoId) : '';
  const tipoVehiculo = registro.tipoVehiculo || tipoTarifa(puesto?.tipo);

  const horaSalida = new Date();
  const minutosReales = Math.max(1, Math.ceil((horaSalida - registro.horaEntrada) / 60000));
  const tarifa = parqueaderoId
    ? await tarifaAplicable(parqueaderoId, tipoVehiculo)
    : { valorHora: TARIFA_POR_DEFECTO * 60, fraccionMinutos: 1, topeDiario: 0 };
  const cobro = calcularCobro({
    minutos: minutosReales,
    valorHora: tarifa.valorHora,
    fraccionMinutos: tarifa.fraccionMinutos,
    topeDiario: tarifa.topeDiario,
  });

  registro.horaSalida = horaSalida;
  registro.estado = 'finalizado';
  await registro.save();

  const puestoLiberado = await Puesto.findByIdAndUpdate(registro.puesto, { estado: 'libre' }, { new: true });
  if (puestoLiberado) getIO().emit('puesto_actualizado', puestoLiberado);

  const factura = await Factura.create({
    registro: registro._id,
    placa: registro.placa,
    tiempoTotalMinutos: minutosReales,
    valorCobrado: cobro.valor,
    parqueaderoId,
    tipoVehiculo,
    desglose: cobro,
  });

  registrarAuditoria({
    usuarioId: req.usuario.id,
    accion: 'salida',
    entidad: 'factura',
    entidadId: factura._id,
    detalle: `Salida de ${registro.placa}: ${minutosReales} min, $${cobro.valor}`,
    parqueaderoId,
  });

  res.json({ mensaje: 'Salida registrada y factura generada', registro, factura });
});

// ---------------------------------------------------------------- ACTIVOS
const listarActivos = asyncHandler(async (req, res) => {
  const { parqueaderoId } = req.query;
  let registros = await RegistroEntrada.find({ estado: 'activo' })
    .populate('puesto', 'numero tipo parqueaderoId nivel')
    .populate('usuario', 'nombre email')
    .sort({ horaEntrada: -1 })
    .lean();

  if (parqueaderoId) {
    registros = registros.filter((r) => String(r.puesto?.parqueaderoId) === String(parqueaderoId));
  }

  const sedes = await Parqueadero.find().select('tarifaPorMinuto').lean();
  const tarifasSede = new Map(sedes.map((s) => [String(s._id), s.tarifaPorMinuto]));
  const cache = new Map();
  const ahora = Date.now();

  const conTarifa = [];
  for (const r of registros) {
    const sedeId = String(r.puesto?.parqueaderoId || '');
    const tipo = r.tipoVehiculo || tipoTarifa(r.puesto?.tipo);
    const clave = `${sedeId}:${tipo}`;
    if (!cache.has(clave)) cache.set(clave, sedeId ? await tarifaAplicable(sedeId, tipo) : null);
    const tarifa = cache.get(clave);
    const minutos = Math.max(1, Math.ceil((ahora - new Date(r.horaEntrada).getTime()) / 60000));
    const cobro = tarifa
      ? calcularCobro({ minutos, valorHora: tarifa.valorHora, fraccionMinutos: tarifa.fraccionMinutos, topeDiario: tarifa.topeDiario })
      : null;
    conTarifa.push({
      ...r,
      tipoVehiculo: tipo,
      tarifaPorMinuto: tarifasSede.get(sedeId) ?? TARIFA_POR_DEFECTO,
      tarifa: tarifa ? { valorHora: tarifa.valorHora, fraccionMinutos: tarifa.fraccionMinutos, topeDiario: tarifa.topeDiario } : null,
      minutos,
      valorEstimado: cobro ? cobro.valor : minutos * TARIFA_POR_DEFECTO,
    });
  }

  res.json({ total: conTarifa.length, registros: conTarifa, tarifaPorMinuto: TARIFA_POR_DEFECTO });
});

// ------------------------------------------------------- HORAS PICO (7 dias)
const ocupacionPorHora = asyncHandler(async (req, res) => {
  const { parqueaderoId } = req.query;
  if (!parqueaderoId) throw new ErrorHttp(400, 'parqueaderoId es obligatorio');

  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const filas = await RegistroEntrada.aggregate([
    { $match: { horaEntrada: { $gte: desde } } },
    { $lookup: { from: 'puestos', localField: 'puesto', foreignField: '_id', as: 'p' } },
    { $unwind: '$p' },
    { $match: { 'p.parqueaderoId': String(parqueaderoId) } },
    { $group: { _id: { $hour: { date: '$horaEntrada', timezone: ZONA_HORARIA } }, entradas: { $sum: 1 } } },
  ]);

  const porHora = new Map(filas.map((f) => [f._id, f.entradas]));
  const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, entradas: porHora.get(hora) || 0 }));
  res.json({ dias: 7, horas });
});

// --------------------------------------------------------------- HISTORIAL
async function armarFilas(registros) {
  const ids = registros.map((r) => r._id);
  const facturas = await Factura.find({ registro: { $in: ids } }).lean();
  const porRegistro = new Map(facturas.map((f) => [String(f.registro), f]));
  const sedes = await Parqueadero.find().select('nombre').lean();
  const nombres = new Map(sedes.map((s) => [String(s._id), s.nombre]));

  return registros.map((r) => {
    const f = porRegistro.get(String(r._id));
    const sedeId = String(r.puesto?.parqueaderoId || '');
    return {
      _id: r._id,
      placa: r.placa,
      estado: r.estado,
      tipoVehiculo: r.tipoVehiculo,
      horaEntrada: r.horaEntrada,
      horaSalida: r.horaSalida,
      minutos: f?.tiempoTotalMinutos ?? null,
      valorCobrado: f?.valorCobrado ?? null,
      facturaId: f?._id ?? null,
      puesto: r.puesto ? { numero: r.puesto.numero, nivel: r.puesto.nivel } : null,
      parqueaderoId: sedeId,
      parqueadero: nombres.get(sedeId) || '',
      operador: r.usuario?.nombre || '',
    };
  });
}

const historial = asyncHandler(async (req, res) => {
  const { placa, usuarioId, parqueaderoId, desde, hasta, estado } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

  const filtro = {};
  if (placa) filtro.placa = new RegExp(`^${escaparRegex(String(placa).trim().toUpperCase())}`);
  if (estado === 'activo' || estado === 'finalizado') filtro.estado = estado;
  // Un cliente solo ve sus propios registros; el staff puede filtrar por usuario.
  if (req.usuario.rol === 'cliente') filtro.usuario = req.usuario.id;
  else if (usuarioId) filtro.usuario = usuarioId;

  const d = aFecha(desde, false);
  const h = aFecha(hasta, true);
  if (d || h) filtro.horaEntrada = { ...(d && { $gte: d }), ...(h && { $lte: h }) };

  if (parqueaderoId) {
    filtro.puesto = { $in: await Puesto.find({ parqueaderoId: String(parqueaderoId) }).distinct('_id') };
  }

  const [total, registros] = await Promise.all([
    RegistroEntrada.countDocuments(filtro),
    RegistroEntrada.find(filtro)
      .populate('puesto', 'numero nivel parqueaderoId')
      .populate('usuario', 'nombre')
      .sort({ horaEntrada: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  res.json({ total, page, limit, paginas: Math.ceil(total / limit) || 1, registros: await armarFilas(registros) });
});

// ------------------------------------------------------- BUSQUEDA POR PLACA
const buscarPorPlaca = asyncHandler(async (req, res) => {
  const placa = String(req.params.placa || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,7}$/.test(placa)) throw new ErrorHttp(400, 'Placa inválida');

  const activo = await RegistroEntrada.findOne({ placa, estado: 'activo' })
    .populate('puesto', 'numero nivel parqueaderoId')
    .populate('usuario', 'nombre')
    .lean();
  const ultimos = await RegistroEntrada.find({ placa, estado: 'finalizado' })
    .populate('puesto', 'numero nivel parqueaderoId')
    .populate('usuario', 'nombre')
    .sort({ horaEntrada: -1 })
    .limit(10)
    .lean();
  const reservas = await Reserva.find({ placa, estado: 'activa' }).sort({ inicio: 1 }).limit(5).lean();

  const filas = await armarFilas(activo ? [activo, ...ultimos] : ultimos);
  res.json({
    placa,
    dentro: Boolean(activo),
    actual: activo ? filas[0] : null,
    historial: activo ? filas.slice(1) : filas,
    reservasActivas: reservas,
  });
});

// -------------------------------------------------------------- COMPROBANTE
const comprobante = asyncHandler(async (req, res) => {
  const registro = await RegistroEntrada.findById(req.params.registroId).lean();
  if (!registro) throw new ErrorHttp(404, 'Registro no encontrado');
  if (req.usuario.rol === 'cliente' && String(registro.usuario) !== String(req.usuario.id)) {
    throw new ErrorHttp(403, 'No tienes permiso para ver este comprobante');
  }
  const puesto = await Puesto.findById(registro.puesto).lean();
  const sede = puesto ? await Parqueadero.findById(puesto.parqueaderoId).lean().catch(() => null) : null;
  const factura = registro.estado === 'finalizado' ? await Factura.findOne({ registro: registro._id }).lean() : null;
  await generarComprobante(res, { registro, puesto, sede, factura });
});

module.exports = {
  registrarEntrada,
  registrarSalida,
  listarActivos,
  ocupacionPorHora,
  historial,
  buscarPorPlaca,
  comprobante,
};
