// Datos de DEMOSTRACION para la Expoferia.
// Uso (despues de `npm run seed:mallplaza` y `npm run seed:parqueaderos`):
//   npm run seed:demo
//
// Deja la app lista para mostrar: usuarios de prueba (admin, operador, cliente),
// tarifas por sede y tipo de vehiculo, vehiculos dentro ahora (cada sede con una
// ocupacion distinta), 7 dias de historial con facturas cobradas segun la tarifa,
// pagos, reservas (activas, cumplidas, vencidas, canceladas), auditoria,
// notificaciones y un cierre de caja por sede. Se puede correr varias veces:
// borra lo que creo la vez anterior y lo vuelve a generar.
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { connectDB } = require('../config/db');
const Usuario = require('../models/Usuario');
const Parqueadero = require('../models/Parqueadero');
const Puesto = require('../models/Puesto');
const RegistroEntrada = require('../models/RegistroEntrada');
const Factura = require('../models/Factura');
const Pago = require('../models/Pago');
const Reserva = require('../models/Reserva');
const Auditoria = require('../models/Auditoria');
const CierreCaja = require('../models/CierreCaja');
const Notificacion = require('../models/Notificacion');
const { asegurarTarifas } = require('./lib/tarifas');
const { tipoTarifa, tarifaAplicable, calcularCobro } = require('../services/cobro');
const { inicioDeHoy } = require('../utils/fechas');

const PASSWORD_DEMO = 'Demo1234';
const MARCA = ' [demo]';

// Horas del dia con mas movimiento (mañana, almuerzo y salida de oficina).
const PESO_POR_HORA = [
  0, 0, 0, 0, 0, 1, 2, 6, 8, 5, 4, 5,
  8, 9, 6, 4, 5, 8, 9, 6, 3, 2, 1, 0,
];
const METODOS = ['efectivo', 'efectivo', 'tarjeta', 'transferencia'];

