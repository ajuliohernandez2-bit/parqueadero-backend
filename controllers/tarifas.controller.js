const Tarifa = require('../models/Tarifa');
const { calcularCobro, tarifaAplicable } = require('../services/cobro');
const { registrarAuditoria } = require('../services/auditoria');
const { ErrorHttp } = require('../utils/errores');
const asyncHandler = require('../utils/asyncHandler');

const listar = asyncHandler(async (req, res) => {
  const filtro = req.query.parqueaderoId ? { parqueaderoId: String(req.query.parqueaderoId) } : {};
  const tarifas = await Tarifa.find(filtro).sort({ parqueaderoId: 1, tipoVehiculo: 1 }).lean();
  res.json({ total: tarifas.length, tarifas });
});

const crear = asyncHandler(async (req, res) => {
  const existente = await Tarifa.findOne({
    parqueaderoId: req.body.parqueaderoId,
    tipoVehiculo: req.body.tipoVehiculo,
  });
  if (existente) throw new ErrorHttp(409, 'Esa sede ya tiene una tarifa para ese tipo de vehículo');
  const tarifa = await Tarifa.create(req.body);
  registrarAuditoria({
    usuarioId: req.usuario.id, accion: 'tarifa_creada', entidad: 'tarifa', entidadId: tarifa._id,
    detalle: `${tarifa.tipoVehiculo}: $${tarifa.valorHora}/hora`, parqueaderoId: tarifa.parqueaderoId,
  });
  res.status(201).json({ mensaje: 'Tarifa creada correctamente', tarifa });
});

const actualizar = asyncHandler(async (req, res) => {
  const tarifa = await Tarifa.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!tarifa) throw new ErrorHttp(404, 'Tarifa no encontrada');
  registrarAuditoria({
    usuarioId: req.usuario.id, accion: 'tarifa_actualizada', entidad: 'tarifa', entidadId: tarifa._id,
    detalle: `${tarifa.tipoVehiculo}: $${tarifa.valorHora}/hora, fracción ${tarifa.fraccionMinutos} min, tope $${tarifa.topeDiario}`,
    parqueaderoId: tarifa.parqueaderoId,
  });
  res.json({ mensaje: 'Tarifa actualizada correctamente', tarifa });
});

const eliminar = asyncHandler(async (req, res) => {
  const tarifa = await Tarifa.findByIdAndDelete(req.params.id);
  if (!tarifa) throw new ErrorHttp(404, 'Tarifa no encontrada');
  registrarAuditoria({
    usuarioId: req.usuario.id, accion: 'tarifa_eliminada', entidad: 'tarifa', entidadId: tarifa._id,
    detalle: `${tarifa.tipoVehiculo}`, parqueaderoId: tarifa.parqueaderoId,
  });
  res.json({ mensaje: 'Tarifa eliminada. Se usará la tarifa por minuto de la sede.' });
});

// Publico: cuanto costaria estacionar X minutos en una sede.
const estimar = asyncHandler(async (req, res) => {
  const { parqueaderoId, tipoVehiculo, minutos } = req.query;
  const tarifa = await tarifaAplicable(parqueaderoId, tipoVehiculo);
  const cobro = calcularCobro({
    minutos,
    valorHora: tarifa.valorHora,
    fraccionMinutos: tarifa.fraccionMinutos,
    topeDiario: tarifa.topeDiario,
  });
  res.json({ parqueaderoId, tipoVehiculo, ...cobro });
});

module.exports = { listar, crear, actualizar, eliminar, estimar };
