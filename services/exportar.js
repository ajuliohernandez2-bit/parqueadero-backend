const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// columnas: [{ titulo, campo, ancho?, formato? ('pesos'|'fecha'|undefined) }]
async function enviarXlsx(res, nombreArchivo, titulo, columnas, filas, resumen = []) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Parking Tracker';
  libro.created = new Date();
  const hoja = libro.addWorksheet('Reporte');

  hoja.addRow([titulo]).font = { bold: true, size: 14 };
  for (const [k, v] of resumen) hoja.addRow([k, v]);
  hoja.addRow([]);

  const cabecera = hoja.addRow(columnas.map((c) => c.titulo));
  cabecera.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cabecera.eachCell((celda) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B2058' } };
  });

  for (const fila of filas) {
    const r = hoja.addRow(columnas.map((c) => fila[c.campo]));
    columnas.forEach((c, i) => {
      if (c.formato === 'pesos') r.getCell(i + 1).numFmt = '"$"#,##0';
    });
  }
  columnas.forEach((c, i) => { hoja.getColumn(i + 1).width = c.ancho || 18; });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}.xlsx"`);
  await libro.xlsx.write(res);
  res.end();
}

function enviarPdf(res, nombreArchivo, titulo, columnas, filas, resumen = []) {
  const doc = new PDFDocument({ size: 'A4', margin: 36, layout: columnas.length > 5 ? 'landscape' : 'portrait' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).fillColor('#3b2058').text('Parking Tracker', { continued: true })
    .fontSize(11).fillColor('#555').text(`   ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`);
  doc.moveDown(0.3).fontSize(14).fillColor('#000').text(titulo);
  doc.moveDown(0.3).fontSize(10).fillColor('#333');
  for (const [k, v] of resumen) doc.text(`${k}: ${v}`);
  doc.moveDown(0.6);

  const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const anchoCol = ancho / columnas.length;
  const inferior = () => doc.page.height - doc.page.margins.bottom - 20;

  const dibujarFila = (celdas, negrita) => {
    const y = doc.y;
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    let alto = 12;
    celdas.forEach((t, i) => {
      const h = doc.heightOfString(String(t ?? ''), { width: anchoCol - 6 });
      alto = Math.max(alto, h);
    });
    if (y + alto > inferior()) {
      doc.addPage();
      return dibujarFila(celdas, negrita);
    }
    if (negrita) doc.rect(doc.page.margins.left, y - 2, ancho, alto + 4).fill('#ece6f3').fillColor('#000');
    celdas.forEach((t, i) => {
      doc.fillColor('#000').text(String(t ?? ''), doc.page.margins.left + i * anchoCol, y, { width: anchoCol - 6 });
    });
    doc.y = y + alto + 4;
    return undefined;
  };

  dibujarFila(columnas.map((c) => c.titulo), true);
  for (const fila of filas) {
    dibujarFila(columnas.map((c) => {
      const v = fila[c.campo];
      if (c.formato === 'pesos') return `$${Number(v || 0).toLocaleString('es-CO')}`;
      return v;
    }), false);
  }
  if (filas.length === 0) doc.moveDown().fontSize(10).text('Sin datos para el período seleccionado.');
  doc.end();
}

// Envia el reporte segun ?formato=xlsx|pdf. Devuelve true si respondio un archivo.
async function responderArchivo(req, res, opciones) {
  const { formato } = req.query;
  const { nombre, titulo, columnas, filas, resumen } = opciones;
  if (formato === 'xlsx') {
    await enviarXlsx(res, nombre, titulo, columnas, filas, resumen);
    return true;
  }
  if (formato === 'pdf') {
    enviarPdf(res, nombre, titulo, columnas, filas, resumen);
    return true;
  }
  return false;
}

module.exports = { enviarXlsx, enviarPdf, responderArchivo };
