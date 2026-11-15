const mongoose = require('mongoose');

const notificacionSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
  tipo: {
    type: String,
    enum: ['reserva_por_vencer', 'reserva_vencida', 'pago_confirmado', 'ocupacion_alta'],
    required: true,
  },
  titulo: { type: String, required: true },
  mensaje: { type: String, required: true },
  leida: { type: Boolean, default: false, index: true },
  datos: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

notificacionSchema.index({ usuario: 1, leida: 1, createdAt: -1 });

module.exports = mongoose.model('Notificacion', notificacionSchema);
