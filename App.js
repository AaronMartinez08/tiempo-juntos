import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ROLES } from './config';
import { tick } from './sincronizar';

// Tiempo juntos: la app real. Cada móvil sube su ubicación a Firebase, lee la
// del otro, y entre los dos calculan cuánto tiempo lleváis juntos seguidos
// (racha) y en total (acumulado). No hay servidor propio: Firebase hace de
// intermediario, así que basta con que los dos móviles tengan internet de vez
// en cuando, no a la vez.

const h = React.createElement;
const TAREA = 'tiempo-juntos-ubicacion';
const CLAVE_ROL = 'tj:rol';
const CLAVE_NOMBRE_PROPIO = 'tj:nombre-propio';
const CLAVE_NOMBRE_OTRO = 'tj:nombre-otro';
const CLAVE_REGLAS = 'tj:reglas';
const CLAVE_PASO = 'tj:paso';
const CLAVE_ERROR = 'tj:error';
const REGLAS_POR_DEFECTO = { umbral: 50, margenSeg: 300 };

try {
  const eu = global.ErrorUtils;
  if (eu && eu.setGlobalHandler) {
    const previo = eu.getGlobalHandler ? eu.getGlobalHandler() : null;
    eu.setGlobalHandler((error, fatal) => {
      AsyncStorage.setItem(CLAVE_ERROR, String(error && error.message ? error.message : error).slice(0, 300)).catch(() => {});
      if (previo) previo(error, fatal);
    });
  }
} catch (e) { /* nada */ }

async function marcar(paso) {
  try { await AsyncStorage.setItem(CLAVE_PASO, paso); } catch (e) { /* nada */ }
}

async function leerReglas() {
  try {
    const raw = await AsyncStorage.getItem(CLAVE_REGLAS);
    return raw ? { ...REGLAS_POR_DEFECTO, ...JSON.parse(raw) } : REGLAS_POR_DEFECTO;
  } catch (e) {
    return REGLAS_POR_DEFECTO;
  }
}

// Se ejecuta aunque la app esté en segundo plano: sube la ubicación nueva,
// recalcula el estado compartido y lo guarda. Si falla (sin internet, Firebase
// caído), no revienta: la próxima lectura lo vuelve a intentar.
TaskManager.defineTask(TAREA, async ({ data, error }) => {
  if (error) return;
  const locs = data && data.locations;
  if (!locs || !locs.length) return;
  try {
    const rol = await AsyncStorage.getItem(CLAVE_ROL);
    if (!rol) return; // todavía no ha elegido quién es
    const ultima = locs[locs.length - 1];
    const reglas = await leerReglas();
    await tick(rol, { lat: ultima.coords.latitude, lon: ultima.coords.longitude, acc: ultima.coords.accuracy }, reglas);
  } catch (e) {
    // sin conexión o Firebase caído: se reintenta en la próxima lectura
  }
});

async function pedirNotificaciones() {
  if (Platform.OS !== 'android' || Platform.Version < 33) return;
  try { await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS); } catch (e) { /* nada */ }
}

function fmt(s) {
  s = Math.max(0, Math.round(s));
  const p2 = n => String(n).padStart(2, '0');
  return p2(Math.floor(s / 3600)) + ':' + p2(Math.floor(s % 3600 / 60)) + ':' + p2(s % 60);
}

function fila(etiqueta, valor) {
  return h(View, { style: st.fila, key: etiqueta }, h(Text, { style: st.etiqueta }, etiqueta), h(Text, { style: st.valor }, valor));
}

// --- Pantalla: elegir quién eres, la primera vez ---
function PantallaRol({ onElegido }) {
  return h(ScrollView, { style: st.pantalla, contentContainerStyle: st.contenido },
    h(Text, { style: st.titulo }, 'Tiempo juntos'),
    h(Text, { style: st.sub }, '¿Quién eres tú en este móvil?'),
    h(View, { style: st.tarjeta },
      h(Text, { style: st.pasos },
        'Elige una persona por móvil. Tu pareja debe elegir la otra en el suyo. ' +
        'Esto solo se pregunta una vez, y sirve para que los dos móviles sepan cuál es cuál.'),
      h(TouchableOpacity, { style: [st.boton, st.botonPrincipal], onPress: () => onElegido(ROLES[0]) },
        h(Text, { style: [st.botonTexto, st.botonTextoPrincipal] }, 'Soy la Persona 1')),
      h(TouchableOpacity, { style: [st.boton, st.botonPrincipal], onPress: () => onElegido(ROLES[1]) },
        h(Text, { style: [st.botonTexto, st.botonTextoPrincipal] }, 'Soy la Persona 2'))));
}

