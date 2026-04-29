// ════════════════════════════════════════════════════════
// GOOGLE APPS SCRIPT — Backend para Elevate Athletes PWA
// Pega este código en script.google.com y despliega como
// Web App (Execute as: Me | Who has access: Anyone)
// ════════════════════════════════════════════════════════

const SHEET_ID = 'TU_SHEET_ID_AQUI'; // mismo ID que en index.html

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
        sheet.appendRow(['Fecha','Sesión','Serie','Kg','Reps','RIR','Tonelaje','Timestamp']);
      }
      let totalTon = 0;
      data.rows.forEach((row, i) => {
        const ton = (parseFloat(row.kg)||0) * (parseFloat(row.reps)||0);
        totalTon += ton;
        sheet.appendRow([data.date, data.session, i+1, row.kg, row.reps, row.rir, ton, '']);
      });
      // Update last row timestamp and total
      result = { ok: true, tonelaje: totalTon };
    }

    else if (action === 'saveMedicion') {
      const sheet = getOrCreateSheet(ss, `${clientId}_Mediciones`);
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['Fecha','Cintura','Cadera','Pecho','Bíceps','Muslo','Gemelo','Hombros','Peso','Timestamp']);
      }
      sheet.appendRow([
        data.fecha, data.cintura||'', data.cadera||'', data.pecho||'',
        data.biceps||'', data.muslo||'', data.gemelo||'', data.hombros||'',
        data.peso||'', new Date().toISOString()
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

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'Elevate Athletes API activa' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
