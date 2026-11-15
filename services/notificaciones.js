const Notificacion = require('../models/Notificacion');
const Usuario = require('../models/Usuario');
const { getIO } = require('../config/socket');

function emitir(usuarioId, evento, payload) {
  try {
    const io = getIO();
    io.to(`usuario:${usuarioId}`).emit(evento, payload);
  } catch (error) {
    // El socket puede no estar listo en pruebas o en el arranque.
  }
}

async function crearNotificacion({ usuarioId, tipo, titulo, mensaje, datos }) {
  const doc = await Notificacion.create({
    usuario: usuarioId,
    tipo,
    titulo,
    mensaje,
    datos: datos || {},
  });
  const plana = doc.toObject();
  emitir(String(usuarioId), 'notificacion', plana);
  return plana;
}

async function notificarStaff(tipo, titulo, mensaje, datos) {
  const staff = await Usuario.find({ rol: { $in: ['admin', 'operador'] }, activo: { $ne: false } }).select('_id');
  await Promise.all(staff.map((u) => crearNotificacion({
    usuarioId: u._id,
    tipo,
    titulo,
    mensaje,
    datos,
  })));
  try {
    getIO().emit('alerta_ocupacion', datos || { titulo, mensaje });
  } catch (error) {
    // sin socket
  }
}

module.exports = { crearNotificacion, notificarStaff };
