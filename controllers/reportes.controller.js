const Factura = require('../models/Factura');
const Parqueadero = require('../models/Parqueadero');
const Puesto = require('../models/Puesto');
const RegistroEntrada = require('../models/RegistroEntrada');
const Auditoria = require('../models/Auditoria');
const { responderArchivo } = require('../services/exportar');
const { filtroAuditoria } = require('./auditoria.controller');
const { rangoFechas, inicioDeHoy, formatoColombia, MS_DIA } = require('../utils/fechas');
const asyncHandler = require('../utils/asyncHandler');

const ZONA = 'America/Bogota';
const pesos = (v) => `$${Number(v || 0).toLocaleString('es-CO')}`;

async function nombresSedes() {
  const sedes = await Parqueadero.find().select('nombre').lean();
  return new Map(sedes.map((s) => [String(s._id), s.nombre]));
}

// ------------------------------------------------------------- INGRESOS
const ingresos = asyncHandler(async (req, res) => {
  const { parqueaderoId } = req.query;
  const { desde, hasta } = rangoFechas(req.query.desde, req.query.hasta, 30);
  const match = { fechaEmision: { $gte: desde, $lte: hasta } };
  if (parqueaderoId) match.parqueaderoId = String(parqueaderoId);

  const nombres = await nombresSedes();

  if (req.query.formato) {
    const facturas = await Factura.find(match).sort({ fechaEmision: -1 }).limit(5000).lean();
    const filas = facturas.map((f) => ({
      fecha: formatoColombia(f.fechaEmision),
      placa: f.placa,
      sede: nombres.get(String(f.parqueaderoId)) || '',
      tipo: f.tipoVehiculo,
      minutos: f.tiempoTotalMinutos,
      valor: f.valorCobrado,
    }));
    const total = facturas.reduce((s, f) => s + f.valorCobrado, 0);
    const enviado = await responderArchivo(req, res, {
      nombre: `ingresos-${new Date().toISOString().slice(0, 10)}`,
      titulo: 'Reporte de ingresos',
      columnas: [
        { titulo: 'Fecha', campo: 'fecha', ancho: 22 },
        { titulo: 'Placa', campo: 'placa', ancho: 12 },
        { titulo: 'Sede', campo: 'sede', ancho: 30 },
        { titulo: 'Tipo', campo: 'tipo', ancho: 12 },
        { titulo: 'Minutos', campo: 'minutos', ancho: 10 },
        { titulo: 'Valor', campo: 'valor', ancho: 14, formato: 'pesos' },
      ],
      filas,
      resumen: [
        ['Período', `${formatoColombia(desde)} a ${formatoColombia(hasta)}`],
        ['Facturas', facturas.length],
        ['Total ingresos', pesos(total)],
      ],
    });
    if (enviado) return;
  }

  const [resumen] = await Factura.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$valorCobrado' }, cantidad: { $sum: 1 }, minutos: { $sum: '$tiempoTotalMinutos' } } },
  ]);
  const porDia = await Factura.aggregate([
    { $match: match },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$fechaEmision', timezone: ZONA } }, total: { $sum: '$valorCobrado' }, cantidad: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const porSedeRaw = await Factura.aggregate([
    { $match: match },
    { $group: { _id: '$parqueaderoId', total: { $sum: '$valorCobrado' }, cantidad: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);
  const porTipo = await Factura.aggregate([
    { $match: match },
    { $group: { _id: '$tipoVehiculo', total: { $sum: '$valorCobrado' }, cantidad: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);

  res.json({
    desde,
    hasta,
    total: resumen?.total || 0,
    cantidad: resumen?.cantidad || 0,
    promedio: resumen?.cantidad ? Math.round(resumen.total / resumen.cantidad) : 0,
    porDia: porDia.map((d) => ({ fecha: d._id, total: d.total, cantidad: d.cantidad })),
    porSede: porSedeRaw.map((s) => ({ parqueaderoId: s._id, nombre: nombres.get(String(s._id)) || 'Sin sede', total: s.total, cantidad: s.cantidad })),
    porTipo: porTipo.map((t) => ({ tipo: t._id || 'carro', total: t.total, cantidad: t.cantidad })),
  });
});

// ------------------------------------------------------------ OCUPACION
async function ocupacionActual(parqueaderoId) {
  const match = parqueaderoId ? { parqueaderoId: String(parqueaderoId) } : {};
  const conteos = await Puesto.aggregate([
    { $match: match },
    { $group: { _id: '$parqueaderoId', total: { $sum: 1 }, ocupados: { $sum: { $cond: [{ $eq: ['$estado', 'ocupado'] }, 1, 0] } }, reservados: { $sum: { $cond: [{ $eq: ['$estado', 'reservado'] }, 1, 0] } } } },
  ]);
  const nombres = await nombresSedes();
  return conteos.map((c) => ({
    parqueaderoId: c._id,
    nombre: nombres.get(String(c._id)) || 'Sin sede',
    total: c.total,
    ocupados: c.ocupados,
    reservados: c.reservados,
    libres: c.total - c.ocupados - c.reservados,
    porcentaje: c.total ? Math.round(((c.ocupados + c.reservados) / c.total) * 100) : 0,
  })).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

const ocupacion = asyncHandler(async (req, res) => {
  const sedes = await ocupacionActual(req.query.parqueaderoId);
  const enviado = await responderArchivo(req, res, {
    nombre: `ocupacion-${new Date().toISOString().slice(0, 10)}`,
    titulo: 'Reporte de ocupación actual',
    columnas: [
      { titulo: 'Sede', campo: 'nombre', ancho: 32 },
      { titulo: 'Total', campo: 'total', ancho: 10 },
      { titulo: 'Ocupados', campo: 'ocupados', ancho: 12 },
      { titulo: 'Reservados', campo: 'reservados', ancho: 12 },
      { titulo: 'Libres', campo: 'libres', ancho: 10 },
      { titulo: '% ocupación', campo: 'porcentaje', ancho: 12 },
    ],
    filas: sedes,
    resumen: [['Generado', formatoColombia(new Date())]],
  });
  if (enviado) return;
  res.json({ sedes });
});

// ------------------------------------------------------------ AUDITORIA
const auditoria = asyncHandler(async (req, res) => {
  const eventos = await Auditoria.find(filtroAuditoria(req.query)).populate('usuario', 'nombre').sort({ createdAt: -1 }).limit(5000).lean();
  const filas = eventos.map((e) => ({
    fecha: formatoColombia(e.createdAt),
    usuario: e.usuario?.nombre || 'Sistema',
    accion: e.accion,
    detalle: e.detalle,
  }));
  const enviado = await responderArchivo(req, res, {
    nombre: `auditoria-${new Date().toISOString().slice(0, 10)}`,
    titulo: 'Reporte de auditoría',
    columnas: [
      { titulo: 'Fecha', campo: 'fecha', ancho: 22 },
      { titulo: 'Usuario', campo: 'usuario', ancho: 22 },
      { titulo: 'Acción', campo: 'accion', ancho: 20 },
      { titulo: 'Detalle', campo: 'detalle', ancho: 60 },
    ],
    filas,
    resumen: [['Eventos', filas.length]],
  });
  if (enviado) return;
  res.json({ total: filas.length, eventos: filas });
});

// ---------------------------------------------------------- ESTADISTICAS
const estadisticas = asyncHandler(async (req, res) => {
  const { parqueaderoId } = req.query;
  const filtroSede = parqueaderoId ? { parqueaderoId: String(parqueaderoId) } : {};
  const ahora = new Date();
  const hoy = inicioDeHoy(ahora);
  const hace7 = new Date(ahora.getTime() - 7 * MS_DIA);
  const hace14 = new Date(ahora.getTime() - 14 * MS_DIA);
  const hace30 = new Date(ahora.getTime() - 30 * MS_DIA);

  const sumaDesde = async (desde) => {
    const [r] = await Factura.aggregate([
      { $match: { ...filtroSede, fechaEmision: { $gte: desde } } },
      { $group: { _id: null, total: { $sum: '$valorCobrado' }, cantidad: { $sum: 1 } } },
    ]);
    return { total: r?.total || 0, cantidad: r?.cantidad || 0 };
  };

  const idsPuestos = parqueaderoId ? await Puesto.find(filtroSede).distinct('_id') : null;
  const matchRegistros = (desde) => ({ horaEntrada: { $gte: desde }, ...(idsPuestos && { puesto: { $in: idsPuestos } }) });

  const [ocupacion, hoyR, semana, mes, ingresosPorDia, horas, frecuentes] = await Promise.all([
    ocupacionActual(parqueaderoId),
    sumaDesde(hoy),
    sumaDesde(hace7),
    sumaDesde(hace30),
    Factura.aggregate([
      { $match: { ...filtroSede, fechaEmision: { $gte: hace14 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$fechaEmision', timezone: ZONA } }, total: { $sum: '$valorCobrado' } } },
      { $sort: { _id: 1 } },
    ]),
    RegistroEntrada.aggregate([
      { $match: matchRegistros(hace7) },
      { $group: { _id: { $hour: { date: '$horaEntrada', timezone: ZONA } }, entradas: { $sum: 1 } } },
      { $sort: { entradas: -1 } },
      { $limit: 5 },
    ]),
    RegistroEntrada.aggregate([
      { $match: matchRegistros(hace30) },
      { $group: { _id: '$placa', visitas: { $sum: 1 } } },
      { $sort: { visitas: -1 } },
      { $limit: 5 },
    ]),
  ]);

  res.json({
    ocupacion,
    ingresos: { hoy: hoyR, semana, mes },
    ingresosPorDia: ingresosPorDia.map((d) => ({ fecha: d._id, total: d.total })),
    horasPico: horas.map((h) => ({ hora: h._id, entradas: h.entradas })),
    vehiculosFrecuentes: frecuentes.map((f) => ({ placa: f._id, visitas: f.visitas })),
  });
});

module.exports = { ingresos, ocupacion, auditoria, estadisticas };