function aleatorio(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
const elegir = (lista) => lista[aleatorio(0, lista.length - 1)];

const LETRAS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const letra = () => LETRAS[aleatorio(0, LETRAS.length - 1)];
// Formato colombiano: carro ABC123, moto ABC12D.
function placaAleatoria(tipo) {
  const base = `${letra()}${letra()}${letra()}`;
  if (tipo === 'moto') return `${base}${aleatorio(10, 99)}${letra()}`;
  return `${base}${aleatorio(100, 999)}`;
}

function horaConPeso() {
  const total = PESO_POR_HORA.reduce((a, b) => a + b, 0);
  let n = Math.random() * total;
  for (let h = 0; h < 24; h++) {
    n -= PESO_POR_HORA[h];
    if (n <= 0) return h;
  }
  return 12;
}

async function asegurarUsuario({ nombre, email, rol }) {
  const password = await bcrypt.hash(PASSWORD_DEMO, 10);
  return Usuario.findOneAndUpdate(
    { email },
    { $set: { nombre, password, rol, activo: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function correrSeedDemo() {
  await connectDB();

  const parqueaderos = await Parqueadero.find({ activo: true }).sort({ createdAt: 1 });
  if (parqueaderos.length === 0) {
    console.error('❌ No hay parqueaderos. Corre primero: npm run seed:mallplaza y npm run seed:parqueaderos');
    process.exit(1);
  }

  const admin = await asegurarUsuario({ nombre: 'Admin Demo', email: 'admin@demo.com', rol: 'admin' });
  const operador = await asegurarUsuario({ nombre: 'Operador Demo', email: 'operador@demo.com', rol: 'operador' });
  const cliente = await asegurarUsuario({ nombre: 'Cliente Demo', email: 'cliente@demo.com', rol: 'cliente' });
  console.log('👤 Usuarios demo listos: admin@demo.com, operador@demo.com y cliente@demo.com');

  const nTarifas = await asegurarTarifas(parqueaderos);
  console.log(`💲 ${nTarifas} tarifas listas (carro, moto y bicicleta por sede)`);

  // Limpieza de lo generado en corridas anteriores (solo datos de la demo).
  const viejos = await RegistroEntrada.find({ usuario: operador._id }).select('_id');
  const idsViejos = viejos.map((r) => r._id);
  const facturasViejas = await Factura.find({ registro: { $in: idsViejos } }).select('_id');
  await Pago.deleteMany({ $or: [{ factura: { $in: facturasViejas.map((f) => f._id) } }, { usuario: cliente._id }] });
  await Factura.deleteMany({ registro: { $in: idsViejos } });
  await RegistroEntrada.deleteMany({ _id: { $in: idsViejos } });
  await Reserva.deleteMany({ usuario: { $in: [cliente._id, operador._id] } });
  await Auditoria.deleteMany({ detalle: new RegExp(`${MARCA.replace(/[[\]]/g, '\\$&')}$`) });
  await CierreCaja.deleteMany({ observaciones: new RegExp(`${MARCA.replace(/[[\]]/g, '\\$&')}$`) });
  await Notificacion.deleteMany({ usuario: { $in: [cliente._id, admin._id, operador._id] } });

  // Placas unicas en TODA la demo (una placa no puede estar dos veces activa).
  const placasUsadas = new Set();
  const nuevaPlaca = (tipo) => {
    let p = placaAleatoria(tipo);
    while (placasUsadas.has(p)) p = placaAleatoria(tipo);
    placasUsadas.add(p);
    return p;
  };

  const ahora = Date.now();
  const hoy = inicioDeHoy(new Date(ahora));
  let sedeMasLlena = { nombre: '', porcentaje: 0, id: '' };

  for (const parqueadero of parqueaderos) {
    const parqueaderoId = String(parqueadero._id);
    const puestos = await Puesto.find({ parqueaderoId });
    if (puestos.length === 0) {
      console.log(`⏭️  ${parqueadero.nombre}: sin puestos, se omite`);
      continue;
    }
    await Puesto.updateMany({ parqueaderoId }, { $set: { estado: 'libre' } });

    // Tarifas de la sede (una sola consulta por tipo).
    const tarifas = {};
    for (const t of ['carro', 'moto', 'bicicleta']) tarifas[t] = await tarifaAplicable(parqueaderoId, t);

    // 1) Historial de los ultimos 7 dias (proporcional al tamano de la sede)
    const cantidadHistorial = Math.max(60, puestos.length * 2);
    const historial = [];
    const facturas = [];
    const pagos = [];
    const eventos = [];
    for (let i = 0; i < cantidadHistorial; i++) {
      const puesto = elegir(puestos);
      const tipo = tipoTarifa(puesto.tipo);
      const diasAtras = aleatorio(0, 7);
      const entrada = new Date(ahora - diasAtras * 86400000);
      // ajustar a una hora "con peso" (hora de Colombia = UTC-5)
      entrada.setUTCHours((horaConPeso() + 5) % 24, aleatorio(0, 59), 0, 0);
      const minutos = aleatorio(20, tipo === 'bicicleta' ? 120 : 300);
      const salida = new Date(entrada.getTime() + minutos * 60000);
      if (salida.getTime() > ahora) continue;

      const registro = new RegistroEntrada({
        puesto: puesto._id,
        usuario: operador._id,
        placa: nuevaPlaca(tipo),
        horaEntrada: entrada,
        horaSalida: salida,
        estado: 'finalizado',
        tipoVehiculo: tipo,
      });
      historial.push(registro);

      const t = tarifas[tipo];
      const cobro = calcularCobro({ minutos, valorHora: t.valorHora, fraccionMinutos: t.fraccionMinutos, topeDiario: t.topeDiario });
      const factura = new Factura({
        registro: registro._id,
        placa: registro.placa,
        tiempoTotalMinutos: minutos,
        valorCobrado: cobro.valor,
        fechaEmision: salida,
        parqueaderoId,
        tipoVehiculo: tipo,
        desglose: cobro,
      });
      facturas.push(factura);

      if (Math.random() < 0.75) {
        pagos.push(new Pago({
          usuario: operador._id,
          parqueaderoId,
          factura: factura._id,
          placa: registro.placa,
          monto: cobro.valor,
          metodo: elegir(METODOS),
          estado: 'confirmado',
          concepto: `Factura ${registro.placa}`,
          createdAt: salida,
          updatedAt: salida,
        }));
      }
      if (eventos.length < 40) {
        eventos.push(new Auditoria({
          usuario: operador._id, accion: 'entrada', entidad: 'registro', entidadId: String(registro._id),
          detalle: `Entrada de ${registro.placa} al puesto ${puesto.numero}${MARCA}`, parqueaderoId, createdAt: entrada, updatedAt: entrada,
        }));
        eventos.push(new Auditoria({
          usuario: operador._id, accion: 'salida', entidad: 'factura', entidadId: String(factura._id),
          detalle: `Salida de ${registro.placa}: ${minutos} min, $${cobro.valor}${MARCA}`, parqueaderoId, createdAt: salida, updatedAt: salida,
        }));
      }
    }
    await RegistroEntrada.insertMany(historial);
    await Factura.insertMany(facturas);
    if (pagos.length) await Pago.insertMany(pagos);

    // 2) Vehiculos dentro ahora: cada sede con una ocupacion distinta (25%-85%)
    const porcentaje = 0.25 + Math.random() * 0.6;
    const mezclados = [...puestos].sort(() => Math.random() - 0.5);
    const ocupar = mezclados.slice(0, Math.round(puestos.length * porcentaje));
    const activos = ocupar.map((puesto) => {
      const tipo = tipoTarifa(puesto.tipo);
      return new RegistroEntrada({
        puesto: puesto._id,
        usuario: operador._id,
        placa: nuevaPlaca(tipo),
        horaEntrada: new Date(ahora - aleatorio(5, 180) * 60000),
        estado: 'activo',
        tipoVehiculo: tipo,
      });
    });
    await RegistroEntrada.insertMany(activos);
    await Puesto.updateMany({ _id: { $in: ocupar.map((p) => p._id) } }, { $set: { estado: 'ocupado' } });

    // 3) Reservas: algunas vigentes ahora (puesto "reservado"), otras futuras y un historial.
    const libres = mezclados.slice(ocupar.length).filter((p) => p.tipo !== 'bicicleta');
    const reservas = [];
    const reservadosAhora = libres.splice(0, Math.min(3, libres.length));
    for (const p of reservadosAhora) {
      reservas.push(new Reserva({
        usuario: cliente._id, puesto: p._id, parqueaderoId, placa: nuevaPlaca(tipoTarifa(p.tipo)), tipoVehiculo: tipoTarifa(p.tipo),
        inicio: new Date(ahora - 10 * 60000), fin: new Date(ahora + aleatorio(30, 120) * 60000), estado: 'activa',
      }));
    }
    for (const p of libres.splice(0, Math.min(3, libres.length))) {
      const inicio = new Date(ahora + aleatorio(60, 360) * 60000);
      reservas.push(new Reserva({
        usuario: cliente._id, puesto: p._id, parqueaderoId, placa: nuevaPlaca(tipoTarifa(p.tipo)), tipoVehiculo: tipoTarifa(p.tipo),
        inicio, fin: new Date(inicio.getTime() + aleatorio(1, 3) * 3600000), estado: 'activa',
      }));
    }
    const estadosPasados = ['cumplida', 'cumplida', 'vencida', 'cancelada'];
    for (let i = 0; i < 4 && libres.length; i++) {
      const p = libres.shift();
      const inicio = new Date(ahora - aleatorio(1, 6) * 86400000);
      reservas.push(new Reserva({
        usuario: cliente._id, puesto: p._id, parqueaderoId, placa: nuevaPlaca(tipoTarifa(p.tipo)), tipoVehiculo: tipoTarifa(p.tipo),
        inicio, fin: new Date(inicio.getTime() + 2 * 3600000), estado: estadosPasados[i % estadosPasados.length], avisoVencimientoEnviado: true,
      }));
    }
    if (reservas.length) await Reserva.insertMany(reservas);
    if (reservadosAhora.length) {
      await Puesto.updateMany({ _id: { $in: reservadosAhora.map((p) => p._id) } }, { $set: { estado: 'reservado' } });
    }

    // 4) Cierre de caja: todo lo anterior a hoy ya quedo cerrado; lo de hoy queda pendiente.
    const primera = await Factura.findOne({ parqueaderoId }).sort({ fechaEmision: 1 }).lean();
    if (primera && primera.fechaEmision < hoy) {
      const desde = primera.fechaEmision;
      const hasta = new Date(hoy.getTime() - 1);
      const [t] = await Factura.aggregate([
        { $match: { parqueaderoId, fechaEmision: { $gte: desde, $lte: hasta } } },
        { $group: { _id: null, total: { $sum: '$valorCobrado' }, cantidad: { $sum: 1 } } },
      ]);
      if (t) {
        await CierreCaja.create({
          parqueaderoId, usuario: admin._id, desde, hasta,
          totalIngresos: t.total, cantidadFacturas: t.cantidad, observaciones: `Cierre demo${MARCA}`,
        });
        eventos.push(new Auditoria({
          usuario: admin._id, accion: 'cierre_caja', entidad: 'cierre', entidadId: '',
          detalle: `Cierre de caja: $${t.total} (${t.cantidad} facturas)${MARCA}`, parqueaderoId,
        }));
      }
    }
    if (eventos.length) await Auditoria.insertMany(eventos);

    const pct = Math.round((ocupar.length / puestos.length) * 100);
    if (pct > sedeMasLlena.porcentaje) sedeMasLlena = { nombre: parqueadero.nombre, porcentaje: pct, id: parqueaderoId };
    console.log(`🅿️  ${parqueadero.nombre}: ${ocupar.length}/${puestos.length} ocupados · ${historial.length} registros · ${reservas.length} reservas`);
  }

  // 5) Notificaciones de ejemplo
  await Notificacion.insertMany([
    { usuario: cliente._id, tipo: 'reserva_por_vencer', titulo: 'Tu reserva esta por vencer', mensaje: 'Tu reserva vence en pocos minutos. Llega a tiempo para no perder el puesto.', leida: false },
    { usuario: cliente._id, tipo: 'pago_confirmado', titulo: 'Pago confirmado', mensaje: 'Recibimos tu pago. Gracias por usar Parking Tracker.', leida: true },
    ...(sedeMasLlena.nombre ? [admin._id, operador._id].map((u) => ({
      usuario: u, tipo: 'ocupacion_alta', titulo: `Ocupacion alta en ${sedeMasLlena.nombre}`,
      mensaje: `${sedeMasLlena.nombre} esta al ${sedeMasLlena.porcentaje}% de ocupacion.`, leida: false, datos: { parqueaderoId: sedeMasLlena.id },
    })) : []),
  ]);

  console.log('\n✅ Demo lista. Credenciales (contraseña: ' + PASSWORD_DEMO + ')');
  console.log('   admin@demo.com    → administrador');
  console.log('   operador@demo.com → operador');
  console.log('   cliente@demo.com  → cliente (reservas y pagos)');

  await mongoose.connection.close();
  process.exit(0);
}

correrSeedDemo().catch((error) => {
  console.error('❌ Error al ejecutar el seed de demo:', error);
  process.exit(1);
});
