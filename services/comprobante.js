const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { formatoColombia } = require('../utils/fechas');

const pesos = (v) => `$${Number(v || 0).toLocaleString('es-CO')}`;

// Genera el ticket (entrada o salida) en PDF con un codigo QR.
async function generarComprobante(res, { registro, puesto, sede, factura }) {
  const finalizado = registro.estado === 'finalizado';
  const contenidoQR = JSON.stringify({
    t: 'parking-tracker',
    registro: String(registro._id),
    placa: registro.placa,
    estado: registro.estado,
  });
  const qr = await QRCode.toBuffer(contenidoQR, { width: 220, margin: 1 });

  const doc = new PDFDocument({ size: [300, 520], margin: 20 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="comprobante-${registro.placa}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).fillColor('#3b2058').text('Parking Tracker', { align: 'center' });
  doc.fontSize(10).fillColor('#555').text(sede?.nombre || 'Parqueadero', { align: 'center' });
  if (sede?.direccion) doc.text(sede.direccion, { align: 'center' });
  doc.moveDown(0.5).fontSize(12).fillColor('#000')
    .text(finalizado ? 'COMPROBANTE DE SALIDA' : 'TICKET DE ENTRADA', { align: 'center' });
  doc.moveTo(20, doc.y + 4).lineTo(280, doc.y + 4).strokeColor('#ccc').stroke();
  doc.moveDown(0.8);

  const linea = (k, v) => {
    doc.fontSize(9).fillColor('#666').text(k, { continued: true })
      .fillColor('#000').text(`  ${v}`, { align: 'right' });
  };
  linea('Placa', registro.placa);
  linea('Puesto', `${puesto?.numero || '-'} (${puesto?.nivel || ''})`);
  linea('Vehículo', registro.tipoVehiculo || 'carro');
  linea('Entrada', formatoColombia(registro.horaEntrada));
  if (finalizado) {
    linea('Salida', formatoColombia(registro.horaSalida));
    if (factura) {
      linea('Tiempo', `${factura.tiempoTotalMinutos} min`);
      const d = factura.desglose;
      if (d) {
        linea('Tarifa/hora', pesos(d.valorHora));
        linea('Fracción', `${d.fraccionMinutos} min`);
        if (d.topeDiario) linea('Tope diario', pesos(d.topeDiario));
      }
      doc.moveDown(0.5).fontSize(14).fillColor('#3b2058')
        .text(`TOTAL: ${pesos(factura.valorCobrado)}`, { align: 'center' });
    }
  } else {
    doc.moveDown(0.5).fontSize(9).fillColor('#666')
      .text('Conserva este ticket. El valor se calcula al registrar la salida.', { align: 'center' });
  }

  doc.image(qr, 40, doc.y + 12, { width: 220 });
  doc.y += 12 + 220;
  doc.fontSize(8).fillColor('#888').text(`ID ${registro._id}`, 20, doc.y + 6, { align: 'center', width: 260 });
  doc.end();
}

module.exports = { generarComprobante };
