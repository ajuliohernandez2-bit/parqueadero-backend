// Utilidades de fechas. Colombia no usa horario de verano: siempre es UTC-5.
const OFFSET_COLOMBIA = '-05:00';
const MS_DIA = 24 * 60 * 60 * 1000;

function aFecha(valor, finDelDia = false) {
  if (!valor) return null;
  const texto = String(valor).trim();
  // "AAAA-MM-DD" se interpreta en hora de Colombia (inicio o fin de ese dia).
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const f = new Date(`${texto}T${finDelDia ? '23:59:59.999' : '00:00:00.000'}${OFFSET_COLOMBIA}`);
    return Number.isNaN(f.getTime()) ? null : f;
  }
  const f = new Date(texto);
  return Number.isNaN(f.getTime()) ? null : f;
}

// Rango [desde, hasta] a partir de query params. Por defecto: ultimos `diasPorDefecto` dias.
function rangoFechas(desde, hasta, diasPorDefecto = 30) {
  const fin = aFecha(hasta, true) || new Date();
  const inicio = aFecha(desde, false) || new Date(fin.getTime() - diasPorDefecto * MS_DIA);
  return { desde: inicio, hasta: fin };
}

// Inicio del dia de hoy en hora de Colombia.
function inicioDeHoy(ahora = new Date()) {
  const colombia = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
  const y = colombia.getUTCFullYear();
  const m = String(colombia.getUTCMonth() + 1).padStart(2, '0');
  const d = String(colombia.getUTCDate()).padStart(2, '0');
  return new Date(`${y}-${m}-${d}T00:00:00.000${OFFSET_COLOMBIA}`);
}

function formatoColombia(fecha) {
  if (!fecha) return '';
  return new Date(fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
}

module.exports = { aFecha, rangoFechas, inicioDeHoy, formatoColombia, MS_DIA };
