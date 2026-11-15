const mongoose = require('mongoose');

const pagoSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
  parqueaderoId: { type: String, default: '', index: true },
  factura: { type: mongoose.Schema.Types.ObjectId, ref: 'Factura', default: null },
  reserva: { type: mongoose.Schema.Types.ObjectId, ref: 'Reserva', default: null },
  placa: { type: String, default: '', uppercase: true },
  monto: { type: Number, required: true, min: 0 },
  metodo: { type: String, enum: ['efectivo', 'tarjeta', 'transferencia'], default: 'efectivo' },
  estado: { type: String, enum: ['pendiente', 'confirmado'], default: 'confirmado', index: true },
  concepto: { type: String, default: '' },
}, { timestamps: true });

pagoSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Pago', pagoSchema);
