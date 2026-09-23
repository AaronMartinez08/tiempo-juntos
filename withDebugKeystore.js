const { withAppBuildGradle } = require('expo/config-plugins');

// Hace que el "release" de Android se firme siempre con el mismo almacén de firma
// (debug.keystore, en la raíz del proyecto), en vez de con uno distinto en cada
// compilación. Así, instalar una versión nueva encima de la anterior funciona,
// porque Android exige que las dos tengan la misma firma para poder actualizar.
// Expo regenera la carpeta android/ en cada compilación (prebuild), así que este
// cambio tiene que aplicarse con un plugin de configuración en vez de editando
// android/app/build.gradle a mano.
module.exports = function withDebugKeystore(config) {
  return withAppBuildGradle(config, config => {
    let src = config.modResults.contents;

    if (!src.includes('storeFile file(\'../../debug.keystore\')')) {
      const bloqueFirma =
        "    signingConfigs {\n" +
        "        debug {\n" +
        "            storeFile file('../../debug.keystore')\n" +
        "            storePassword 'android'\n" +
        "            keyAlias 'androiddebugkey'\n" +
        "            keyPassword 'android'\n" +
        "        }\n" +
        "    }\n";
      src = src.replace(/signingConfigs\s*\{[^}]*debug\s*\{[^}]*\}\s*\}/s, bloqueFirma.trim());
      if (!src.includes("storeFile file('../../debug.keystore')")) {
        // Si el proyecto no traía ya un bloque signingConfigs con "debug", lo añadimos.
        src = src.replace(/android\s*\{/, 'android {\n' + bloqueFirma);
      }
    }
    // El tipo de compilación "release" usa este mismo almacén, así queda firmado
    // igual que las compilaciones anteriores.
    src = src.replace(
      /(buildTypes\s*\{\s*(?:debug\s*\{[^}]*\}\s*)?release\s*\{)([^}]*)\}/s,
      (m, cabecera, cuerpo) => {
        if (/signingConfig\s+signingConfigs\.debug/.test(cuerpo)) return m;
        const limpio = cuerpo.replace(/signingConfig\s+signingConfigs\.\w+\n?/g, '');
        return cabecera + limpio + '            signingConfig signingConfigs.debug\n        }';
      }
    );

    config.modResults.contents = src;
    return config;
  });
};
