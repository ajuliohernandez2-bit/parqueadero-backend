const Pago = require('../models/Pago');
const Factura = require('../models/Factura');
const Reserva = require('../models/Reserva');
const { tarifaAplicable, calcularCobro } = require('../services/cobro');
const { registrarAuditoria } = require('../services/auditoria');
const { crearNotificacion } = require('../services/notificaciones');
const { aFecha } = require('../utils/fechas');
const { ErrorHttp } = require('../utils/errores');
const asyncHandler = require('../utils/asyncHandler');

const esStaff = (u) => u.rol === 'admin' || u.rol === 'operador';

// El monto siempre lo calcula el servidor (nunca se confia en el cliente).
const registrar = asyncHandler(async (req, res) => {
  const { facturaId, reservaId, metodo } = req.body;
  let monto;
  let datos;

  if (facturaId) {
    const factura = await Factura.findById(facturaId);
    if (!factura) throw new ErrorHttp(404, 'Factura no encontrada');
    if (await Pago.findOne({ factura: factura._id })) throw new ErrorHttp(409, 'Esa factura ya fue pagada');
    monto = factura.valorCobrado;
    datos = { factura: factura._id, parqueaderoId: factura.parqueaderoId, placa: factura.placa, concepto: `Factura ${factura.placa}` };
  } else {
    const reserva = await Reserva.findById(reservaId);
    if (!reserva) throw new ErrorHttp(404, 'Reserva no encontrada');
    if (!esStaff(req.usuario) && String(reserva.usuario) !== String(req.usuario.id)) {
      throw new ErrorHttp(403, 'No puedes pagar la reserva de otra persona');
    }
    if (reserva.estado === 'cancelada') throw new ErrorHttp(409, 'La reserva está cancelada');
    if (await Pago.findOne({ reserva: reserva._id })) throw new ErrorHttp(409, 'Esa reserva ya fue pagada');
    const tarifa = await tarifaAplicable(reserva.parqueaderoId, reserva.tipoVehiculo);
    const minutos = Math.ceil((reserva.fin - reserva.inicio) / 60000);
    monto = calcularCobro({ minutos, valorHora: tarifa.valorHora, fraccionMinutos: tarifa.fraccionMinutos, topeDiario: tarifa.topeDiario }).valor;
    datos = { reserva: reserva._id, parqueaderoId: reserva.parqueaderoId, placa: reserva.placa, concepto: `Reserva ${reserva.placa}` };
  }

  const pago = await Pago.create({ usuario: req.usuario.id, monto, metodo: metodo || 'efectivo', estado: 'confirmado', ...datos });

  registrarAuditoria({
    usuarioId: req.usuario.id, accion: 'pago', entidad: 'pago', entidadId: pago._id,
    detalle: `${pago.concepto}: $${monto} (${pago.metodo})`, parqueaderoId: datos.parqueaderoId,
  });
  await crearNotificacion({
    usuarioId: req.usuario.id,
    tipo: 'pago_confirmado',
    titulo: 'Pago confirmado',
    mensaje: `Recibimos tu pago de $${monto.toLocaleString('es-CO')} (${pago.concepto}).`,
    datos: { pagoId: String(pago._id), monto },
  });

  res.status(201).json({ mensaje: 'Pago registrado correctamente', pago });
});

const listar = asyncHandler(async (req, res) => {
  const filtro = {};
  if (!esStaff(req.usuario)) filtro.usuario = req.usuario.id;
  if (req.query.parqueaderoId) filtro.parqueaderoId = String(req.query.parqueaderoId);
  const d = aFecha(req.query.desde, false);
  const h = aFecha(req.query.hasta, true);
  if (d || h) filtro.createdAt = { ...(d && { $gte: d }), ...(h && { $lte: h }) };

  const pagos = await Pago.find(filtro).populate('usuario', 'nombre').sort({ createdAt: -1 }).limit(200).lean();
  res.json({ total: pagos.length, pagos });
});

module.exports = { registrar, listar };
