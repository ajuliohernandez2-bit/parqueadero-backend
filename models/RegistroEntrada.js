const mongoose = require('mongoose');

const registroEntradaSchema = new mongoose.Schema({
  puesto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Puesto', 
    required: true,
  },
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario', 
    required: true,
  },
  placa: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
  },
  horaEntrada: {
    type: Date,
    default: Date.now,
  },
  horaSalida: {
    type: Date,
    default: null, 
  },
  estado: {
    type: String,
    enum: ['activo', 'finalizado'],
    default: 'activo',
  },
  tipoVehiculo: {
    type: String,
    enum: ['carro', 'moto', 'bicicleta'],
    default: 'carro',
  },
}, {
  timestamps: true,
});

registroEntradaSchema.index({ placa: 1, estado: 1 });
registroEntradaSchema.index({ horaEntrada: -1 });
registroEntradaSchema.index({ usuario: 1, horaEntrada: -1 });
registroEntradaSchema.index({ estado: 1, horaEntrada: -1 });

module.exports = mongoose.model('RegistroEntrada', registroEntradaSchema);
