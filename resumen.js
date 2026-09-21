// Cálculos sencillos (sin pantalla) para resumir las lecturas de ubicación.

export function mediana(nums) {
  if (!nums.length) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Resume una lista de lecturas [{ t, acc, lat, lon }] (t = milisegundos).
export function resumir(log, inicio, ahora) {
  const n = log.length;
  if (!n) return { n: 0, desdeInicioSeg: inicio ? Math.round((ahora - inicio) / 1000) : null };
  const t = log.map(x => x.t);
  const huecos = [];
  for (let i = 1; i < n; i++) huecos.push((t[i] - t[i - 1]) / 1000);
  const acc = log.map(x => x.acc).filter(x => typeof x === 'number');
  return {
    n,
    haceSeg: Math.max(0, Math.round((ahora - t[n - 1]) / 1000)),
    duracionSeg: Math.round((t[n - 1] - t[0]) / 1000),
    tipicoSeg: huecos.length ? mediana(huecos) : null,
    mayorHuecoSeg: huecos.length ? Math.max(...huecos) : null,
    precisionMediana: acc.length ? mediana(acc) : null,
  };
}

function duracion(seg) {
  if (seg == null) return '–';
  if (seg < 90) return Math.round(seg) + ' s';
  return Math.round(seg / 60) + ' min';
}

export function textoResumen(r, plataforma) {
  if (!r || !r.n) return 'Todavía no hay lecturas guardadas.';
  return (
    'Prueba de GPS en segundo plano (' + plataforma + '): ' + r.n + ' lecturas en ' + duracion(r.duracionSeg) +
    '; una lectura cada ' + duracion(r.tipicoSeg) + ' (típico); mayor hueco sin lecturas: ' + duracion(r.mayorHuecoSeg) +
    '; precisión mediana ±' + (r.precisionMediana == null ? '?' : Math.round(r.precisionMediana)) + ' m.'
  );
}
