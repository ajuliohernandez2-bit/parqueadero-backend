const CierreCaja = require('../models/CierreCaja');
const Factura = require('../models/Factura');
const { registrarAuditoria } = require('../services/auditoria');
const { aFecha } = require('../utils/fechas');
const { ErrorHttp } = require('../utils/errores');
const asyncHandler = require('../utils/asyncHandler');

async function totalPeriodo(parqueaderoId, desde, hasta) {
  const [r] = await Factura.aggregate([
    { $match: { parqueaderoId: String(parqueaderoId), fechaEmision: { $gte: desde, $lte: hasta } } },
    { $group: { _id: null, total: { $sum: '$valorCobrado' }, cantidad: { $sum: 1 } } },
  ]);
  return { totalIngresos: r?.total || 0, cantidadFacturas: r?.cantidad || 0 };
}

// Dinero acumulado desde el ultimo cierre hasta ahora (lo que falta por cerrar).
const pendiente = asyncHandler(async (req, res) => {
  const { parqueaderoId } = req.query;
  if (!parqueaderoId) throw new ErrorHttp(400, 'parqueaderoId es obligatorio');
  const ultimo = await CierreCaja.findOne({ parqueaderoId: String(parqueaderoId) }).sort({ hasta: -1 }).lean();
  const primeraFactura = await Factura.findOne({ parqueaderoId: String(parqueaderoId) }).sort({ fechaEmision: 1 }).lean();
  const desde = ultimo ? new Date(ultimo.hasta.getTime() + 1) : (primeraFactura?.fechaEmision || new Date());
  const hasta = new Date();
  res.json({ parqueaderoId, desde, hasta, ...(await totalPeriodo(parqueaderoId, desde, hasta)) });
});

const cerrar = asyncHandler(async (req, res) => {
  const { parqueaderoId, observaciones } = req.body;
  const desde = aFecha(req.body.desde, false);
  let hasta = aFecha(req.body.hasta, true);
  if (!desde || !hasta) throw new ErrorHttp(400, 'Las fechas del cierre no son válidas');
  if (hasta > new Date()) hasta = new Date();
  if (hasta <= desde) throw new ErrorHttp(400, 'El período del cierre no es válido');

  const solapado = await CierreCaja.findOne({ parqueaderoId, hasta: { $gt: desde }, desde: { $lt: hasta } });
  if (solapado) throw new ErrorHttp(409, 'Ya existe un cierre de caja que cubre parte de ese periodo');

  const totales = await totalPeriodo(parqueaderoId, desde, hasta);
  const cierre = await CierreCaja.create({
    parqueaderoId,
    usuario: req.usuario.id,
    desde,
    hasta,
    observaciones: observaciones || '',
    ...totales,
  });
  registrarAuditoria({
    usuarioId: req.usuario.id, accion: 'cierre_caja', entidad: 'cierre', entidadId: cierre._id,
    detalle: `Cierre de caja: $${totales.totalIngresos} (${totales.cantidadFacturas} facturas)`, parqueaderoId,
  });
  res.status(201).json({ mensaje: 'Cierre de caja registrado', cierre });
});

const listar = asyncHandler(async (req, res) => {
  const filtro = req.query.parqueaderoId ? { parqueaderoId: String(req.query.parqueaderoId) } : {};
  const cierres = await CierreCaja.find(filtro).populate('usuario', 'nombre').sort({ hasta: -1 }).limit(100).lean();
  res.json({ total: cierres.length, cierres });
});

module.exports = { pendiente, cerrar, listar };
