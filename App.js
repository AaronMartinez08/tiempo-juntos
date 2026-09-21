import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resumir, textoResumen } from './resumen';

// PRUEBA 1: comprobar que el móvil sigue dando su ubicación con la pantalla bloqueada.
// No envía nada a internet: las lecturas se guardan solo en este móvil.

const h = React.createElement;
const TAREA = 'tiempo-juntos-ubicacion';
const CLAVE_LOG = 'tj:log';
const CLAVE_INICIO = 'tj:inicio';
const MAX_LOG = 600;

// Esta función la ejecuta el sistema cada vez que llegan lecturas nuevas, aunque la app esté en segundo plano.
TaskManager.defineTask(TAREA, async ({ data, error }) => {
  if (error) return;
  const locs = data && data.locations;
  if (!locs || !locs.length) return;
  try {
    const raw = await AsyncStorage.getItem(CLAVE_LOG);
    const log = raw ? JSON.parse(raw) : [];
    for (const l of locs) {
      log.push({ t: l.timestamp, acc: l.coords.accuracy, lat: l.coords.latitude, lon: l.coords.longitude });
    }
    await AsyncStorage.setItem(CLAVE_LOG, JSON.stringify(log.slice(-MAX_LOG)));
  } catch (e) {
    // si falla al guardar una lectura, se ignora
  }
});

function fila(etiqueta, valor) {
  return h(View, { style: st.fila, key: etiqueta },
    h(Text, { style: st.etiqueta }, etiqueta),
    h(Text, { style: st.valor }, valor));
}

export default function App() {
  const [msg, setMsg] = useState('');
  const [activo, setActivo] = useState(false);
  const [permiso, setPermiso] = useState('–');
  const [res, setRes] = useState(null);

  const refrescar = useCallback(async () => {
    try {
      const fg = await Location.getForegroundPermissionsAsync();
      const bg = await Location.getBackgroundPermissionsAsync();
      setPermiso(bg.status === 'granted' ? 'Siempre' : fg.status === 'granted' ? 'Solo con la app abierta' : 'Sin permiso');
      setActivo(await Location.hasStartedLocationUpdatesAsync(TAREA));
      const raw = await AsyncStorage.getItem(CLAVE_LOG);
      const inicio = Number(await AsyncStorage.getItem(CLAVE_INICIO)) || null;
      setRes(resumir(raw ? JSON.parse(raw) : [], inicio, Date.now()));
    } catch (e) {
      setMsg('No se pudo actualizar: ' + (e && e.message ? e.message : 'error desconocido'));
    }
  }, []);

  useEffect(() => {
    refrescar();
    const reloj = setInterval(refrescar, 5000);
    const sub = AppState.addEventListener('change', estado => { if (estado === 'active') refrescar(); });
    return () => { clearInterval(reloj); if (sub && sub.remove) sub.remove(); };
  }, [refrescar]);

  const empezar = async () => {
    setMsg('');
    let aviso = '';
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status !== 'granted') { setMsg('Falta el permiso de ubicación. Actívalo en los ajustes del móvil.'); return; }
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status !== 'granted') {
        aviso = Platform.OS === 'ios'
          ? 'Para medir con el móvil bloqueado: Ajustes > Tiempo juntos > Ubicación > Siempre. Luego pulsa Empezar otra vez.'
          : 'Para medir con el móvil bloqueado: Ajustes > Aplicaciones > Tiempo juntos > Permisos > Ubicación > Permitir todo el tiempo. Luego pulsa Empezar otra vez.';
        setMsg(aviso);
      }
      await AsyncStorage.multiSet([[CLAVE_LOG, '[]'], [CLAVE_INICIO, String(Date.now())]]);
      if (await Location.hasStartedLocationUpdatesAsync(TAREA)) await Location.stopLocationUpdatesAsync(TAREA);
      await Location.startLocationUpdatesAsync(TAREA, {
        accuracy: Location.Accuracy.High,
        timeInterval: 10000,
        distanceInterval: 0,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Tiempo juntos',
          notificationBody: 'Midiendo tu ubicación',
        },
      });
    } catch (e) {
      setMsg((aviso ? aviso + '\n\n' : '') + 'No se pudo empezar: ' + (e && e.message ? e.message : 'error desconocido'));
    }
    refrescar();
  };

  const parar = async () => {
    try {
      if (await Location.hasStartedLocationUpdatesAsync(TAREA)) await Location.stopLocationUpdatesAsync(TAREA);
    } catch (e) {
      setMsg('No se pudo parar: ' + (e && e.message ? e.message : 'error desconocido'));
    }
    refrescar();
  };

  return h(ScrollView, { style: st.pantalla, contentContainerStyle: st.contenido },
    h(Text, { style: st.titulo }, 'Tiempo juntos'),
    h(Text, { style: st.sub }, 'Prueba 1: el GPS con el móvil bloqueado'),
    h(View, { style: st.tarjeta },
      h(Text, { style: st.pasos },
        '1. Pulsa Empezar y acepta los permisos (elige "Permitir siempre" cuando lo pregunte).\n' +
        '2. Bloquea el móvil y déjalo unos 10 minutos, o sal a pasear con él.\n' +
        '3. Desbloquea y pulsa Actualizar.'),
      h(TouchableOpacity, { style: [st.boton, st.botonPrincipal], onPress: activo ? parar : empezar },
        h(Text, { style: [st.botonTexto, st.botonTextoPrincipal] }, activo ? 'Parar' : 'Empezar')),
      h(TouchableOpacity, { style: st.boton, onPress: refrescar },
        h(Text, { style: st.botonTexto }, 'Actualizar')),
      msg ? h(Text, { style: st.aviso }, msg) : null),
    h(View, { style: st.tarjeta },
      fila('Permiso de ubicación', permiso),
      fila('Midiendo ahora', activo ? 'Sí' : 'No'),
      fila('Lecturas guardadas', String(res ? res.n : 0)),
      fila('Última lectura', res && res.n ? 'hace ' + res.haceSeg + ' s' : '–'),
      h(Text, { style: st.resumen, selectable: true }, textoResumen(res, Platform.OS)),
      h(Text, { style: st.ayuda }, 'Mantén pulsado el texto de arriba para copiarlo y pégalo en el chat.')));
}

