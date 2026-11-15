const Notificacion = require('../models/Notificacion');
const { ErrorHttp } = require('../utils/errores');
const asyncHandler = require('../utils/asyncHandler');

const listar = asyncHandler(async (req, res) => {
  const filtro = { usuario: req.usuario.id };
  if (req.query.noLeidas === 'true') filtro.leida = false;
  const [notificaciones, noLeidas] = await Promise.all([
    Notificacion.find(filtro).sort({ createdAt: -1 }).limit(50).lean(),
    Notificacion.countDocuments({ usuario: req.usuario.id, leida: false }),
  ]);
  res.json({ total: notificaciones.length, noLeidas, notificaciones });
});

const marcarLeida = asyncHandler(async (req, res) => {
  const n = await Notificacion.findOneAndUpdate(
    { _id: req.params.id, usuario: req.usuario.id },
    { leida: true },
    { new: true },
  );
  if (!n) throw new ErrorHttp(404, 'Notificacion no encontrada');
  res.json({ notificacion: n });
});

const marcarTodas = asyncHandler(async (req, res) => {
  const r = await Notificacion.updateMany({ usuario: req.usuario.id, leida: false }, { leida: true });
  res.json({ mensaje: 'Notificaciones marcadas como leídas', actualizadas: r.modifiedCount });
});

module.exports = { listar, marcarLeida, marcarTodas };
