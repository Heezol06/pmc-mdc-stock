// PMC Medicine Stock Register — Google Sheets backend
// Paste this into Extensions > Apps Script on the target Google Sheet, then
// deploy as a Web App (see GOOGLE_SHEETS_SETUP.md for exact steps).
//
// Data model:
//   - "Medicines", "Entries", "ActivityLog", "Settings" tabs are the real
//     database: index.html reads/writes these in full on every load/save.
//   - "Sheet1" is a human-readable view only — it's regenerated from scratch
//     on every save to match the wide "medicine x date" register layout,
//     but the app never reads it back (some info, like exact timestamps and
//     the activity log, can't be reconstructed from that view alone).

const SECRET = 'ed1336dec5ab0e0b16a04ef52c45bf2ba3f143cb5ee0eb38'; // must match GAS_KEY in index.html

const MED_COLS = ['id', 'name', 'stock', 'usage'];
const ENTRY_COLS = ['id', 'date', 'medId', 'medName', 'type', 'qty', 'stockAfter', 'prevStock', 'createdAt'];
const LOG_COLS = ['id', 'ts', 'summary'];

function doGet(e) {
  const key = e && e.parameter && e.parameter.key;
  if (key !== SECRET) return jsonOutput({ error: 'unauthorized' });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const medicines = readTable(ss, 'Medicines', MED_COLS).map(m => ({
    id: String(m.id), name: String(m.name), stock: Number(m.stock) || 0, usage: Number(m.usage) || 0,
  }));
  const entries = readTable(ss, 'Entries', ENTRY_COLS).map(r => ({
    id: String(r.id), date: formatDateCell(r.date), medId: String(r.medId), medName: String(r.medName),
    type: String(r.type), qty: Number(r.qty) || 0, stockAfter: Number(r.stockAfter) || 0,
    prevStock: Number(r.prevStock) || 0, createdAt: String(r.createdAt),
  }));
  const activityLog = readTable(ss, 'ActivityLog', LOG_COLS).map(r => ({
    id: String(r.id), ts: String(r.ts), summary: String(r.summary),
  }));
  const settings = readSettings(ss);

  return jsonOutput({
    medicines: medicines,
    entries: entries,
    activityLog: activityLog,
    recentMedIds: settings.recentMedIds ? String(settings.recentMedIds).split(',').filter(Boolean) : [],
    lastEntryId: settings.lastEntryId || null,
    lang: settings.lang === 'bn' ? 'bn' : 'en',
    dark: settings.dark === true || settings.dark === 'true',
  });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput({ error: 'invalid_json' });
  }
  if (body.key !== SECRET) return jsonOutput({ error: 'unauthorized' });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  writeTable(ss, 'Medicines', MED_COLS, body.medicines || []);
  writeTable(ss, 'Entries', ENTRY_COLS, body.entries || []);
  writeTable(ss, 'ActivityLog', LOG_COLS, body.activityLog || []);
  writeSettings(ss, {
    lang: body.lang || 'en',
    dark: !!body.dark,
    lastEntryId: body.lastEntryId || '',
    recentMedIds: Array.isArray(body.recentMedIds) ? body.recentMedIds.join(',') : '',
  });
  if (body.register) writeRegister(ss, body.register);

  return jsonOutput({ ok: true });
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function formatDateCell(v) {
  if (v instanceof Date) {
    const tz = Session.getScriptTimeZone();
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return String(v);
}

function getOrCreateSheet(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function ensureSize(sh, neededRows, neededCols) {
  const curRows = sh.getMaxRows();
  const curCols = sh.getMaxColumns();
  if (neededRows > curRows) sh.insertRowsAfter(curRows, neededRows - curRows);
  if (neededCols > curCols) sh.insertColumnsAfter(curCols, neededCols - curCols);
}

function clearSheet(sh) {
  const maxRows = sh.getMaxRows();
  const maxCols = sh.getMaxColumns();
  const full = sh.getRange(1, 1, maxRows, maxCols);
  try { full.breakApart(); } catch (err) {} // drop any stale merges before rewriting
  full.clearContent();
}

function readTable(ss, name, cols) {
  const sh = ss.getSheetByName(name);
  if (!sh) return [];
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  return values.slice(1)
    .filter(row => row.some(c => c !== '' && c !== null))
    .map(row => {
      const obj = {};
      cols.forEach((c, i) => { obj[c] = row[i]; });
      return obj;
    });
}

function writeTable(ss, name, cols, records) {
  const sh = getOrCreateSheet(ss, name);
  clearSheet(sh);
  const rows = [cols].concat(records.map(r => cols.map(c => (r[c] !== undefined && r[c] !== null) ? r[c] : '')));
  ensureSize(sh, rows.length, cols.length);
  sh.getRange(1, 1, rows.length, cols.length).setValues(rows);
}

function readSettings(ss) {
  const sh = ss.getSheetByName('Settings');
  if (!sh) return {};
  const values = sh.getDataRange().getValues();
  const out = {};
  values.forEach(row => { if (row[0]) out[row[0]] = row[1]; });
  return out;
}

function writeSettings(ss, obj) {
  const sh = getOrCreateSheet(ss, 'Settings');
  clearSheet(sh);
  const rows = Object.keys(obj).map(k => [k, obj[k]]);
  if (rows.length) {
    ensureSize(sh, rows.length, 2);
    sh.getRange(1, 1, rows.length, 2).setValues(rows);
  }
}

// Regenerates the human-facing "Sheet1" pivot to match the original register
// layout: Medicine Name / Opening Balance / repeating In-Out-PS per date.
function writeRegister(ss, register) {
  const rows = register.rows || [];
  const dates = register.dates || [];
  if (!rows.length) return;
  const numCols = rows[0].length;

  const sh = getOrCreateSheet(ss, 'Sheet1');
  clearSheet(sh);
  ensureSize(sh, rows.length, numCols);
  sh.getRange(1, 1, rows.length, numCols).setValues(rows);

  sh.getRange(1, 1, 2, 1).merge();     // Medicine Name (rows 1-2)
  sh.getRange(1, 3, 2, 1).merge();     // Opening Balance (rows 1-2)
  let col = 4;
  dates.forEach(d => {
    sh.getRange(1, col, 1, 3).merge(); // date header spans its In/Out/PS columns
    sh.getRange(1, col).setValue(new Date(d + 'T00:00:00')).setNumberFormat('d-mmm-yy');
    col += 3;
  });
  sh.getRange(1, col, 2, 1).merge();   // Month Closing Balance (rows 1-2)
  sh.setFrozenRows(2);
}
