// ════════════════════════════════════════════════════════════════
// GOOGLE APPS SCRIPT — Backend para Elevate Athletes PWA
//
// SETUP INICIAL (hacer una vez por entrenador):
//  1. Ve a script.google.com → Nuevo proyecto
//  2. Pega este código completo
//  3. Cambia SHEET_ID por el ID de tu Google Sheet
//  4. Despliega como Web App:
//       Ejecutar como: Yo (Me)
//       Quién tiene acceso: Cualquier usuario (Anyone)
//  5. Copia la URL del despliegue y pégala en CONFIG.GAS_URL (index.html)
//
// PARA CADA CLIENTE NUEVO:
//  Ejecuta setupNewClient('nombre_cliente') desde el editor
//  Esto crea las hojas de configuración y sesiones con datos de ejemplo
// ════════════════════════════════════════════════════════════════

const SHEET_ID = 'TU_SHEET_ID_AQUI';

// ── doPost: guarda datos enviados por la app ──────────────────
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const { action, clientId } = data;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let result = { ok: false };

  try {
    if (action === 'savePeso') {
      const sheet = getOrCreateSheet(ss, `${clientId}_Peso`);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['Fecha', 'Peso (kg)', 'Timestamp']);
      }
      sheet.appendRow([data.fecha, data.kg, new Date().toISOString()]);
      result = { ok: true };
    }

    else if (action === 'saveFeedback') {
      const sheet = getOrCreateSheet(ss, `${clientId}_Feedback`);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['Fecha','Energía','Recuperación','Sueño','Dieta','Bienestar','Motivación','Comentarios','Timestamp']);
      }
      sheet.appendRow([
        data.date, data.energia, data.recuperacion, data.sueno,
        data.dieta, data.bienestar, data.motivacion,
        data.comments || '', new Date().toISOString()
      ]);
      result = { ok: true };
    }

    else if (action === 'saveTraining') {
      const sheet = getOrCreateSheet(ss, `${clientId}_Entreno`);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['Fecha','Sesión','Ejercicio','Serie','Kg','Reps','RIR','Tonelaje','Timestamp']);
      }
      let totalTon = 0;
      data.rows.forEach((row) => {
        const ton = (parseFloat(row.kg)||0) * (parseFloat(row.reps)||0);
        totalTon += ton;
        sheet.appendRow([
          data.date, data.session, row.ejercicio || '',
          row.serie, row.kg, row.reps, row.rir, ton, new Date().toISOString()
        ]);
      });
      result = { ok: true, tonelaje: totalTon };
    }

    else if (action === 'saveMedicion') {
      const sheet = getOrCreateSheet(ss, `${clientId}_Mediciones`);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow([
          'Fecha','Peso (kg)','% Grasa','Cintura','Cadera','Pecho',
          'Hombros','Bíceps','Muslo','Gemelo','Comentarios','Timestamp'
        ]);
      }
      sheet.appendRow([
        data.fecha,
        data.peso        || '',
        data.grasa       || '',
        data.cintura     || '',
        data.cadera      || '',
        data.pecho       || '',
        data.hombros     || '',
        data.biceps      || '',
        data.muslo       || '',
        data.gemelo      || '',
        data.comentarios || '',
        new Date().toISOString()
      ]);
      result = { ok: true };
    }

    else if (action === 'saveDieta') {
      const sheet = getOrCreateSheet(ss, `${clientId}_Dieta`);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['Fecha','Tipo día','Comida 1','Comida 2','Comida 3','Comida 4','Comida 5','Timestamp']);
      }
      sheet.appendRow([
        data.fecha, data.tipo_dia || '',
        data.comida1 || '', data.comida2 || '', data.comida3 || '',
        data.comida4 || '', data.comida5 || '',
        new Date().toISOString()
      ]);
      result = { ok: true };
    }

  } catch(err) {
    result = { ok: false, error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── doGet: sirve datos de configuración a la app ──────────────
function doGet(e) {
  const action   = e.parameter.action;
  const clientId = e.parameter.clientId;

  // Sin parámetros → health check
  if (!action || !clientId) {
    return jsonResponse({ status: 'Elevate Athletes API activa' });
  }

  const ss = SpreadsheetApp.openById(SHEET_ID);

  try {
    if (action === 'getSesiones') {
      return jsonResponse(getSesiones(ss, clientId));
    }
    if (action === 'getConfig') {
      return jsonResponse(getConfig(ss, clientId));
    }
    if (action === 'getAll') {
      // Llamada única que devuelve sesiones + config juntos
      return jsonResponse({
        ok:       true,
        sesiones: getSesiones(ss, clientId).sessions,
        config:   getConfig(ss, clientId).config,
      });
    }
  } catch(err) {
    return jsonResponse({ ok: false, error: err.message });
  }

  return jsonResponse({ ok: false, error: 'Acción desconocida' });
}

// ── getSesiones ───────────────────────────────────────────────
// Lee la hoja {clientId}_Sesiones y devuelve los bloques de entrenamiento.
//
// Formato de la hoja (columnas):
//   Sesión | Ejercicio | Series | Reps | RIR | Descanso | Notas
//
// Cada sesión puede tener varios ejercicios (varias filas con el mismo Sesión).
// El entrenador edita esta hoja directamente en Google Sheets.
function getSesiones(ss, clientId) {
  const sheet = ss.getSheetByName(`${clientId}_Sesiones`);
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, sessions: [] };

  const rows = sheet.getDataRange().getValues();
  const sessionMap = {};
  const sessionOrder = [];

  rows.slice(1).forEach(row => {
    const [sesion, ejercicio, series, reps, rir, descanso, notas] = row;
    if (!sesion || !ejercicio) return;
    const key = String(sesion).trim();
    if (!sessionMap[key]) {
      sessionMap[key] = { id: key, name: key, exercises: [] };
      sessionOrder.push(key);
    }
    sessionMap[key].exercises.push({
      name:     String(ejercicio).trim(),
      sets:     parseInt(series) || 3,
      reps:     String(reps || '10').trim(),
      rir:      String(rir  || '2').trim(),
      descanso: String(descanso || '').trim(),
      notas:    String(notas    || '').trim(),
    });
  });

  return {
    ok: true,
    sessions: sessionOrder.map(k => sessionMap[k]),
  };
}

// ── getConfig ─────────────────────────────────────────────────
// Lee la hoja {clientId}_Config (clave → valor) y la devuelve como objeto.
//
// Claves reconocidas por la app:
//   nombre          → Nombre del atleta (aparece en el dashboard)
//   microciclo      → Número de microciclo actual
//   kcal_entreno    → Calorías en día de entreno
//   prot_entreno    → Proteína en día de entreno (g)
//   carbs_entreno   → Carbohidratos en día de entreno (g)
//   fat_entreno     → Grasas en día de entreno (g)
//   kcal_descanso   → Calorías en día de descanso
//   prot_descanso   → Proteína en día de descanso (g)
//   carbs_descanso  → Carbohidratos en día de descanso (g)
//   fat_descanso    → Grasas en día de descanso (g)
function getConfig(ss, clientId) {
  const sheet = ss.getSheetByName(`${clientId}_Config`);
  if (!sheet || sheet.getLastRow() < 2) return { ok: true, config: {} };

  const rows  = sheet.getDataRange().getValues();
  const config = {};
  rows.slice(1).forEach(([key, value]) => {
    if (key) config[String(key).trim()] = value;
  });
  return { ok: true, config };
}

// ── Helpers ───────────────────────────────────────────────────
function getOrCreateSheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════════
// setupNewClient(clientId)
//
// Ejecuta esta función UNA VEZ desde el editor de Apps Script
// para inicializar las hojas de un cliente nuevo con datos de ejemplo.
// Ejemplo: setupNewClient('oscar')
// ════════════════════════════════════════════════════════════════
function setupNewClient(clientId) {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  // ── Config ─────────────────────────────────────────────────
  const config = getOrCreateSheet(ss, `${clientId}_Config`);
  config.clearContents();
  config.appendRow(['Clave', 'Valor']);
  [
    ['nombre',         clientId],
    ['microciclo',     1],
    ['kcal_entreno',   2500],
    ['prot_entreno',   160],
    ['carbs_entreno',  320],
    ['fat_entreno',    65],
    ['kcal_descanso',  2100],
    ['prot_descanso',  160],
    ['carbs_descanso', 210],
    ['fat_descanso',   70],
  ].forEach(row => config.appendRow(row));

  // ── Sesiones ────────────────────────────────────────────────
  const sesiones = getOrCreateSheet(ss, `${clientId}_Sesiones`);
  sesiones.clearContents();
  sesiones.appendRow(['Sesión', 'Ejercicio', 'Series', 'Reps', 'RIR', 'Descanso', 'Notas']);
  [
    // TORSO 1 — Empuje horizontal + hombro + tríceps
    ['TORSO 1', 'Press Banca',           4, '8-10',  2, '2-3 min', 'Controla la bajada 2 seg'],
    ['TORSO 1', 'Press Inclinado',        3, '10-12', 2, '90s',     ''],
    ['TORSO 1', 'Elevaciones Laterales',  4, '12-15', 3, '60s',     'Cable o mancuerna'],
    ['TORSO 1', 'Fondos en paralelas',    3, '10-12', 2, '90s',     'Con lastre si es fácil'],
    ['TORSO 1', 'Press Francés',          3, '10-12', 2, '60s',     ''],
    // TORSO 2 — Tirón vertical + tirón horizontal + bíceps
    ['TORSO 2', 'Dominadas',              4, '6-8',   2, '2-3 min', 'Con lastres si haces >10'],
    ['TORSO 2', 'Remo con barra',         4, '8-10',  2, '2 min',   'Codo a 45° del cuerpo'],
    ['TORSO 2', 'Remo en polea baja',     3, '10-12', 2, '90s',     ''],
    ['TORSO 2', 'Curl Bíceps con barra',  3, '10-12', 2, '60s',     ''],
    ['TORSO 2', 'Curl Martillo',          3, '10-12', 2, '60s',     ''],
    // PIERNA 1 — Cuádriceps + glúteo
    ['PIERNA 1', 'Sentadilla',               4, '6-8',   2, '3 min',   'Profundidad completa'],
    ['PIERNA 1', 'Prensa 45°',              3, '10-12', 2, '2 min',   ''],
    ['PIERNA 1', 'Extensión de cuádriceps', 3, '12-15', 3, '60s',     'Last set con rest-pause'],
    ['PIERNA 1', 'Hip Thrust',              4, '10-12', 2, '90s',     'Pausa arriba 1 seg'],
    ['PIERNA 1', 'Gemelos en prensa',       4, '15-20', 2, '45s',     'Rango completo'],
    // PIERNA 2 — Femoral + glúteo posterior
    ['PIERNA 2', 'Peso Muerto Rumano',   4, '8-10',  2, '2-3 min', 'Sentir el estiramiento'],
    ['PIERNA 2', 'Curl Femoral tumbado', 4, '10-12', 2, '90s',     ''],
    ['PIERNA 2', 'Buenos Días',          3, '10-12', 3, '90s',     'Peso ligero, ROM amplio'],
    ['PIERNA 2', 'Abductores en cable',  3, '15',    3, '60s',     ''],
    ['PIERNA 2', 'Gemelos de pie',       4, '12-15', 2, '60s',     ''],
  ].forEach(row => sesiones.appendRow(row));

  // ── Hojas de registro (vacías con cabeceras) ─────────────
  const peso = getOrCreateSheet(ss, `${clientId}_Peso`);
  if (peso.getLastRow() === 0) peso.appendRow(['Fecha', 'Peso (kg)', 'Timestamp']);

  const feedback = getOrCreateSheet(ss, `${clientId}_Feedback`);
  if (feedback.getLastRow() === 0) {
    feedback.appendRow(['Fecha','Energía','Recuperación','Sueño','Dieta','Bienestar','Motivación','Comentarios','Timestamp']);
  }

  const entreno = getOrCreateSheet(ss, `${clientId}_Entreno`);
  if (entreno.getLastRow() === 0) {
    entreno.appendRow(['Fecha','Sesión','Ejercicio','Serie','Kg','Reps','RIR','Tonelaje','Timestamp']);
  }

  const mediciones = getOrCreateSheet(ss, `${clientId}_Mediciones`);
  if (mediciones.getLastRow() === 0) {
    mediciones.appendRow(['Fecha','Peso (kg)','% Grasa','Cintura','Cadera','Pecho','Hombros','Bíceps','Muslo','Gemelo','Comentarios','Timestamp']);
  }

  const dieta = getOrCreateSheet(ss, `${clientId}_Dieta`);
  if (dieta.getLastRow() === 0) {
    dieta.appendRow(['Fecha','Tipo día','Comida 1','Comida 2','Comida 3','Comida 4','Comida 5','Timestamp']);
  }

  Logger.log(`✅ Cliente "${clientId}" configurado con ${sesiones.getLastRow()-1} ejercicios.`);
}