const st = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#FFF0F4' },
  contenido: { padding: 20, paddingTop: Platform.OS === 'ios' ? 64 : 48, paddingBottom: 48 },
  titulo: { fontSize: 28, fontWeight: '700', color: '#4A2C35' },
  sub: { fontSize: 15, color: '#7D5E68', marginTop: 4, marginBottom: 16 },
  tarjeta: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, marginBottom: 16, borderWidth: 1.5, borderColor: '#F1D2DB' },
  pasos: { fontSize: 15, color: '#4A2C35', lineHeight: 22, marginBottom: 14 },
  boton: { minHeight: 48, borderRadius: 999, borderWidth: 1.5, borderColor: '#E3B5C3', alignItems: 'center', justifyContent: 'center', marginBottom: 10, backgroundColor: '#FFFFFF' },
  botonPrincipal: { backgroundColor: '#4A2C35', borderColor: '#4A2C35' },
  botonTexto: { fontSize: 16, fontWeight: '600', color: '#4A2C35' },
  botonTextoPrincipal: { color: '#FFF0F4' },
  aviso: { fontSize: 14, color: '#9B2B2B', marginTop: 4, lineHeight: 20 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  etiqueta: { fontSize: 15, color: '#7D5E68' },
  valor: { fontSize: 15, fontWeight: '600', color: '#4A2C35' },
  resumen: { fontSize: 15, color: '#4A2C35', lineHeight: 22, marginTop: 12, padding: 12, borderRadius: 16, backgroundColor: '#FFF0F4' },
  ayuda: { fontSize: 13, color: '#7D5E68', marginTop: 8 },
});
