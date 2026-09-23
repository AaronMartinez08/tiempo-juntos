// Un "tick" completo de sincronización: sube mi ubicación, baja la de mi pareja,
// recalcula el estado de "juntos" (contadores.js) y lo guarda. Se llama tanto
// desde la tarea en segundo plano como desde la pantalla abierta, así que la
// lógica vive en un solo sitio.
import { leer, escribir } from './sync';
import { ROLES } from './config';
import { distanciaMetros, estadoInicial, actualizar } from './contadores';

const MAX_ANTIGUEDAD_PAREJA_MS = 5 * 60 * 1000; // una ubicación de la pareja de hace más de 5 min no cuenta

function otroRol(rol) {
  return rol === ROLES[0] ? ROLES[1] : ROLES[0];
}

// miUbicacion: { lat, lon, acc } | null (null si no hay lectura nueva, pero igualmente
// recalculamos el estado por si el margen ha vencido).
export async function tick(miRol, miUbicacion, reglas) {
  const ahora = Date.now();
  const otro = otroRol(miRol);

  if (miUbicacion) {
    await escribir(`personas/${miRol}/ubicacion`, { ...miUbicacion, t: ahora });
  }

  const [ubicacionPropia, ubicacionOtro, estadoGuardado] = await Promise.all([
    leer(`personas/${miRol}/ubicacion`),
    leer(`personas/${otro}/ubicacion`),
    leer('estado'),
  ]);

  const estadoPrevio = estadoGuardado || estadoInicial();
  const ultimo = estadoPrevio.ultimoCalculo || ahora;

  let distancia = null;
  if (ubicacionPropia && ubicacionOtro && ahora - ubicacionOtro.t <= MAX_ANTIGUEDAD_PAREJA_MS) {
    distancia = distanciaMetros(ubicacionPropia, ubicacionOtro);
  }

  const nuevoEstado = actualizar(estadoPrevio, {
    distancia,
    umbral: reglas.umbral,
    margenSeg: reglas.margenSeg,
    ahora,
    ultimo,
  });
  nuevoEstado.ultimoCalculo = ahora;

  await escribir('estado', nuevoEstado);

  return { estado: nuevoEstado, distancia, ubicacionOtro, ahora };
}
