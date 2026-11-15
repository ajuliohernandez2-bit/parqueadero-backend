const Auditoria = require('../models/Auditoria');
const { aFecha } = require('../utils/fechas');
const asyncHandler = require('../utils/asyncHandler');

function filtroAuditoria(q) {
  const filtro = {};
  if (q.parqueaderoId) filtro.parqueaderoId = String(q.parqueaderoId);
  if (q.accion) filtro.accion = String(q.accion);
  const d = aFecha(q.desde, false);
  const h = aFecha(q.hasta, true);
  if (d || h) filtro.createdAt = { ...(d && { $gte: d }), ...(h && { $lte: h }) };
  return filtro;
}

const listar = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const filtro = filtroAuditoria(req.query);
  const [total, eventos] = await Promise.all([
    Auditoria.countDocuments(filtro),
    Auditoria.find(filtro).populate('usuario', 'nombre rol').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);
  res.json({ total, page, limit, paginas: Math.ceil(total / limit) || 1, eventos });
});

module.exports = { listar, filtroAuditoria };
