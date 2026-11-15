const mongoose = require('mongoose');

const tarifaSchema = new mongoose.Schema({
  parqueaderoId: { type: String, required: true, index: true },
  tipoVehiculo: { type: String, enum: ['carro', 'moto', 'bicicleta'], required: true },
  valorHora: { type: Number, required: true, min: 0 },
  fraccionMinutos: { type: Number, required: true, min: 1, default: 15 },
  topeDiario: { type: Number, required: true, min: 0, default: 0 },
}, { timestamps: true });

tarifaSchema.index({ parqueaderoId: 1, tipoVehiculo: 1 }, { unique: true });

module.exports = mongoose.model('Tarifa', tarifaSchema);
