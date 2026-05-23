const PUBLIC_SUMMARY_PROPERTY = 'PUBLIC_SUMMARY_JSON';

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || 'summary';
  let result;

  try {
    if (action === 'summary') {
      result = buildPublicSummaryData();
    } else {
      result = { ok: false, error: 'Unknown action.' };
    }
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }

  return publicApiOutput(result, params.callback);
}

function buildPublicSummaryData() {
  const stored = PropertiesService.getScriptProperties().getProperty(PUBLIC_SUMMARY_PROPERTY);
  if (stored) {
    return JSON.parse(stored);
  }

  const cached = CacheService.getScriptCache().get('PUBLIC_SUMMARY_DATA');
  if (cached) {
    return JSON.parse(cached);
  }

  setupWorkbook();

  const config = getConfig();
  const workbook = getWorkbook();
  const snapshotSheet = getOrCreateSheet(workbook, SHEET_SNAPSHOTS, ['snapshot_date', 'encounter', 'clears', 'roster_size', 'clear_rate']);
  const snapshotValues = snapshotSheet.getDataRange().getValues();
  const encounterLabels = config.encounters.map(function(encounter) {
    return encounter.label;
  });
  const latestSnapshots = {};

  for (let i = 1; i < snapshotValues.length; i++) {
    const row = snapshotValues[i];
    const encounter = String(row[1] || '');
    if (!encounter) continue;

    latestSnapshots[encounter] = {
      date: publicDateValue(row[0]),
      encounter: encounter,
      clears: Number(row[2] || 0),
      rosterSize: Number(row[3] || 0),
      clearRate: String(row[4] || '')
    };
  }

  const summary = encounterLabels.map(function(label) {
    const snapshot = latestSnapshots[label];
    return snapshot || {
      date: todayString(),
      encounter: label,
      clears: 0,
      rosterSize: 0,
      clearRate: '0.00%'
    };
  });

  const result = {
    ok: true,
    fcName: config.fcName,
    generatedAt: publicDateValue(new Date()),
    summary: summary
  };

  CacheService.getScriptCache().put('PUBLIC_SUMMARY_DATA', JSON.stringify(result), 300);
  PropertiesService.getScriptProperties().setProperty(PUBLIC_SUMMARY_PROPERTY, JSON.stringify(result));
  return result;
}

function savePublicSummaryData(summaryRows) {
  const result = {
    ok: true,
    fcName: getConfig().fcName,
    generatedAt: publicDateValue(new Date()),
    summary: summaryRows.map(function(row) {
      return {
        date: row.date || todayString(),
        encounter: row.encounter,
        clears: Number(row.clears || 0),
        rosterSize: Number(row.rosterSize || 0),
        clearRate: row.rate || row.clearRate || percent(Number(row.clears || 0), Number(row.rosterSize || 0))
      };
    })
  };

  const jsonText = JSON.stringify(result);
  PropertiesService.getScriptProperties().setProperty(PUBLIC_SUMMARY_PROPERTY, jsonText);
  CacheService.getScriptCache().put('PUBLIC_SUMMARY_DATA', jsonText, 300);
  return result;
}

function refreshPublicSummaryDataFromSnapshots() {
  PropertiesService.getScriptProperties().deleteProperty(PUBLIC_SUMMARY_PROPERTY);
  CacheService.getScriptCache().remove('PUBLIC_SUMMARY_DATA');
  const result = buildPublicSummaryData();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function publicApiOutput(result, callback) {
  const jsonText = JSON.stringify(result);
  if (callback) {
    const safeCallback = String(callback).replace(/[^A-Za-z0-9_.$]/g, '');
    return ContentService
      .createTextOutput(safeCallback + '(' + jsonText + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(jsonText)
    .setMimeType(ContentService.MimeType.JSON);
}

function publicDateValue(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, getConfig().timezone, 'yyyy-MM-dd HH:mm:ss');
  }
  return String(value);
}
