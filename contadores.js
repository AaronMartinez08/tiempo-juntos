// Lógica de "juntos": calcula la distancia entre dos ubicaciones GPS (fórmula de
// Haversine) y lleva la racha actual y el tiempo acumulado, con un margen antes
// de dar la racha por rota. No depende de React Native ni de Firebase: es lógica
// pura, fácil de probar aparte.

const RADIO_TIERRA_M = 6371000;

// Distancia en metros entre dos puntos (lat/lon en grados).
export function distanciaMetros(a, b) {
  const rad = g => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

// estado guardado: { streakDesde, streakSegundos, totalSegundos, apartDesde, ultimoCalculo }
// Todo en milisegundos desde época (Date.now()), salvo streakSegundos/totalSegundos.
export function estadoInicial() {
  return { streakSegundos: 0, totalSegundos: 0, apartDesde: null, juntosDesde: null };
}

// Aplica una nueva medición al estado y devuelve el estado actualizado.
// distancia: metros entre los dos móviles, o null si no hay ubicación de alguno.
// ahora: Date.now() de este cálculo. ultimo: Date.now() del cálculo anterior (o null la primera vez).
export function actualizar(estado, { distancia, umbral, margenSeg, ahora, ultimo }) {
  const dt = ultimo ? Math.max(0, Math.min(300, (ahora - ultimo) / 1000)) : 0; // tope de 5 min por salto, por si la app estuvo cerrada
  const juntos = distancia != null && distancia <= umbral;
  const s = { ...estado };

  if (juntos) {
    s.streakSegundos += dt;
    s.totalSegundos += dt;
    s.apartDesde = null;
  } else if (s.streakSegundos > 0 || s.apartDesde) {
    // solo cuenta el tiempo "en espera" si ya había una racha viva
    if (!s.apartDesde) s.apartDesde = ultimo || ahora;
    const segsFuera = (ahora - s.apartDesde) / 1000;
    if (segsFuera > margenSeg) {
      s.streakSegundos = 0;
      s.apartDesde = null;
    }
  }
  return s;
}

export function estadoActual(estado, umbral, distancia) {
  if (distancia != null && distancia <= umbral) return 'together';
  return estado.streakSegundos > 0 || estado.apartDesde ? 'waiting' : 'apart';
}
