const mongoose = require('mongoose');

const facturaSchema = new mongoose.Schema({
  registro: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RegistroEntrada', 
    required: true,
  },
  placa: {
    type: String,
    required: true,
  },
  tiempoTotalMinutos: {
    type: Number,
    required: true,
  },
  valorCobrado: {
    type: Number,
    required: true,
  },
  fechaEmision: {
    type: Date,
    default: Date.now,
  },
  parqueaderoId: {
    type: String,
    default: '',
    index: true,
  },
  tipoVehiculo: {
    type: String,
    default: 'carro',
  },
  desglose: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
}, {
  timestamps: true,
});

facturaSchema.index({ placa: 1, fechaEmision: -1 });
facturaSchema.index({ fechaEmision: -1 });
facturaSchema.index({ parqueaderoId: 1, fechaEmision: -1 });

module.exports = mongoose.model('Factura', facturaSchema);
