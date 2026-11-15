const mongoose = require('mongoose');

const reservaSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true, index: true },
  puesto: { type: mongoose.Schema.Types.ObjectId, ref: 'Puesto', required: true, index: true },
  parqueaderoId: { type: String, required: true, index: true },
  placa: { type: String, required: true, uppercase: true, trim: true, index: true },
  tipoVehiculo: { type: String, enum: ['carro', 'moto', 'bicicleta'], default: 'carro' },
  inicio: { type: Date, required: true, index: true },
  fin: { type: Date, required: true, index: true },
  estado: {
    type: String,
    enum: ['activa', 'vencida', 'cancelada', 'cumplida'],
    default: 'activa',
    index: true,
  },
  avisoVencimientoEnviado: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Reserva', reservaSchema);
