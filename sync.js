// Lee y escribe en Firebase Realtime Database usando su API REST (con fetch),
// sin necesitar el SDK de Firebase. Cada ruta de la base de datos es una URL:
// añadir ".json" al final basta para leer o escribir ese nodo.
import { FIREBASE_DB_URL } from './config';

const TIMEOUT_MS = 8000;

async function conTiempo(promesa) {
  let temporizador;
  const limite = new Promise((_, rej) => {
    temporizador = setTimeout(() => rej(new Error('tiempo de espera agotado')), TIMEOUT_MS);
  });
  try {
    return await Promise.race([promesa, limite]);
  } finally {
    clearTimeout(temporizador);
  }
}

export async function leer(ruta) {
  const res = await conTiempo(fetch(`${FIREBASE_DB_URL}/${ruta}.json`));
  if (!res.ok) throw new Error('error al leer ' + ruta + ': ' + res.status);
  return res.json();
}

export async function escribir(ruta, valor) {
  const res = await conTiempo(fetch(`${FIREBASE_DB_URL}/${ruta}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(valor),
  }));
  if (!res.ok) throw new Error('error al escribir ' + ruta + ': ' + res.status);
  return res.json();
}
