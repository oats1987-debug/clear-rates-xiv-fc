function requireProperty(value, name) {
  if (!value) {
    throw new Error('Missing required script property: ' + name);
  }
  return value;
}

function getWorkbook() {
  const config = getConfig();
  if (config.sheetId) {
    return SpreadsheetApp.openById(config.sheetId);
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error('No active spreadsheet found. Set SHEET_ID in script properties.');
  }
  return active;
}

function getOrCreateSheet(workbook, name, headers) {
  let sheet = workbook.getSheetByName(name);
  if (!sheet) {
    sheet = workbook.insertSheet(name);
  }
  if (headers && headers.length) {
    const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const needsHeader = current.join('') === '' || current.join('|') !== headers.join('|');
    if (needsHeader) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function todayString() {
  const config = getConfig();
  return Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd');
}

function sleepBetweenRequests() {
  const delay = getConfig().minRequestDelayMs;
  if (delay > 0) {
    Utilities.sleep(delay);
  }
}

function percent(numerator, denominator) {
  if (!denominator) return '0.00%';
  return (numerator / denominator * 100).toFixed(2) + '%';
}

function htmlDecode(value) {
  if (!value) return '';
  return value
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

function slugifyName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9'-]/g, '');
}