export default function App() {
  const [rol, setRol] = useState(undefined); // undefined = cargando, null = sin elegir, 'A'/'B' = elegido
  const [activo, setActivo] = useState(false);
  const [permiso, setPermiso] = useState('–');
  const [estado, setEstado] = useState(null);
  const [distancia, setDistancia] = useState(null);
  const [msg, setMsg] = useState('');
  const [avisoAnterior, setAvisoAnterior] = useState('');
  const [sincronizando, setSincronizando] = useState(false);
  const reglasRef = useRef(REGLAS_POR_DEFECTO);

  useEffect(() => {
    (async () => {
      const guardado = await AsyncStorage.getItem(CLAVE_ROL);
      setRol(guardado || null);
      const paso = await AsyncStorage.getItem(CLAVE_PASO);
      const err = await AsyncStorage.getItem(CLAVE_ERROR);
      if ((paso && paso !== 'ok' && paso !== 'abierta') || err) {
        setAvisoAnterior('La última vez la app se cerró' + (err ? '. Error: ' + err : '') + '. Cuéntaselo a Claude.');
      }
      await AsyncStorage.multiRemove([CLAVE_ERROR]);
      if (paso !== 'ok') await marcar('abierta');
      reglasRef.current = await leerReglas();
    })();
  }, []);

  const refrescarEstado = useCallback(async () => {
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      const bg = await Location.getBackgroundPermissionsAsync();
      setPermiso(bg.status === 'granted' ? 'Siempre' : fg.status === 'granted' ? 'Solo con la app abierta' : 'Sin permiso');
      setActivo(await Location.hasStartedLocationUpdatesAsync(TAREA));
    } catch (e) { /* nada */ }
  }, []);

  const sincronizarAhora = useCallback(async () => {
    if (!rol) return;
    setSincronizando(true);
    try {
      const pos = await Location.getLastKnownPositionAsync({});
      const reglas = reglasRef.current;
      const ubic = pos ? { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy } : null;
      const r = await tick(rol, ubic, reglas);
      setEstado(r.estado);
      setDistancia(r.distancia);
      setMsg('');
    } catch (e) {
      setMsg('No se pudo sincronizar: ' + (e && e.message ? e.message : 'sin conexión'));
    }
    setSincronizando(false);
  }, [rol]);

  useEffect(() => {
    if (!rol) return;
    refrescarEstado();
    sincronizarAhora();
    const reloj = setInterval(() => { refrescarEstado(); sincronizarAhora(); }, 8000);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') { refrescarEstado(); sincronizarAhora(); } });
    return () => { clearInterval(reloj); if (sub && sub.remove) sub.remove(); };
  }, [rol, refrescarEstado, sincronizarAhora]);

  const elegirRol = async r => {
    await AsyncStorage.setItem(CLAVE_ROL, r);
    setRol(r);
  };

  const empezar = async () => {
    setMsg(''); setAvisoAnterior('');
    let aviso = '';
    try {
      await marcar('permiso-ubicacion');
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== 'granted') { setMsg('Falta el permiso de ubicación. Actívalo en los ajustes del móvil.'); return; }
      await marcar('permiso-siempre');
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status !== 'granted') {
        aviso = Platform.OS === 'ios'
          ? 'Para medir con el móvil bloqueado: Ajustes > Tiempo juntos > Ubicación > Siempre. Luego pulsa Empezar otra vez.'
          : 'Para medir con el móvil bloqueado: Ajustes > Aplicaciones > Tiempo juntos > Permisos > Ubicación > Permitir todo el tiempo. Luego pulsa Empezar otra vez.';
        setMsg(aviso);
      }
      await marcar('permiso-notificaciones');
      await pedirNotificaciones();
      if (await Location.hasStartedLocationUpdatesAsync(TAREA)) await Location.stopLocationUpdatesAsync(TAREA);
      await marcar('servicio-en-primer-plano');
      await Location.startLocationUpdatesAsync(TAREA, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 20000,
        distanceInterval: 15,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: { notificationTitle: 'Tiempo juntos', notificationBody: 'Compartiendo tu ubicación' },
      });
      await marcar('ok');
    } catch (e) {
      setMsg((aviso ? aviso + '\n\n' : '') + 'No se pudo empezar: ' + (e && e.message ? e.message : 'error desconocido'));
    }
    refrescarEstado();
  };

  const parar = async () => {
    try {
      if (await Location.hasStartedLocationUpdatesAsync(TAREA)) await Location.stopLocationUpdatesAsync(TAREA);
      await marcar('ok');
    } catch (e) { setMsg('No se pudo parar: ' + (e && e.message ? e.message : 'error desconocido')); }
    refrescarEstado();
  };

  if (rol === undefined) return h(View, { style: st.pantalla });
  if (rol === null) return h(PantallaRol, { onElegido: elegirRol });

  const juntos = distancia != null && distancia <= reglasRef.current.umbral;
  const estadoTexto = !estado ? 'Cargando…' : juntos ? 'Juntos' : (estado.streakSegundos > 0 || estado.apartDesde) ? 'Racha en espera' : 'Separados';

  return h(ScrollView, { style: st.pantalla, contentContainerStyle: st.contenido },
    h(Text, { style: st.titulo }, 'Tiempo juntos'),
    h(Text, { style: st.sub }, rol === ROLES[0] ? 'Eres la Persona 1' : 'Eres la Persona 2'),
    avisoAnterior ? h(View, { style: [st.tarjeta, st.tarjetaAviso] },
      h(Text, { style: st.avisoTitulo }, 'Aviso de la última vez'),
      h(Text, { style: st.aviso, selectable: true }, avisoAnterior)) : null,
    h(View, { style: st.tarjeta },
      h(Text, { style: st.estadoTexto }, estadoTexto),
      h(Text, { style: st.distanciaTexto }, distancia == null ? 'Sin datos de tu pareja todavía' : 'Distancia aprox.: ' + Math.round(distancia) + ' m'),
      h(View, { style: st.contadores },
        h(View, { style: st.contador }, h(Text, { style: st.contLabel }, 'Racha actual'), h(Text, { style: st.contValor }, fmt(estado ? estado.streakSegundos : 0))),
        h(View, { style: st.contador }, h(Text, { style: st.contLabel }, 'Acumulado'), h(Text, { style: st.contValor }, fmt(estado ? estado.totalSegundos : 0))))),
    h(View, { style: st.tarjeta },
      h(TouchableOpacity, { style: [st.boton, st.botonPrincipal], onPress: activo ? parar : empezar },
        h(Text, { style: [st.botonTexto, st.botonTextoPrincipal] }, activo ? 'Parar de compartir ubicación' : 'Empezar a compartir ubicación')),
      h(TouchableOpacity, { style: st.boton, onPress: sincronizarAhora, disabled: sincronizando },
        h(Text, { style: st.botonTexto }, sincronizando ? 'Sincronizando…' : 'Sincronizar ahora')),
      msg ? h(Text, { style: st.aviso }, msg) : null),
    h(View, { style: st.tarjeta },
      fila('Permiso de ubicación', permiso),
      fila('Compartiendo ahora', activo ? 'Sí' : 'No')));
}

