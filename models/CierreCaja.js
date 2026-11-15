const mongoose = require('mongoose');

const cierreCajaSchema = new mongoose.Schema({
  parqueaderoId: { type: String, required: true, index: true },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  desde: { type: Date, required: true },
  hasta: { type: Date, required: true },
  totalIngresos: { type: Number, required: true, min: 0 },
  cantidadFacturas: { type: Number, required: true, min: 0 },
  observaciones: { type: String, default: '' },
}, { timestamps: true });

cierreCajaSchema.index({ parqueaderoId: 1, hasta: -1 });

module.exports = mongoose.model('CierreCaja', cierreCajaSchema);
