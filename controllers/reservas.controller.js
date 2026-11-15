const Reserva = require('../models/Reserva');
const Puesto = require('../models/Puesto');
const RegistroEntrada = require('../models/RegistroEntrada');
const { tipoTarifa } = require('../services/cobro');
const { registrarAuditoria } = require('../services/auditoria');
const { crearNotificacion } = require('../services/notificaciones');
const { getIO } = require('../config/socket');
const { aFecha } = require('../utils/fechas');
const { ErrorHttp } = require('../utils/errores');
const asyncHandler = require('../utils/asyncHandler');

const MAX_HORAS = 24;
const esStaff = (u) => u.rol === 'admin' || u.rol === 'operador';

const crear = asyncHandler(async (req, res) => {
  const { puestoId, placa } = req.body;
  const inicio = aFecha(req.body.inicio);
  const fin = aFecha(req.body.fin);
  if (!inicio || !fin) throw new ErrorHttp(400, 'Las fechas de la reserva no son válidas');

  const ahora = new Date();
  if (inicio.getTime() < ahora.getTime() - 5 * 60000) throw new ErrorHttp(400, 'La reserva no puede empezar en el pasado');
  if (fin <= inicio) throw new ErrorHttp(400, 'La hora de fin debe ser posterior al inicio');
  if ((fin - inicio) / 3600000 > MAX_HORAS) throw new ErrorHttp(400, `Una reserva no puede durar más de ${MAX_HORAS} horas`);

  const puesto = await Puesto.findById(puestoId);
  if (!puesto) throw new ErrorHttp(404, 'Puesto no encontrado');

  const choque = await Reserva.findOne({
    puesto: puesto._id,
    estado: 'activa',
    inicio: { $lt: fin },
    fin: { $gt: inicio },
  });
  if (choque) throw new ErrorHttp(409, 'Ese puesto ya está reservado en ese horario');

  const reservaPlaca = await Reserva.findOne({ placa, estado: 'activa', inicio: { $lt: fin }, fin: { $gt: inicio } });
  if (reservaPlaca) throw new ErrorHttp(409, 'Esa placa ya tiene una reserva en ese horario');

  // Si la reserva empieza ahora, el puesto debe estar libre.
  const empiezaYa = inicio.getTime() <= ahora.getTime() + 60000;
  if (empiezaYa && puesto.estado !== 'libre') {
    throw new ErrorHttp(409, 'El puesto no está libre en este momento');
  }
  if (empiezaYa) {
    const dentro = await RegistroEntrada.findOne({ puesto: puesto._id, estado: 'activo' });
    if (dentro) throw new ErrorHttp(409, 'El puesto está ocupado en este momento');
  }

  const reserva = await Reserva.create({
    usuario: req.usuario.id,
    puesto: puesto._id,
    parqueaderoId: String(puesto.parqueaderoId),
    placa,
    tipoVehiculo: req.body.tipoVehiculo || tipoTarifa(puesto.tipo),
    inicio,
    fin,
  });

  if (empiezaYa) {
    const p = await Puesto.findByIdAndUpdate(puesto._id, { estado: 'reservado' }, { new: true });
    getIO().emit('puesto_actualizado', p);
  }

  registrarAuditoria({
    usuarioId: req.usuario.id, accion: 'reserva_creada', entidad: 'reserva', entidadId: reserva._id,
    detalle: `Reserva del puesto ${puesto.numero} para ${placa}`, parqueaderoId: puesto.parqueaderoId,
  });

  res.status(201).json({ mensaje: 'Reserva creada correctamente', reserva });
});

const listar = asyncHandler(async (req, res) => {
  const filtro = {};
  if (!esStaff(req.usuario)) filtro.usuario = req.usuario.id;
  else if (req.query.mias === 'true') filtro.usuario = req.usuario.id;
  if (req.query.estado) filtro.estado = String(req.query.estado);
  if (req.query.parqueaderoId) filtro.parqueaderoId = String(req.query.parqueaderoId);
  if (req.query.placa) filtro.placa = String(req.query.placa).trim().toUpperCase();

  const reservas = await Reserva.find(filtro)
    .populate('puesto', 'numero nivel tipo')
    .populate('usuario', 'nombre')
    .sort({ inicio: -1 })
    .limit(200)
    .lean();
  res.json({ total: reservas.length, reservas });
});

const cancelar = asyncHandler(async (req, res) => {
  const reserva = await Reserva.findById(req.params.id);
  if (!reserva) throw new ErrorHttp(404, 'Reserva no encontrada');
  if (!esStaff(req.usuario) && String(reserva.usuario) !== String(req.usuario.id)) {
    throw new ErrorHttp(403, 'No puedes cancelar la reserva de otra persona');
  }
  if (reserva.estado !== 'activa') throw new ErrorHttp(409, `La reserva ya está ${reserva.estado}`);

  reserva.estado = 'cancelada';
  await reserva.save();

  const p = await Puesto.findOneAndUpdate({ _id: reserva.puesto, estado: 'reservado' }, { estado: 'libre' }, { new: true });
  if (p) getIO().emit('puesto_actualizado', p);

  registrarAuditoria({
    usuarioId: req.usuario.id, accion: 'reserva_cancelada', entidad: 'reserva', entidadId: reserva._id,
    detalle: `Reserva de ${reserva.placa} cancelada`, parqueaderoId: reserva.parqueaderoId,
  });
  if (String(reserva.usuario) !== String(req.usuario.id)) {
    crearNotificacion({
      usuarioId: reserva.usuario,
      tipo: 'reserva_vencida',
      titulo: 'Reserva cancelada',
      mensaje: `Tu reserva para la placa ${reserva.placa} fue cancelada por el personal.`,
      datos: { reservaId: String(reserva._id) },
    }).catch(() => {});
  }
  res.json({ mensaje: 'Reserva cancelada', reserva });
});

module.exports = { crear, listar, cancelar };
