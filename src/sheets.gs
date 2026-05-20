const SHEET_ROSTER = 'Roster';
const SHEET_SNAPSHOTS = 'Snapshots';
const SHEET_EVIDENCE = 'Evidence';
const SHEET_RUNS = 'Runs';

function setupWorkbook() {
  const workbook = getWorkbook();
  getOrCreateSheet(workbook, SHEET_ROSTER, ['snapshot_date', 'lodestone_id', 'name', 'world', 'data_center', 'rank', 'included']);
  getOrCreateSheet(workbook, SHEET_SNAPSHOTS, ['snapshot_date', 'encounter', 'clears', 'roster_size', 'clear_rate']);
  getOrCreateSheet(workbook, SHEET_EVIDENCE, ['snapshot_date', 'lodestone_id', 'name', 'world', 'encounter', 'cleared', 'source', 'raw_summary']);
  getOrCreateSheet(workbook, SHEET_RUNS, ['run_at', 'status', 'message']);
}

function writeRosterSnapshot(members) {
  const workbook = getWorkbook();
  const sheet = getOrCreateSheet(workbook, SHEET_ROSTER, ['snapshot_date', 'lodestone_id', 'name', 'world', 'data_center', 'rank', 'included']);
  const date = todayString();
  const rows = members.map(function(member) {
    return [date, member.lodestoneId, member.name, member.world, member.dataCenter, member.rank, true];
  });
  appendRows(sheet, rows);
}

function writeClearSnapshot(results, rosterSize) {
  const workbook = getWorkbook();
  const snapshotSheet = getOrCreateSheet(workbook, SHEET_SNAPSHOTS, ['snapshot_date', 'encounter', 'clears', 'roster_size', 'clear_rate']);
  const evidenceSheet = getOrCreateSheet(workbook, SHEET_EVIDENCE, ['snapshot_date', 'lodestone_id', 'name', 'world', 'encounter', 'cleared', 'source', 'raw_summary']);
  const date = todayString();

  const byEncounter = {};
  results.forEach(function(result) {
    if (!byEncounter[result.encounterLabel]) byEncounter[result.encounterLabel] = 0;
    if (result.cleared) byEncounter[result.encounterLabel] += 1;
  });

  const snapshotRows = Object.keys(byEncounter).map(function(encounter) {
    const clears = byEncounter[encounter];
    return [date, encounter, clears, rosterSize, percent(clears, rosterSize)];
  });

  const evidenceRows = results.map(function(result) {
    return [date, result.lodestoneId, result.name, result.world, result.encounterLabel, result.cleared, result.source, result.rawSummary];
  });

  appendRows(snapshotSheet, snapshotRows);
  appendRows(evidenceSheet, evidenceRows);

  return snapshotRows.map(function(row) {
    return { date: row[0], encounter: row[1], clears: row[2], rosterSize: row[3], rate: row[4] };
  });
}

function getConfirmedClearMap() {
  const workbook = getWorkbook();
  const sheet = getOrCreateSheet(workbook, SHEET_EVIDENCE, ['snapshot_date', 'lodestone_id', 'name', 'world', 'encounter', 'cleared', 'source', 'raw_summary']);
  const values = sheet.getDataRange().getValues();
  const confirmed = {};

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const lodestoneId = String(row[1] || '');
    const encounter = String(row[4] || '');
    const cleared = row[5] === true || String(row[5]).toLowerCase() === 'true';
    if (lodestoneId && encounter && cleared) {
      confirmed[lodestoneId + '|' + encounter] = true;
    }
  }

  return confirmed;
}

function buildSnapshotResults(members, encounters, newResults, confirmedClearMap) {
  const latest = {};
  newResults.forEach(function(result) {
    latest[result.lodestoneId + '|' + result.encounterLabel] = result;
  });

  const results = [];
  members.forEach(function(member) {
    encounters.forEach(function(encounter) {
      const key = member.lodestoneId + '|' + encounter.label;
      if (latest[key]) {
        results.push(latest[key]);
      } else if (confirmedClearMap[key]) {
        results.push({
          lodestoneId: member.lodestoneId,
          name: member.name,
          world: member.world,
          encounterKey: encounter.key,
          encounterLabel: encounter.label,
          encounterId: encounter.fflogsEncounterId,
          cleared: true,
          source: 'previously-confirmed',
          rawSummary: ''
        });
      } else {
        results.push({
          lodestoneId: member.lodestoneId,
          name: member.name,
          world: member.world,
          encounterKey: encounter.key,
          encounterLabel: encounter.label,
          encounterId: encounter.fflogsEncounterId,
          cleared: false,
          source: 'not-checked',
          rawSummary: ''
        });
      }
    });
  });

  return results;
}

function appendRows(sheet, rows) {
  if (!rows.length) return;
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function logRun(status, message) {
  const workbook = getWorkbook();
  const sheet = getOrCreateSheet(workbook, SHEET_RUNS, ['run_at', 'status', 'message']);
  sheet.appendRow([new Date(), status, message || '']);
}
