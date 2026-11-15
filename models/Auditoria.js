const mongoose = require('mongoose');

const auditoriaSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null, index: true },
  accion: { type: String, required: true, index: true },
  entidad: { type: String, default: '' },
  entidadId: { type: String, default: '' },
  detalle: { type: String, default: '' },
  parqueaderoId: { type: String, default: '', index: true },
}, { timestamps: true });

auditoriaSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Auditoria', auditoriaSchema);
