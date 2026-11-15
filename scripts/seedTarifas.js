// Uso: npm run seed:tarifas  -> crea tarifas por tipo de vehiculo para todas las sedes.
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const Parqueadero = require('../models/Parqueadero');
const { asegurarTarifas } = require('./lib/tarifas');

(async () => {
  await connectDB();
  const sedes = await Parqueadero.find({ activo: true }).sort({ createdAt: 1 });
  const n = await asegurarTarifas(sedes);
  console.log(`✅ ${n} tarifas listas para ${sedes.length} sedes`);
  await mongoose.connection.close();
  process.exit(0);
})().catch((e) => { console.error('❌', e); process.exit(1); });
