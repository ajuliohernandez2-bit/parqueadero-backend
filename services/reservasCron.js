const cron = require('node-cron');
const Reserva = require('../models/Reserva');
const Puesto = require('../models/Puesto');
const { crearNotificacion } = require('./notificaciones');
const { getIO } = require('../config/socket');

const AVISO_MINUTOS = 10;

function emitirPuesto(puesto) {
  try { getIO().emit('puesto_actualizado', puesto); } catch (e) { /* sin socket */ }
}

// 1) Marca como "reservado" los puestos cuya reserva ya empezo.
// 2) Avisa 10 min antes de que venza.
// 3) Vence las reservas cuyo tiempo termino y libera el puesto.
async function procesarReservas() {
  const ahora = new Date();

  const porActivar = await Reserva.find({ estado: 'activa', inicio: { $lte: ahora }, fin: { $gt: ahora } });
  for (const r of porActivar) {
    const p = await Puesto.findOneAndUpdate({ _id: r.puesto, estado: 'libre' }, { estado: 'reservado' }, { new: true });
    if (p) emitirPuesto(p);
  }

  const limiteAviso = new Date(ahora.getTime() + AVISO_MINUTOS * 60000);
  const porAvisar = await Reserva.find({
    estado: 'activa',
    avisoVencimientoEnviado: false,
    fin: { $gt: ahora, $lte: limiteAviso },
  }).populate('puesto', 'numero');
  for (const r of porAvisar) {
    r.avisoVencimientoEnviado = true;
    await r.save();
    await crearNotificacion({
      usuarioId: r.usuario,
      tipo: 'reserva_por_vencer',
      titulo: 'Tu reserva está por vencer',
      mensaje: `La reserva del puesto ${r.puesto?.numero || ''} para la placa ${r.placa} vence en pocos minutos.`,
      datos: { reservaId: String(r._id) },
    });
  }

  const vencidas = await Reserva.find({ estado: 'activa', fin: { $lte: ahora } }).populate('puesto', 'numero');
  for (const r of vencidas) {
    r.estado = 'vencida';
    await r.save();
    const p = await Puesto.findOneAndUpdate({ _id: r.puesto?._id || r.puesto, estado: 'reservado' }, { estado: 'libre' }, { new: true });
    if (p) emitirPuesto(p);
    await crearNotificacion({
      usuarioId: r.usuario,
      tipo: 'reserva_vencida',
      titulo: 'Tu reserva venció',
      mensaje: `La reserva del puesto ${r.puesto?.numero || ''} (placa ${r.placa}) venció y el puesto fue liberado.`,
      datos: { reservaId: String(r._id) },
    });
  }
}

function iniciarCronReservas() {
  const ejecutar = () => procesarReservas().catch((e) => console.error('Error en la tarea de reservas:', e.message));
  ejecutar();
  cron.schedule('* * * * *', ejecutar);
  console.log('⏰ Tarea programada de reservas activa (cada minuto)');
}

module.exports = { iniciarCronReservas, procesarReservas };