const st = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#FFF0F4' },
  contenido: { padding: 20, paddingTop: Platform.OS === 'ios' ? 64 : 48, paddingBottom: 48 },
  titulo: { fontSize: 28, fontWeight: '700', color: '#4A2C35' },
  sub: { fontSize: 15, color: '#7D5E68', marginTop: 4, marginBottom: 16 },
  tarjeta: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, marginBottom: 16, borderWidth: 1.5, borderColor: '#F1D2DB' },
  tarjetaAviso: { borderColor: '#E9A3A3', backgroundColor: '#FFF4F4' },
  avisoTitulo: { fontSize: 16, fontWeight: '700', color: '#9B2B2B', marginBottom: 6 },
  pasos: { fontSize: 15, color: '#4A2C35', lineHeight: 22, marginBottom: 14 },
  estadoTexto: { fontSize: 24, fontWeight: '700', color: '#4A2C35' },
  distanciaTexto: { fontSize: 14, color: '#7D5E68', marginTop: 4, marginBottom: 14 },
  contadores: { flexDirection: 'row', gap: 12 },
  contador: { flex: 1, backgroundColor: '#FFF0F4', borderRadius: 16, padding: 12 },
  contLabel: { fontSize: 13, color: '#7D5E68' },
  contValor: { fontSize: 22, fontWeight: '700', color: '#4A2C35', marginTop: 2 },
  boton: { minHeight: 48, borderRadius: 999, borderWidth: 1.5, borderColor: '#E3B5C3', alignItems: 'center', justifyContent: 'center', marginBottom: 10, backgroundColor: '#FFFFFF' },
  botonPrincipal: { backgroundColor: '#4A2C35', borderColor: '#4A2C35' },
  botonTexto: { fontSize: 16, fontWeight: '600', color: '#4A2C35' },
  botonTextoPrincipal: { color: '#FFF0F4' },
  aviso: { fontSize: 14, color: '#9B2B2B', marginTop: 4, lineHeight: 20 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  etiqueta: { fontSize: 15, color: '#7D5E68' },
  valor: { fontSize: 15, fontWeight: '600', color: '#4A2C35' },
});
