const Auditoria = require('../models/Auditoria');

async function registrarAuditoria({ usuarioId, accion, entidad, entidadId, detalle, parqueaderoId }) {
  try {
    await Auditoria.create({
      usuario: usuarioId || null,
      accion,
      entidad,
      entidadId: entidadId ? String(entidadId) : '',
      detalle: detalle || '',
      parqueaderoId: parqueaderoId ? String(parqueaderoId) : '',
    });
  } catch (error) {
    console.error('No se pudo guardar la auditoria:', error.message);
  }
}

module.exports = { registrarAuditoria };
